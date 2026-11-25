-- =============================================================================
-- Lotes e validades: histórico completo de cada produto
--
-- Pedido do dono da loja (2026-11-25): tudo o que acontece com o produto fica registrado,
-- para, se der algum erro, dar para ver exatamente o que aconteceu:
--   • toda leitura da Olist que mudou o estoque (subiu ou desceu), com de onde veio a leitura
--     (rotina automática, aviso da Olist, botão "Atualizar da Olist", ao salvar lote, cadastro);
--   • as baixas automáticas nos lotes que essa leitura causou;
--   • toda mudança feita pela equipe: lote cadastrado, quantidade ajustada, código ou validade
--     editados, lote excluído — com quem fez;
--   • nome/SKU/foto que mudaram na Olist, falhas ao ler a Olist e qualquer alteração feita
--     direto no banco (fora do CRM), com o papel de quem alterou;
--   • a remoção da cerveja do controle. O histórico NÃO é apagado: fica guardado pelo id do
--     produto na Olist e reaparece se a cerveja for cadastrada de novo.
-- Unidades que não mudaram numa leitura não geram linha (a hora da última leitura fica na tela).
-- =============================================================================

-- Histórico: passa a guardar também eventos do produto (sem lote) e não some com a cerveja.
alter table public.lote_movimentos alter column lote drop not null;
alter table public.lote_movimentos alter column quantidade drop not null;
alter table public.lote_movimentos alter column cerveja_id drop not null;
alter table public.lote_movimentos drop constraint lote_movimentos_cerveja_id_fkey;
alter table public.lote_movimentos
  add constraint lote_movimentos_cerveja_id_fkey foreign key (cerveja_id) references public.lotes_cervejas (id) on delete set null;

alter table public.lote_movimentos
  add column olist_id bigint,
  add column sku      text,
  add column origem   text,
  add column detalhes jsonb not null default '{}'::jsonb,
  add column papel    text default current_setting('role', true);

comment on table public.lote_movimentos is
  'Histórico completo de cada produto do módulo Lotes e validades: leituras da Olist, baixas automáticas, mudanças da equipe, falhas e remoção. Nunca é apagado junto com a cerveja.';
comment on column public.lote_movimentos.olist_id is 'Produto na Olist: o histórico continua ligado a ele mesmo se a cerveja sair e voltar ao controle.';
comment on column public.lote_movimentos.quantidade is 'Variação: no lote (+ entrou, − saiu) ou, numa leitura, no estoque da Olist.';
comment on column public.lote_movimentos.origem is
  'De onde veio: rotina | aviso_olist | botao | salvar_lote | cadastro | conferencia | manual | alteracao_direta.';
comment on column public.lote_movimentos.detalhes is 'O que mudou, campo a campo (antes e depois), e outras informações do evento.';
comment on column public.lote_movimentos.papel is 'Papel no banco de quem fez a mudança (authenticated = tela do CRM, service_role = rotina, none = direto no banco).';

alter table public.lote_movimentos drop constraint lote_movimentos_tipo_check;
alter table public.lote_movimentos add constraint lote_movimentos_tipo_check check (tipo in (
  'cadastro', 'ajuste', 'edicao', 'baixa_olist', 'exclusao',
  'leitura_olist', 'falha_leitura', 'cerveja_cadastrada', 'cerveja_atualizada', 'cerveja_removida'
));

create index lote_movimentos_olist_idx on public.lote_movimentos (olist_id, criado_em desc, id);

update public.lote_movimentos m
set olist_id = c.olist_id, sku = c.sku, origem = case when m.tipo = 'baixa_olist' then 'rotina' else 'manual' end
from public.lotes_cervejas c
where c.id = m.cerveja_id;

-- Cervejas que já estavam no controle: o histórico começa com o cadastro delas.
insert into public.lote_movimentos (cerveja_id, olist_id, sku, tipo, origem, autor_id, criado_em, detalhes, papel)
select c.id, c.olist_id, c.sku, 'cerveja_cadastrada', 'cadastro', c.criado_por, c.criado_em,
       jsonb_build_object('nome', c.nome, 'registrado_depois', true), null
from public.lotes_cervejas c;

-- De onde veio cada leitura e a última falha ao ler a Olist ----------------------------------

alter table public.lotes_cervejas
  add column estoque_origem  text,
  add column leitura_erro    text,
  add column leitura_erro_em timestamptz;

comment on column public.lotes_cervejas.estoque_origem is
  'Quem fez a última leitura: rotina | aviso_olist | botao | salvar_lote | cadastro (vai para o histórico).';
comment on column public.lotes_cervejas.leitura_erro is 'Motivo da última falha ao ler a Olist (nulo depois de uma leitura que deu certo).';
comment on column public.lotes_cervejas.leitura_erro_em is 'Quando a última leitura falhou.';

-- Conciliação: agora registra a origem e o produto em cada baixa -----------------------------

drop trigger lotes_cervejas_conciliar on public.lotes_cervejas;
drop function public.conciliar_lotes_ao_ler_estoque();
drop function public.conciliar_lotes_da_cerveja(uuid, numeric);

create function public.conciliar_lotes_da_cerveja(
  p_cerveja_id uuid,
  p_estoque_antes numeric default null,
  p_origem text default 'conferencia'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cerveja  public.lotes_cervejas;
  v_estoque  integer;
  v_soma     integer;
  v_excesso  integer;
  v_tira     integer;
  v_lote     record;
begin
  -- Trava a cerveja: leitura da Olist e cadastro de lote não se cruzam no meio da conta.
  select * into v_cerveja from public.lotes_cervejas where id = p_cerveja_id for update;
  if not found or v_cerveja.estoque_olist is null then
    return null;
  end if;
  if exists (select 1 from public.lotes where cerveja_id = p_cerveja_id and quantidade is null) then
    return null;
  end if;

  v_estoque := greatest(floor(v_cerveja.estoque_olist)::integer, 0);
  select coalesce(sum(quantidade), 0) into v_soma from public.lotes where cerveja_id = p_cerveja_id;
  v_excesso := v_soma - v_estoque;

  if v_excesso > 0 then
    perform set_config('lotes.baixa_olist', 'on', true);
    for v_lote in
      select id, lote, validade, quantidade from public.lotes
      where cerveja_id = p_cerveja_id and quantidade > 0
      order by validade, criado_em, lote
      for update
    loop
      exit when v_excesso <= 0;
      v_tira := least(v_lote.quantidade, v_excesso);
      update public.lotes set quantidade = quantidade - v_tira where id = v_lote.id;
      insert into public.lote_movimentos
        (cerveja_id, olist_id, sku, lote_id, lote, tipo, quantidade, saldo, estoque_antes, estoque_depois, origem, autor_id, detalhes)
      values
        (p_cerveja_id, v_cerveja.olist_id, v_cerveja.sku, v_lote.id, v_lote.lote, 'baixa_olist', -v_tira, v_lote.quantidade - v_tira,
         p_estoque_antes, v_cerveja.estoque_olist, p_origem, auth.uid(),
         jsonb_build_object('validade', v_lote.validade, 'antes', v_lote.quantidade, 'soma_dos_lotes_antes', v_soma))
      ;
      v_excesso := v_excesso - v_tira;
    end loop;
    perform set_config('lotes.baixa_olist', '', true);
    return 0;
  end if;

  -- Entrou mercadoria (o estoque subiu) e ficou unidade sem lote: avisa a equipe.
  if v_excesso < 0 and p_estoque_antes is not null and v_cerveja.estoque_olist > p_estoque_antes
     and exists (select 1 from public.lotes where cerveja_id = p_cerveja_id) then
    perform public.avisar_lote_sem_registro(p_cerveja_id, v_cerveja.nome, -v_excesso);
  end if;
  return -v_excesso;
end;
$$;

create or replace function public.conciliar_lotes(p_cerveja_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_membro_equipe() then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  return public.conciliar_lotes_da_cerveja(p_cerveja_id, null, 'conferencia');
end;
$$;

-- Histórico da cerveja: cadastro, leituras, mudanças da Olist, falhas e remoção ---------------

create or replace function public.registrar_historico_da_cerveja()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origem    text;
  v_leitura   bigint;
  v_sem_lote  integer;
  v_mudou     jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.lote_movimentos (cerveja_id, olist_id, sku, tipo, estoque_depois, origem, autor_id, detalhes)
    values (new.id, new.olist_id, new.sku, 'cerveja_cadastrada', new.estoque_olist, coalesce(new.estoque_origem, 'cadastro'), auth.uid(),
            jsonb_build_object('nome', new.nome, 'lido_em', new.estoque_lido_em));
    return null;
  end if;

  if tg_op = 'DELETE' then
    -- Antes de apagar: guarda como estavam os lotes (o histórico fica pelo produto da Olist).
    insert into public.lote_movimentos (cerveja_id, olist_id, sku, tipo, estoque_antes, origem, autor_id, detalhes)
    values (old.id, old.olist_id, old.sku, 'cerveja_removida', old.estoque_olist, 'manual', auth.uid(),
            jsonb_build_object(
              'nome', old.nome,
              'lotes', coalesce((
                select jsonb_agg(jsonb_build_object('lote', l.lote, 'validade', l.validade, 'quantidade', l.quantidade) order by l.validade, l.lote)
                from public.lotes l where l.cerveja_id = old.id
              ), '[]'::jsonb)));
    return old;
  end if;

  -- Leitura nova (mudou a hora da leitura): vale a origem que o CRM gravou. Estoque mudou sem
  -- leitura nova: alguém alterou direto no banco, fora do CRM.
  v_origem := case when new.estoque_lido_em is distinct from old.estoque_lido_em then coalesce(new.estoque_origem, 'leitura') else 'alteracao_direta' end;

  if new.estoque_olist is distinct from old.estoque_olist then
    insert into public.lote_movimentos (cerveja_id, olist_id, sku, tipo, quantidade, estoque_antes, estoque_depois, origem, autor_id, detalhes)
    values (new.id, new.olist_id, new.sku, 'leitura_olist',
            case when new.estoque_olist is not null and old.estoque_olist is not null
                 then floor(new.estoque_olist)::integer - floor(old.estoque_olist)::integer end,
            old.estoque_olist, new.estoque_olist, v_origem, auth.uid(),
            jsonb_build_object('lido_em', new.estoque_lido_em, 'leitura_anterior_em', old.estoque_lido_em,
                               'soma_dos_lotes_antes', (select coalesce(sum(quantidade), 0) from public.lotes where cerveja_id = new.id)))
    returning id into v_leitura;

    -- Baixa dos lotes (do que vence primeiro) e unidades que ficaram sem lote.
    v_sem_lote := public.conciliar_lotes_da_cerveja(new.id, old.estoque_olist, v_origem);
    if v_sem_lote is not null then
      update public.lote_movimentos
      set detalhes = detalhes || jsonb_build_object('sem_lote_depois', v_sem_lote,
                                                    'soma_dos_lotes_depois', (select coalesce(sum(quantidade), 0) from public.lotes where cerveja_id = new.id))
      where id = v_leitura;
    end if;
  end if;

  if new.nome is distinct from old.nome then
    v_mudou := v_mudou || jsonb_build_object('nome', jsonb_build_array(old.nome, new.nome));
  end if;
  if new.sku is distinct from old.sku then
    v_mudou := v_mudou || jsonb_build_object('sku', jsonb_build_array(old.sku, new.sku));
  end if;
  if new.foto_url is distinct from old.foto_url then
    v_mudou := v_mudou || jsonb_build_object('foto', jsonb_build_array(old.foto_url is not null, new.foto_url is not null));
  end if;
  if new.olist_id is distinct from old.olist_id then
    v_mudou := v_mudou || jsonb_build_object('olist_id', jsonb_build_array(old.olist_id, new.olist_id));
  end if;
  if v_mudou <> '{}'::jsonb then
    insert into public.lote_movimentos (cerveja_id, olist_id, sku, tipo, origem, autor_id, detalhes)
    values (new.id, new.olist_id, new.sku, 'cerveja_atualizada', v_origem, auth.uid(), v_mudou);
  end if;

  -- Falha nova (a mesma falha repetida a cada rodada não vira uma linha a cada 5 min: a hora da
  -- última tentativa fica em leitura_erro_em).
  if new.leitura_erro is not null and new.leitura_erro is distinct from old.leitura_erro then
    insert into public.lote_movimentos (cerveja_id, olist_id, sku, tipo, estoque_depois, origem, autor_id, detalhes)
    values (new.id, new.olist_id, new.sku, 'falha_leitura', new.estoque_olist, coalesce(new.estoque_origem, 'leitura'), auth.uid(),
            jsonb_build_object('erro', new.leitura_erro));
  end if;
  return null;
end;
$$;

create trigger lotes_cervejas_historico
  after insert or update on public.lotes_cervejas
  for each row execute function public.registrar_historico_da_cerveja();

create trigger lotes_cervejas_historico_remocao
  before delete on public.lotes_cervejas
  for each row execute function public.registrar_historico_da_cerveja();

-- Histórico dos lotes: cadastro, ajuste, edição de código/validade e exclusão -----------------

create or replace function public.registrar_movimento_lote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cerveja public.lotes_cervejas;
  v_mudou   jsonb := '{}'::jsonb;
begin
  -- A baixa automática registra a própria linha (com a leitura que a causou).
  if current_setting('lotes.baixa_olist', true) = 'on' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    select * into v_cerveja from public.lotes_cervejas where id = old.cerveja_id;
    -- Cerveja sendo removida do controle: os lotes já ficaram no evento "cerveja_removida".
    if not found then
      return null;
    end if;
    insert into public.lote_movimentos (cerveja_id, olist_id, sku, lote_id, lote, tipo, quantidade, saldo, origem, autor_id, detalhes)
    values (old.cerveja_id, v_cerveja.olist_id, v_cerveja.sku, null, old.lote, 'exclusao', -coalesce(old.quantidade, 0), 0, 'manual', auth.uid(),
            jsonb_build_object('validade', old.validade, 'antes', old.quantidade));
    return null;
  end if;

  select * into v_cerveja from public.lotes_cervejas where id = new.cerveja_id;

  if tg_op = 'INSERT' then
    insert into public.lote_movimentos (cerveja_id, olist_id, sku, lote_id, lote, tipo, quantidade, saldo, estoque_depois, origem, autor_id, detalhes)
    values (new.cerveja_id, v_cerveja.olist_id, v_cerveja.sku, new.id, new.lote, 'cadastro', coalesce(new.quantidade, 0), new.quantidade,
            v_cerveja.estoque_olist, 'manual', auth.uid(), jsonb_build_object('validade', new.validade));
    return null;
  end if;

  if new.quantidade is distinct from old.quantidade then
    insert into public.lote_movimentos (cerveja_id, olist_id, sku, lote_id, lote, tipo, quantidade, saldo, estoque_depois, origem, autor_id, detalhes)
    values (new.cerveja_id, v_cerveja.olist_id, v_cerveja.sku, new.id, new.lote, 'ajuste',
            coalesce(new.quantidade, 0) - coalesce(old.quantidade, 0), new.quantidade, v_cerveja.estoque_olist, 'manual', auth.uid(),
            jsonb_build_object('antes', old.quantidade, 'validade', new.validade));
  end if;

  if new.lote is distinct from old.lote then
    v_mudou := v_mudou || jsonb_build_object('lote', jsonb_build_array(old.lote, new.lote));
  end if;
  if new.validade is distinct from old.validade then
    v_mudou := v_mudou || jsonb_build_object('validade', jsonb_build_array(old.validade, new.validade));
  end if;
  if new.cerveja_id is distinct from old.cerveja_id then
    v_mudou := v_mudou || jsonb_build_object('cerveja_id', jsonb_build_array(old.cerveja_id, new.cerveja_id));
  end if;
  if v_mudou <> '{}'::jsonb then
    insert into public.lote_movimentos (cerveja_id, olist_id, sku, lote_id, lote, tipo, saldo, origem, autor_id, detalhes)
    values (new.cerveja_id, v_cerveja.olist_id, v_cerveja.sku, new.id, new.lote, 'edicao', new.quantidade, 'manual', auth.uid(), v_mudou);
  end if;
  return null;
end;
$$;

-- Segurança ----------------------------------------------------------------------------------

revoke all on function public.registrar_historico_da_cerveja(), public.conciliar_lotes_da_cerveja(uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.conciliar_lotes_da_cerveja(uuid, numeric, text) to service_role;
