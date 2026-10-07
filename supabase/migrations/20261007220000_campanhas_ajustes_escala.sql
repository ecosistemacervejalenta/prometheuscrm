-- =============================================================================
-- PROMETHEUS CRM · CAMPANHAS — AJUSTES DE ESCALA E CONCORRÊNCIA
--   • Trava única da rotina de envio: o limite diário da Meta vale para o número
--     inteiro, então só uma rodada por vez confere o limite e envia.
--   • vw_campanhas calcula os números só das campanhas consultadas (LATERAL).
--   • Reserva da fila: descadastros conferidos só no começo da fila (custo por lote).
--   • Respostas ligadas pela mensagem respondida ou pelo número (consultas com índice);
--     contatos que escondem o número (IDs da Meta) são ligados só pela mensagem respondida.
--   • Status do webhook gravados em lote (a Meta manda até 1.000 por aviso).
--   • Mensagens retidas pela Meta para avaliação de qualidade: a campanha espera e continua.
-- =============================================================================

-- Espera da Meta (avaliação de qualidade) -------------------------------------------------

alter table public.campanhas add column aguardar_ate timestamptz;

comment on column public.campanhas.aguardar_ate is 'A rotina só volta a enviar esta campanha a partir daqui (ex.: Meta avaliando a qualidade das primeiras mensagens).';

alter table public.campanhas drop constraint campanhas_pausada_motivo_check;
alter table public.campanhas add constraint campanhas_pausada_motivo_check
  check (pausada_motivo is null or pausada_motivo in ('equipe', 'erro', 'modelo', 'limite', 'retida'));

comment on column public.campanhas.pausada_motivo is 'equipe = pausada na tela; erro = problema da conta/modelo; modelo = a Meta pausou o modelo; limite = esperando o limite diário; retida = Meta avaliando a qualidade (as duas últimas seguem "enviando").';

-- Trava da rotina ------------------------------------------------------------------

alter table public.whatsapp_oficial add column rotina_desde timestamptz;

comment on column public.whatsapp_oficial.rotina_desde is 'Rodada de envio em andamento (trava; vence sozinha após 6 min).';

create or replace function public.travar_rotina_campanhas()
returns boolean
language sql
security definer
set search_path = ''
as $$
  with travada as (
    update public.whatsapp_oficial
    set rotina_desde = now()
    where id = 1 and (rotina_desde is null or rotina_desde < now() - interval '6 minutes')
    returning 1
  )
  select exists (select 1 from travada);
$$;

create or replace function public.destravar_rotina_campanhas()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.whatsapp_oficial set rotina_desde = null where id = 1;
$$;

-- Números das campanhas ----------------------------------------------------------------

-- LATERAL: com "order by criado_em limit 200" (lista) ou "where id = ..." (detalhe), só as
-- campanhas pedidas têm os envios contados.
drop view public.vw_campanhas;

create view public.vw_campanhas
with (security_invoker = true)
as
select c.*, n.pendentes, n.enviadas, n.entregues, n.lidas, n.respostas, n.falhas, n.ignoradas, n.sairam
from public.campanhas c
cross join lateral (
  select
    count(*) filter (where e.status in ('pendente', 'enviando'))::integer as pendentes,
    count(*) filter (where e.enviada_em is not null)::integer            as enviadas,
    count(*) filter (where e.entregue_em is not null)::integer           as entregues,
    count(*) filter (where e.lida_em is not null)::integer               as lidas,
    count(*) filter (where e.respondida_em is not null)::integer         as respostas,
    count(*) filter (where e.status = 'falhou')::integer                 as falhas,
    count(*) filter (where e.status = 'ignorada')::integer               as ignoradas,
    count(*) filter (where e.saiu_em is not null)::integer               as sairam
  from public.campanha_envios e
  where e.campanha_id = c.id
) n;

revoke all on public.vw_campanhas from anon;
grant select on public.vw_campanhas to authenticated, service_role;

create index campanhas_criado_em_idx on public.campanhas (criado_em desc);
create index campanhas_lista_idx on public.campanhas (lista_id) where lista_id is not null;
create index campanhas_criado_por_idx on public.campanhas (criado_por) where criado_por is not null;

-- Reserva da fila --------------------------------------------------------------------

create or replace function public.reservar_envios_campanha(p_campanha_id uuid, p_limite integer)
returns table (id bigint, whatsapp text, nome text, tentativas smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ignorados integer;
begin
  -- Reserva de uma rotina interrompida: a mensagem pode ter saído. Não reenvia (mensagem
  -- repetida gera bloqueios e derruba a qualidade do número).
  update public.campanha_envios e
  set status = 'falhou', erro = 'Envio interrompido — a mensagem pode ou não ter chegado.', reservado_em = null
  where e.campanha_id = p_campanha_id and e.status = 'enviando' and e.reservado_em < now() - interval '10 minutes';

  -- Quem pediu para sair depois da confirmação: confere só o começo da fila (o próximo lote),
  -- repetindo até ele ficar limpo — o custo acompanha o lote, não a campanha inteira.
  loop
    update public.campanha_envios e
    set status = 'ignorada', erro = 'Pediu para não receber campanhas.'
    where e.id in (
      select f.id from public.campanha_envios f
      where f.campanha_id = p_campanha_id
        and f.status = 'pendente'
        and (f.proxima_tentativa_em is null or f.proxima_tentativa_em <= now())
      order by f.id
      limit greatest(p_limite, 0)
    )
    and exists (select 1 from public.whatsapp_descadastros d where d.whatsapp = e.whatsapp);
    get diagnostics v_ignorados = row_count;
    exit when v_ignorados = 0;
  end loop;

  return query
  update public.campanha_envios e
  set status = 'enviando', reservado_em = now(), tentativas = e.tentativas + 1
  where e.id in (
    select f.id from public.campanha_envios f
    where f.campanha_id = p_campanha_id
      and f.status = 'pendente'
      and (f.proxima_tentativa_em is null or f.proxima_tentativa_em <= now())
    order by f.id
    limit greatest(p_limite, 0)
    for update skip locked
  )
  returning e.id, e.whatsapp, e.nome, e.tentativas;
end;
$$;

-- Respostas ------------------------------------------------------------------------------

create or replace function public.registrar_resposta_campanha(
  p_wa_id    text,
  p_texto    text,
  p_quando   timestamptz,
  p_saiu     boolean,
  p_contexto text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- O wa_id da Meta já vem com DDI: só falta o 9º dígito de celulares do Brasil.
  v_numero        text := nullif(public.whatsapp_canonico(p_wa_id), '');
  v_envio         public.campanha_envios;
  v_pelo_contexto boolean := false;
begin
  -- 1) A mensagem respondida (botão ou "responder"): índice único de wamid.
  if p_contexto is not null then
    select * into v_envio from public.campanha_envios e where e.wamid = p_contexto;
    v_pelo_contexto := v_envio.id is not null;
  end if;
  -- 2) Senão, o último envio para o número nos últimos 30 dias: índice (whatsapp, enviada_em).
  if v_envio.id is null and v_numero is not null then
    select * into v_envio from public.campanha_envios e
    where e.whatsapp = v_numero and e.enviada_em > now() - interval '30 days'
    order by e.enviada_em desc
    limit 1;
  end if;

  if v_envio.id is not null then
    update public.campanha_envios
    set respondida_em = coalesce(respondida_em, p_quando),
        resposta      = coalesce(left(nullif(trim(p_texto), ''), 1000), resposta),
        saiu_em       = case when p_saiu then coalesce(saiu_em, p_quando) else saiu_em end
    where id = v_envio.id;
  end if;

  if p_saiu and coalesce(v_envio.whatsapp, v_numero) is not null then
    insert into public.whatsapp_descadastros (whatsapp, origem, campanha_id)
    values (coalesce(v_envio.whatsapp, v_numero), case when v_pelo_contexto then 'botao' else 'mensagem' end, v_envio.campanha_id)
    on conflict (whatsapp) do nothing;
  end if;
end;
$$;

-- Status do webhook em lote ----------------------------------------------------------------

-- Cada item: { wamid, status (sent|delivered|read|failed), quando, erro_codigo, erro }.
-- Vários status da mesma mensagem no mesmo aviso são somados; nenhum status volta atrás.
create or replace function public.atualizar_status_envios_campanha(p_status jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  with itens as (
    select * from jsonb_to_recordset(p_status) as s(wamid text, status text, quando timestamptz, erro_codigo integer, erro text)
  ),
  por_mensagem as (
    select
      wamid,
      min(quando)                                                         as primeiro,
      min(quando) filter (where status in ('delivered', 'read'))          as entregue,
      min(quando) filter (where status = 'read')                          as lida,
      bool_or(status = 'failed')                                          as falhou,
      (array_agg(erro_codigo order by quando desc) filter (where status = 'failed'))[1] as erro_codigo,
      (array_agg(erro order by quando desc) filter (where status = 'failed'))[1]        as erro
    from itens
    where wamid is not null
    group by wamid
  )
  update public.campanha_envios e
  set enviada_em  = coalesce(e.enviada_em, m.primeiro),
      entregue_em = coalesce(e.entregue_em, m.entregue),
      lida_em     = coalesce(e.lida_em, m.lida),
      status = case
        when m.falhou then 'falhou'::public.status_envio_campanha
        when m.lida is not null and e.status in ('enviando', 'enviada', 'entregue') then 'lida'
        when m.entregue is not null and e.status in ('enviando', 'enviada') then 'entregue'
        else e.status
      end,
      erro_codigo = case when m.falhou then m.erro_codigo else e.erro_codigo end,
      erro        = case when m.falhou then m.erro else e.erro end
  from por_mensagem m
  where e.wamid = m.wamid;
$$;

drop function public.atualizar_status_envio_campanha(text, text, timestamptz, integer, text);

-- Permissões (as funções novas são só do servidor) -----------------------------------

revoke execute on function
  public.travar_rotina_campanhas(),
  public.destravar_rotina_campanhas(),
  public.atualizar_status_envios_campanha(jsonb)
from public, anon, authenticated;

grant execute on function
  public.travar_rotina_campanhas(),
  public.destravar_rotina_campanhas(),
  public.atualizar_status_envios_campanha(jsonb)
to service_role;
