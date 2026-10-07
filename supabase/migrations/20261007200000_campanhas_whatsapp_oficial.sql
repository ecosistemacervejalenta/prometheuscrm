-- =============================================================================
-- PROMETHEUS CRM · CAMPANHAS NO WHATSAPP OFICIAL (API Cloud da Meta)
--   • whatsapp_oficial: conexão com a Meta (linha única), preenchida pelo admin
--     em Configurações › WhatsApp oficial. O token e a chave secreta do app
--     ficam CRIPTOGRAFADOS no Supabase Vault e só o servidor os lê
--     (credenciais_whatsapp_oficial, exclusiva da service role).
--   • campanhas → campanha_envios: cada campanha vira um modelo (template)
--     analisado pela Meta e uma fila com um envio por número. A rotina
--     /api/cron/campanhas envia respeitando o limite diário do número; o
--     webhook /api/webhooks/whatsapp-oficial traz entregas, leituras e respostas.
--   • whatsapp_descadastros: quem pediu para não receber mais campanhas.
-- =============================================================================

-- Conexão --------------------------------------------------------------------------

create table public.whatsapp_oficial (
  id                   smallint primary key default 1 check (id = 1),
  app_id               text,
  phone_number_id      text,
  waba_id              text,
  -- Senha que a Meta envia ao validar o webhook (gerada aqui, copiada para a Meta).
  token_verificacao    text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  -- Dados do número, atualizados pelo servidor a cada verificação.
  numero               text,
  nome_verificado      text,
  qualidade            text,
  limite_tier          text,
  status_nome          text,
  conectado_em         timestamptz,
  conectado_por        uuid references public.perfis (id) on delete set null,
  verificado_em        timestamptz,
  webhook_recebido_em  timestamptz,
  ultimo_erro          text,
  atualizado_em        timestamptz not null default now()
);

comment on table public.whatsapp_oficial is 'Conexão com a API Cloud do WhatsApp (linha única). Token e chave secreta ficam no Vault (whatsapp_oficial_token / whatsapp_oficial_app_secret).';
comment on column public.whatsapp_oficial.limite_tier is 'Limite de contatos por dia informado pela Meta (ex.: TIER_250, TIER_2K, TIER_UNLIMITED).';

create trigger whatsapp_oficial_atualizado_em
  before update on public.whatsapp_oficial
  for each row execute function public.definir_atualizado_em();

alter table public.whatsapp_oficial enable row level security;
-- Sem políticas: a equipe vê só o status, pela função status_whatsapp_oficial().

-- Status para a interface (nunca devolve o token nem a chave secreta).
-- O token de verificação do webhook só aparece para administradores.
create or replace function public.status_whatsapp_oficial()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.eh_membro_equipe() then (
    select jsonb_build_object(
      'configurado', w.phone_number_id is not null and w.waba_id is not null
                     and exists (select 1 from vault.secrets s where s.name = 'whatsapp_oficial_token'),
      'tem_app_secret', exists (select 1 from vault.secrets s where s.name = 'whatsapp_oficial_app_secret'),
      'app_id', w.app_id,
      'phone_number_id', w.phone_number_id,
      'waba_id', w.waba_id,
      'numero', w.numero,
      'nome_verificado', w.nome_verificado,
      'qualidade', w.qualidade,
      'limite_tier', w.limite_tier,
      'status_nome', w.status_nome,
      'conectado_em', w.conectado_em,
      'verificado_em', w.verificado_em,
      'webhook_recebido_em', w.webhook_recebido_em,
      'ultimo_erro', w.ultimo_erro,
      'token_verificacao', case when public.eh_admin() then w.token_verificacao end
    )
    from (select 1) as sempre
    left join public.whatsapp_oficial w on w.id = 1
  ) end;
$$;

-- Guarda (ou troca) um segredo do Vault pelo nome.
create or replace function public.guardar_segredo_whatsapp_oficial(p_nome text, p_valor text, p_descricao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_nome;
  if v_id is null then
    perform vault.create_secret(p_valor, p_nome, p_descricao);
  else
    perform vault.update_secret(v_id, p_valor);
  end if;
end;
$$;

-- Salva a conexão (só administradores). Token e chave secreta vazios mantêm os já salvos.
-- Quem confere os dados na Meta é o servidor, logo em seguida.
create or replace function public.salvar_whatsapp_oficial(
  p_app_id          text,
  p_phone_number_id text,
  p_waba_id         text,
  p_token           text,
  p_app_secret      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores conectam o WhatsApp oficial.' using errcode = '42501';
  end if;

  if nullif(trim(p_token), '') is not null then
    perform public.guardar_segredo_whatsapp_oficial('whatsapp_oficial_token', trim(p_token), 'Token permanente da API do WhatsApp (Meta)');
  elsif not exists (select 1 from vault.secrets where name = 'whatsapp_oficial_token') then
    raise exception 'Cole o token de acesso.';
  end if;

  if nullif(trim(p_app_secret), '') is not null then
    perform public.guardar_segredo_whatsapp_oficial('whatsapp_oficial_app_secret', trim(p_app_secret), 'Chave secreta do app da Meta (assinatura do webhook)');
  elsif not exists (select 1 from vault.secrets where name = 'whatsapp_oficial_app_secret') then
    raise exception 'Cole a chave secreta do app.';
  end if;

  insert into public.whatsapp_oficial (id, app_id, phone_number_id, waba_id, conectado_em, conectado_por, ultimo_erro)
  values (1, trim(p_app_id), trim(p_phone_number_id), trim(p_waba_id), now(), auth.uid(), null)
  on conflict (id) do update set
    app_id          = excluded.app_id,
    phone_number_id = excluded.phone_number_id,
    waba_id         = excluded.waba_id,
    conectado_em    = excluded.conectado_em,
    conectado_por   = excluded.conectado_por,
    ultimo_erro     = null;
end;
$$;

-- Desconecta: apaga o token e a chave secreta. As campanhas ficam no histórico.
create or replace function public.desconectar_whatsapp_oficial()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores desconectam o WhatsApp oficial.' using errcode = '42501';
  end if;
  delete from vault.secrets where name in ('whatsapp_oficial_token', 'whatsapp_oficial_app_secret');
  update public.whatsapp_oficial
  set conectado_em = null, numero = null, nome_verificado = null, qualidade = null, limite_tier = null,
      status_nome = null, verificado_em = null, ultimo_erro = null
  where id = 1;
end;
$$;

-- Credenciais completas (com o token aberto). EXCLUSIVA do servidor (service role).
create or replace function public.credenciais_whatsapp_oficial()
returns table (app_id text, phone_number_id text, waba_id text, token text, app_secret text, token_verificacao text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    w.app_id,
    w.phone_number_id,
    w.waba_id,
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'whatsapp_oficial_token'),
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'whatsapp_oficial_app_secret'),
    w.token_verificacao
  from public.whatsapp_oficial w
  where w.id = 1;
$$;

-- Descadastros ----------------------------------------------------------------------

create table public.whatsapp_descadastros (
  whatsapp     text primary key,
  origem       text not null check (origem in ('botao', 'mensagem', 'meta', 'equipe')),
  campanha_id  uuid,
  criado_em    timestamptz not null default now()
);

comment on table public.whatsapp_descadastros is 'Quem pediu para não receber campanhas (botão "Não quero receber", mensagem "sair" ou bloqueio de marketing na Meta). Ficam fora das próximas campanhas.';
comment on column public.whatsapp_descadastros.whatsapp is 'Número canônico (whatsapp_canonico).';

-- Campanhas -------------------------------------------------------------------------

create type public.status_campanha as enum (
  'preparando',            -- contatos sendo enviados pelo navegador
  'aguardando_aprovacao',  -- modelo em análise na Meta
  'agendada',              -- modelo aprovado, esperando o horário
  'enviando',
  'pausada',
  'concluida',
  'recusada',              -- a Meta recusou o modelo
  'cancelada',
  'falhou'                 -- não foi possível enviar o modelo para análise
);

create type public.status_envio_campanha as enum ('pendente', 'enviando', 'enviada', 'entregue', 'lida', 'falhou', 'ignorada');

create table public.campanhas (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null check (length(trim(nome)) between 1 and 80),
  status              public.status_campanha not null default 'preparando',
  -- Mensagem
  texto               text not null check (length(trim(texto)) between 1 and 1024),
  nome_padrao         text not null default 'cliente' check (length(trim(nome_padrao)) between 1 and 30),
  rodape              text check (rodape is null or length(rodape) <= 60),
  botao_texto         text check (botao_texto is null or length(botao_texto) between 1 and 25),
  botao_url           text check (botao_url is null or botao_url ~ '^https://'),
  botao_sair          boolean not null default true,
  imagem_path         text,
  -- Modelo (template) na Meta
  modelo_nome         text,
  modelo_id           text,
  modelo_status       text,
  modelo_categoria    text,
  modelo_motivo       text,
  modelo_assinatura   text,
  -- Público
  origem              text not null check (origem in ('arquivo', 'leads', 'colar')),
  origem_descricao    text,
  lista_id            uuid references public.leads_listas (id) on delete set null,
  total               integer not null default 0,
  -- Envio
  agendada_para       timestamptz,
  iniciada_em         timestamptz,
  concluida_em        timestamptz,
  pausada_motivo      text check (pausada_motivo is null or pausada_motivo in ('equipe', 'erro', 'modelo', 'limite')),
  ultimo_erro         text,
  processando_desde   timestamptz,
  criado_por          uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  constraint campanhas_botao_completo check ((botao_texto is null) = (botao_url is null))
);

comment on table public.campanhas is 'Campanhas do WhatsApp oficial. Cada uma usa um modelo (template) aprovado pela Meta — modelos iguais já aprovados são reaproveitados (modelo_assinatura).';
comment on column public.campanhas.pausada_motivo is 'equipe = pausada na tela; erro = problema da conta/modelo; modelo = a Meta pausou o modelo; limite = esperando o limite diário (segue "enviando").';

create index campanhas_status_idx on public.campanhas (status, criado_em desc);
create index campanhas_modelo_idx on public.campanhas (modelo_id) where modelo_id is not null;
create index campanhas_assinatura_idx on public.campanhas (modelo_assinatura) where modelo_status = 'APPROVED';

create trigger campanhas_atualizado_em
  before update on public.campanhas
  for each row execute function public.definir_atualizado_em();

create table public.campanha_envios (
  id             bigint generated always as identity primary key,
  campanha_id    uuid not null references public.campanhas (id) on delete cascade,
  whatsapp       text not null,
  nome           text,
  status         public.status_envio_campanha not null default 'pendente',
  tentativas     smallint not null default 0,
  wamid          text unique,
  wa_id          text,
  erro_codigo    integer,
  erro           text,
  reservado_em   timestamptz,
  -- Depois de uma falha passageira, o contato só volta à fila a partir daqui (espera crescente).
  proxima_tentativa_em timestamptz,
  enviada_em     timestamptz,
  entregue_em    timestamptz,
  lida_em        timestamptz,
  respondida_em  timestamptz,
  resposta       text,
  saiu_em        timestamptz
);

comment on table public.campanha_envios is 'Um envio por número da campanha. wamid = id da mensagem na Meta (liga os status do webhook).';

create unique index campanha_envios_numero_key on public.campanha_envios (campanha_id, whatsapp);
create index campanha_envios_fila_idx on public.campanha_envios (campanha_id, status, id);
create index campanha_envios_24h_idx on public.campanha_envios (enviada_em) where enviada_em is not null;
create index campanha_envios_contato_idx on public.campanha_envios (whatsapp, enviada_em desc);

-- Número canônico e nome limpo (o mesmo número casa com leads, clientes e respostas).
create or replace function public.normalizar_envio_campanha()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.whatsapp := public.whatsapp_canonico(public.normalizar_whatsapp(new.whatsapp));
  new.nome     := nullif(left(regexp_replace(trim(coalesce(new.nome, '')), '\s+', ' ', 'g'), 120), '');
  return new;
end;
$$;

create trigger campanha_envios_normalizar
  before insert on public.campanha_envios
  for each row execute function public.normalizar_envio_campanha();

-- Contatos de uma campanha em preparo (lotes de até 5.000 vindos do navegador).
-- Números inválidos e repetidos são ignorados. Retorna quantos entraram.
create or replace function public.adicionar_contatos_campanha(p_campanha_id uuid, p_contatos jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_inseridos integer;
begin
  if not exists (select 1 from public.campanhas where id = p_campanha_id and status = 'preparando') then
    raise exception 'Esta campanha não está mais recebendo contatos.';
  end if;
  if jsonb_typeof(p_contatos) <> 'array' or jsonb_array_length(p_contatos) > 5000 then
    raise exception 'Envie no máximo 5.000 contatos por vez.';
  end if;

  insert into public.campanha_envios (campanha_id, whatsapp, nome)
  select p_campanha_id, c.whatsapp, c.nome
  from jsonb_to_recordset(p_contatos) as c(whatsapp text, nome text)
  where length(public.normalizar_whatsapp(c.whatsapp)) between 12 and 15
  on conflict do nothing;

  get diagnostics v_inseridos = row_count;
  return v_inseridos;
end;
$$;

-- Contatos de uma lista do Banco de Leads (com WhatsApp válido), em páginas de até
-- 5.000 em ordem de número: passe em p_apos o "ultimo" da página anterior. Na lista,
-- o número já é único. Retorna { inseridos, ultimo } (ultimo nulo = acabou).
create or replace function public.adicionar_lista_campanha(p_campanha_id uuid, p_lista_id uuid, p_apos text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  if not exists (select 1 from public.campanhas where id = p_campanha_id and status = 'preparando') then
    raise exception 'Esta campanha não está mais recebendo contatos.';
  end if;

  with pagina as (
    select l.whatsapp, l.nome
    from public.leads l
    where l.lista_id = p_lista_id and l.whatsapp is not null and l.whatsapp > coalesce(p_apos, '')
    order by l.whatsapp
    limit 5000
  ),
  inseridos as (
    insert into public.campanha_envios (campanha_id, whatsapp, nome)
    select p_campanha_id, p.whatsapp, p.nome
    from pagina p
    where length(p.whatsapp) between 12 and 15
    on conflict do nothing
    returning 1
  )
  select jsonb_build_object('inseridos', (select count(*) from inseridos), 'ultimo', (select max(whatsapp) from pagina))
  into v_resultado;
  return v_resultado;
end;
$$;

-- Fecha a lista de contatos: tira quem pediu para não receber e manda para a análise da Meta.
create or replace function public.confirmar_campanha(p_campanha_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_total integer;
  v_ignorados integer;
begin
  if not exists (select 1 from public.campanhas where id = p_campanha_id and status = 'preparando') then
    raise exception 'Esta campanha já foi confirmada.';
  end if;

  update public.campanha_envios e
  set status = 'ignorada', erro = 'Pediu para não receber campanhas.'
  where e.campanha_id = p_campanha_id
    and e.status = 'pendente'
    and exists (select 1 from public.whatsapp_descadastros d where d.whatsapp = e.whatsapp);
  get diagnostics v_ignorados = row_count;

  select count(*) into v_total from public.campanha_envios where campanha_id = p_campanha_id;
  if v_total - v_ignorados = 0 then
    raise exception 'Nenhum número válido para enviar nesta campanha.';
  end if;

  update public.campanhas set status = 'aguardando_aprovacao', total = v_total where id = p_campanha_id;
  return jsonb_build_object('total', v_total, 'ignorados', v_ignorados);
end;
$$;

-- Rotina de envio (só o servidor) ----------------------------------------------------

-- Trava uma campanha para uma única rotina de envio por vez (destrava sozinha após 6 min).
create or replace function public.travar_campanha(p_campanha_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with travada as (
    update public.campanhas
    set processando_desde = now()
    where id = p_campanha_id
      and (processando_desde is null or processando_desde < now() - interval '6 minutes')
    returning 1
  )
  select exists (select 1 from travada);
$$;

-- Reserva o próximo lote da fila. Reservas de uma rotina interrompida voltam para a fila.
create or replace function public.reservar_envios_campanha(p_campanha_id uuid, p_limite integer)
returns table (id bigint, whatsapp text, nome text, tentativas smallint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Reserva de uma rotina interrompida: a mensagem pode ter saído. Não reenvia (mensagem
  -- repetida gera bloqueios e derruba a qualidade do número).
  update public.campanha_envios e
  set status = 'falhou', erro = 'Envio interrompido — a mensagem pode ou não ter chegado.', reservado_em = null
  where e.campanha_id = p_campanha_id and e.status = 'enviando' and e.reservado_em < now() - interval '10 minutes';

  -- Quem pediu para sair depois da confirmação (ex.: "Não quero receber" em outra campanha).
  update public.campanha_envios e
  set status = 'ignorada', erro = 'Pediu para não receber campanhas.'
  where e.campanha_id = p_campanha_id
    and e.status = 'pendente'
    and exists (select 1 from public.whatsapp_descadastros d where d.whatsapp = e.whatsapp);

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

-- Contatos diferentes que receberam campanha nas últimas 24 h (o limite da Meta é por contato).
create or replace function public.contatos_campanha_24h()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct whatsapp)::integer
  from public.campanha_envios
  where enviada_em > now() - interval '24 hours';
$$;

-- Status vindos do webhook (sent, delivered, read, failed). Nunca volta um status.
create or replace function public.atualizar_status_envio_campanha(
  p_wamid       text,
  p_status      text,
  p_quando      timestamptz,
  p_erro_codigo integer default null,
  p_erro        text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.campanha_envios e
  set enviada_em  = coalesce(e.enviada_em, p_quando),
      entregue_em = case when p_status in ('delivered', 'read') then coalesce(e.entregue_em, p_quando) else e.entregue_em end,
      lida_em     = case when p_status = 'read' then coalesce(e.lida_em, p_quando) else e.lida_em end,
      status = case
        when p_status = 'failed' then 'falhou'::public.status_envio_campanha
        when p_status = 'read' and e.status in ('enviando', 'enviada', 'entregue') then 'lida'
        when p_status = 'delivered' and e.status in ('enviando', 'enviada') then 'entregue'
        else e.status
      end,
      erro_codigo = case when p_status = 'failed' then p_erro_codigo else e.erro_codigo end,
      erro        = case when p_status = 'failed' then p_erro else e.erro end
  where e.wamid = p_wamid;
$$;

-- Resposta de um contato ao número das campanhas (texto, botão ou pedido para sair).
-- Liga à mensagem respondida (wamid do contexto) ou ao último envio para o número.
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
  v_numero text := public.whatsapp_canonico(p_wa_id);
  v_envio  public.campanha_envios;
begin
  select * into v_envio from public.campanha_envios e
  where (p_contexto is not null and e.wamid = p_contexto)
     or ((e.whatsapp = v_numero or e.wa_id = p_wa_id) and e.enviada_em > now() - interval '30 days')
  order by (e.wamid = p_contexto) desc nulls last, e.enviada_em desc nulls last
  limit 1;

  if v_envio.id is not null then
    update public.campanha_envios
    set respondida_em = coalesce(respondida_em, p_quando),
        resposta      = coalesce(left(nullif(trim(p_texto), ''), 1000), resposta),
        saiu_em       = case when p_saiu then coalesce(saiu_em, p_quando) else saiu_em end
    where id = v_envio.id;
  end if;

  if p_saiu and coalesce(v_envio.whatsapp, v_numero) is not null then
    insert into public.whatsapp_descadastros (whatsapp, origem, campanha_id)
    values (coalesce(v_envio.whatsapp, v_numero), case when p_contexto is not null and v_envio.id is not null then 'botao' else 'mensagem' end, v_envio.campanha_id)
    on conflict (whatsapp) do nothing;
  end if;
end;
$$;

-- Visão com os números de cada campanha --------------------------------------------

create view public.vw_campanhas
with (security_invoker = true)
as
select
  c.*,
  count(e.id) filter (where e.status in ('pendente', 'enviando'))::integer as pendentes,
  count(e.id) filter (where e.enviada_em is not null)::integer            as enviadas,
  count(e.id) filter (where e.entregue_em is not null)::integer           as entregues,
  count(e.id) filter (where e.lida_em is not null)::integer               as lidas,
  count(e.id) filter (where e.respondida_em is not null)::integer         as respostas,
  count(e.id) filter (where e.status = 'falhou')::integer                 as falhas,
  count(e.id) filter (where e.status = 'ignorada')::integer               as ignoradas,
  count(e.id) filter (where e.saiu_em is not null)::integer               as sairam
from public.campanhas c
left join public.campanha_envios e on e.campanha_id = c.id
group by c.id;

-- Segurança ------------------------------------------------------------------------

alter table public.campanhas enable row level security;
alter table public.campanha_envios enable row level security;
alter table public.whatsapp_descadastros enable row level security;

create policy "Equipe gerencia campanhas"
  on public.campanhas for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe gerencia envios de campanhas"
  on public.campanha_envios for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe gerencia descadastros"
  on public.whatsapp_descadastros for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

revoke all on public.whatsapp_oficial, public.campanhas, public.campanha_envios, public.whatsapp_descadastros, public.vw_campanhas from anon;
revoke all on public.whatsapp_oficial from authenticated;
grant all on public.whatsapp_oficial to service_role;
grant select, insert, update, delete on public.campanhas, public.campanha_envios, public.whatsapp_descadastros to authenticated, service_role;
grant select on public.vw_campanhas to authenticated, service_role;

revoke execute on function
  public.status_whatsapp_oficial(),
  public.guardar_segredo_whatsapp_oficial(text, text, text),
  public.salvar_whatsapp_oficial(text, text, text, text, text),
  public.desconectar_whatsapp_oficial(),
  public.credenciais_whatsapp_oficial(),
  public.adicionar_contatos_campanha(uuid, jsonb),
  public.adicionar_lista_campanha(uuid, uuid, text),
  public.confirmar_campanha(uuid),
  public.travar_campanha(uuid),
  public.reservar_envios_campanha(uuid, integer),
  public.contatos_campanha_24h(),
  public.atualizar_status_envio_campanha(text, text, timestamptz, integer, text),
  public.registrar_resposta_campanha(text, text, timestamptz, boolean, text)
from public, anon, authenticated;

-- Equipe (pela tela)
grant execute on function
  public.status_whatsapp_oficial(),
  public.salvar_whatsapp_oficial(text, text, text, text, text),
  public.desconectar_whatsapp_oficial(),
  public.adicionar_contatos_campanha(uuid, jsonb),
  public.adicionar_lista_campanha(uuid, uuid, text),
  public.confirmar_campanha(uuid)
to authenticated, service_role;

-- Só o servidor (rotina de envio e webhook)
grant execute on function
  public.credenciais_whatsapp_oficial(),
  public.travar_campanha(uuid),
  public.reservar_envios_campanha(uuid, integer),
  public.contatos_campanha_24h(),
  public.atualizar_status_envio_campanha(text, text, timestamptz, integer, text),
  public.registrar_resposta_campanha(text, text, timestamptz, boolean, text)
to service_role;

-- Storage: foto das campanhas (pública: a Meta busca a imagem pelo link) ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campanhas', 'campanhas', true, 5242880, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "Equipe envia fotos de campanhas"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'campanhas' and (select public.eh_membro_equipe()));

create policy "Equipe vê fotos de campanhas"
  on storage.objects for select to authenticated
  using (bucket_id = 'campanhas' and (select public.eh_membro_equipe()));

create policy "Equipe remove fotos de campanhas"
  on storage.objects for delete to authenticated
  using (bucket_id = 'campanhas' and (select public.eh_membro_equipe()));
