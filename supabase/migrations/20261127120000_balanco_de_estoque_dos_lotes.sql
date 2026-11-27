-- =============================================================================
-- Lotes e validades: balanço de estoque (a contagem feita no CRM vai para a Olist)
--
-- Pedido do dono da loja (2026-11-27): a equipe conta o estoque no CRM, lote por lote, e o
-- total contado passa a ser o estoque da cerveja na Olist — exatamente o número informado
-- (lançamento do tipo "Balanço" da Olist). Nada além do número do estoque muda na Olist.
--   • Cada balanço é gravado em lotes_balancos ANTES de qualquer envio (quem, quando e a
--     contagem de cada lote) e recebe o resultado: estoque da Olist antes e depois, o id do
--     lançamento de lá e a observação enviada.
--   • O servidor só lança na Olist a partir de um registro destes — nunca um número avulso.
--   • Quando a Olist confirma, os lotes do CRM ficam iguais à contagem na mesma transação, e
--     tudo entra no histórico do produto (lote_movimentos): o balanço e cada lote ajustado,
--     com quem fez.
--   • Balanço recusado pela Olist ou sem confirmação também fica no histórico.
-- =============================================================================

-- Registro de cada balanço --------------------------------------------------------------------

create table public.lotes_balancos (
  id                   bigint generated always as identity primary key,
  -- O registro fica mesmo se a cerveja sair do controle (olist_id, sku e nome ficam aqui).
  cerveja_id           uuid references public.lotes_cervejas (id) on delete set null,
  olist_id             bigint not null,
  sku                  text,
  nome                 text,
  contagem             jsonb not null,
  total                integer not null,
  soma_antes           integer,
  estoque_crm_antes    numeric(12, 2),
  estoque_antes        numeric(12, 2),
  estoque_depois       numeric(12, 2),
  id_lancamento        bigint,
  observacao           text,
  caixa_vip            integer not null default 0,
  caixa_vip_a_caminho  integer not null default 0,
  status               text not null default 'enviando',
  erro                 text,
  envio_iniciado_em    timestamptz,
  autor_id             uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em            timestamptz not null default now(),
  concluido_em         timestamptz,
  constraint lotes_balancos_total_check check (total between 0 and 100000),
  constraint lotes_balancos_status_check check (status in ('enviando', 'concluido', 'recusado', 'conferir'))
);

comment on table public.lotes_balancos is
  'Balanços de estoque do módulo Lotes e validades: a contagem por lote feita no CRM e o lançamento "Balanço" que ela gerou na Olist. O servidor só lança na Olist a partir de um registro daqui.';
comment on column public.lotes_balancos.contagem is
  'Um item por lote: lote_id (nulo no lote novo), lote, validade, antes (quantidade no CRM), contado e novo (lote criado no balanço).';
comment on column public.lotes_balancos.total is 'Soma da contagem: o número que vai para a Olist, exato.';
comment on column public.lotes_balancos.soma_antes is 'Soma dos lotes no CRM antes do balanço.';
comment on column public.lotes_balancos.estoque_crm_antes is 'Estoque da Olist que o CRM tinha na última leitura, antes do balanço.';
comment on column public.lotes_balancos.estoque_antes is 'Saldo lido na Olist logo antes do lançamento.';
comment on column public.lotes_balancos.estoque_depois is 'Saldo lido na Olist logo depois do lançamento (conferência).';
comment on column public.lotes_balancos.id_lancamento is 'Id do lançamento de estoque na Olist.';
comment on column public.lotes_balancos.observacao is 'O texto enviado na observação do lançamento da Olist.';
comment on column public.lotes_balancos.caixa_vip is
  'Unidades desta cerveja em pedidos de pré-venda ainda não separados na hora do balanço, com a baixa já feita na Olist (o aviso mostrado na tela).';
comment on column public.lotes_balancos.caixa_vip_a_caminho is 'Idem, com a baixa ainda não enviada à Olist na hora do balanço.';
comment on column public.lotes_balancos.status is
  'enviando → concluido. recusado = a Olist não aceitou (nada mudou lá); conferir = sem confirmação da Olist, ou a Olist mudou e os lotes do CRM não foram gravados.';
comment on column public.lotes_balancos.envio_iniciado_em is 'Quando o servidor pegou o balanço para enviar (cada balanço é enviado uma vez só).';

create index lotes_balancos_cerveja_idx on public.lotes_balancos (cerveja_id, criado_em desc);
create index lotes_balancos_olist_idx on public.lotes_balancos (olist_id, criado_em desc);

alter table public.lotes_balancos enable row level security;

create policy "Equipe vê os balanços"
  on public.lotes_balancos for select to authenticated
  using ((select public.eh_membro_equipe()));

-- Os balanços nascem e mudam pelas funções abaixo: a equipe só lê.
revoke all on public.lotes_balancos from anon, authenticated;
grant select on public.lotes_balancos to authenticated;
grant select, insert, update, delete on public.lotes_balancos to service_role;

-- Histórico: dois eventos novos ----------------------------------------------------------------

alter table public.lote_movimentos drop constraint lote_movimentos_tipo_check;
alter table public.lote_movimentos add constraint lote_movimentos_tipo_check check (tipo in (
  'cadastro', 'ajuste', 'edicao', 'baixa_olist', 'exclusao',
  'leitura_olist', 'falha_leitura', 'cerveja_cadastrada', 'cerveja_atualizada', 'cerveja_removida',
  'alerta_grupo', 'tratativa',
  'balanco', 'falha_balanco'
));

comment on column public.lote_movimentos.origem is
  'De onde veio: rotina | aviso_olist | botao | salvar_lote | cadastro | conferencia | manual | alteracao_direta | balanco.';
comment on column public.lotes_cervejas.estoque_origem is
  'Quem fez a última leitura: rotina | aviso_olist | botao | salvar_lote | cadastro | balanco (vai para o histórico).';

-- Unidades em Caixa VIP (pedidos de pré-venda ainda não separados) -----------------------------

/**
 * Unidades deste produto da Olist que estão em pedidos de pré-venda ainda não separados (a
 * garrafa continua na prateleira): `na_olist` já teve a baixa lançada na Olist; `a_caminho`
 * ainda vai ser lançada. É o aviso do balanço: quem conta essas garrafas junto devolve à venda
 * cerveja que já está vendida.
 */
create function public.caixa_vip_do_produto_olist(p_olist_id bigint)
returns table (na_olist integer, a_caminho integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.eh_membro_equipe() then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;
  return query
    select
      greatest(coalesce(sum(case when m.status in ('enviado', 'ignorado')
                                 then case m.tipo when 'S' then m.quantidade else -m.quantidade end end), 0), 0)::integer,
      greatest(coalesce(sum(case when m.status in ('pendente', 'enviando', 'erro', 'conferir')
                                 then case m.tipo when 'S' then m.quantidade else -m.quantidade end end), 0), 0)::integer
    from public.movimentos_estoque_olist m
    join public.pedidos pe on pe.id = m.pedido_id
    where m.olist_produto_id = p_olist_id
      and pe.status in ('novo', 'confirmado');
end;
$$;

-- Histórico dos lotes: a origem e o autor podem vir do balanço ---------------------------------
-- (o balanço é concluído pelo servidor, sem usuário na sessão: quem fez está no registro dele)

create or replace function public.registrar_movimento_lote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cerveja public.lotes_cervejas;
  v_mudou   jsonb := '{}'::jsonb;
  -- Balanço: origem "balanco" e o autor do registro do balanço. Fora dele, como sempre.
  v_origem  text := coalesce(nullif(current_setting('lotes.origem', true), ''), 'manual');
  v_autor   uuid := coalesce(auth.uid(), nullif(current_setting('lotes.autor', true), '')::uuid);
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
    values (old.cerveja_id, v_cerveja.olist_id, v_cerveja.sku, null, old.lote, 'exclusao', -coalesce(old.quantidade, 0), 0, v_origem, v_autor,
            jsonb_build_object('validade', old.validade, 'antes', old.quantidade));
    return null;
  end if;

  select * into v_cerveja from public.lotes_cervejas where id = new.cerveja_id;

  if tg_op = 'INSERT' then
    insert into public.lote_movimentos (cerveja_id, olist_id, sku, lote_id, lote, tipo, quantidade, saldo, estoque_depois, origem, autor_id, detalhes)
    values (new.cerveja_id, v_cerveja.olist_id, v_cerveja.sku, new.id, new.lote, 'cadastro', coalesce(new.quantidade, 0), new.quantidade,
            v_cerveja.estoque_olist, v_origem, v_autor, jsonb_build_object('validade', new.validade));
    return null;
  end if;

  if new.quantidade is distinct from old.quantidade then
    insert into public.lote_movimentos (cerveja_id, olist_id, sku, lote_id, lote, tipo, quantidade, saldo, estoque_depois, origem, autor_id, detalhes)
    values (new.cerveja_id, v_cerveja.olist_id, v_cerveja.sku, new.id, new.lote, 'ajuste',
            coalesce(new.quantidade, 0) - coalesce(old.quantidade, 0), new.quantidade, v_cerveja.estoque_olist, v_origem, v_autor,
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
    values (new.cerveja_id, v_cerveja.olist_id, v_cerveja.sku, new.id, new.lote, 'edicao', new.quantidade, v_origem, v_autor, v_mudou);
  end if;
  return null;
end;
$$;

-- Histórico da cerveja: no balanço, o estoque novo não é uma "leitura" ---------------------------
-- (o balanço grava o próprio evento e deixa os lotes iguais à contagem: não há baixa automática)

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

  if new.estoque_olist is distinct from old.estoque_olist
     -- Balanço: quem registra (e acerta os lotes) é concluir_balanco_dos_lotes.
     and current_setting('lotes.balanco', true) is distinct from 'on' then
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

-- 1) A equipe registra a contagem ---------------------------------------------------------------

/**
 * Registra a contagem do balanço (ainda sem tocar na Olist nem nos lotes) e devolve
 * { id, total, olist_id }. p_contagem:
 *   { "lotes": [{ "id": "<uuid do lote>", "quantidade": 12 }, ...],        -- TODOS os lotes da cerveja
 *     "novos": [{ "lote": "L2511A", "validade": "2027-05-01", "quantidade": 24 }, ...] }
 * O total (soma de tudo) é o número que o servidor vai lançar na Olist.
 */
create function public.iniciar_balanco_dos_lotes(p_cerveja_id uuid, p_contagem jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cerveja   public.lotes_cervejas;
  v_lote      public.lotes;
  v_item      jsonb;
  v_itens     jsonb := '[]'::jsonb;
  v_vistos    uuid[] := '{}';
  v_codigos   text[] := '{}';
  v_codigo    text;
  v_total     bigint := 0;
  v_qtd       integer;
  v_soma      integer;
  v_vip       record;
  v_id        bigint;
begin
  if not public.eh_membro_equipe() then
    raise exception 'Você não tem permissão para esta ação.' using errcode = '42501';
  end if;

  -- Trava a cerveja: dois balanços dela não começam ao mesmo tempo.
  select * into v_cerveja from public.lotes_cervejas where id = p_cerveja_id for update;
  if not found then
    raise exception 'Esta cerveja não está mais no controle de lotes.';
  end if;
  if exists (
    select 1 from public.lotes_balancos b
    where b.olist_id = v_cerveja.olist_id and b.status = 'enviando' and b.criado_em > now() - interval '3 minutes'
  ) then
    raise exception 'Já há um balanço desta cerveja sendo enviado à Olist. Espere um instante e confira o histórico antes de tentar de novo.';
  end if;
  -- Balanço antigo que ficou sem resposta (o servidor parou no meio): vai para o histórico como
  -- "conferir" antes de começar outro.
  for v_id in
    select b.id from public.lotes_balancos b where b.olist_id = v_cerveja.olist_id and b.status = 'enviando' order by b.id
  loop
    perform public.falhar_balanco_dos_lotes(
      v_id, 'conferir', 'O envio deste balanço foi interrompido sem resposta. Confira o estoque na Olist: os lotes do CRM não foram alterados por ele.');
  end loop;

  -- Lotes que já existem: cada um com a quantidade contada.
  for v_item in select * from jsonb_array_elements(coalesce(p_contagem -> 'lotes', '[]'::jsonb)) loop
    select * into v_lote from public.lotes where id = (v_item ->> 'id')::uuid and cerveja_id = p_cerveja_id;
    if not found or v_lote.id = any (v_vistos) then
      raise exception 'Os lotes desta cerveja mudaram. Recarregue a página e refaça a contagem.';
    end if;
    if coalesce(v_item ->> 'quantidade', '') !~ '^[0-9]{1,7}$' or (v_item ->> 'quantidade')::integer > 1000000 then
      raise exception 'Informe a quantidade contada do lote % (número inteiro, zero ou mais).', v_lote.lote;
    end if;
    v_qtd := (v_item ->> 'quantidade')::integer;
    v_vistos := v_vistos || v_lote.id;
    v_codigos := v_codigos || lower(v_lote.lote);
    v_total := v_total + v_qtd;
    v_itens := v_itens || jsonb_build_object('lote_id', v_lote.id, 'lote', v_lote.lote, 'validade', v_lote.validade,
                                             'antes', v_lote.quantidade, 'contado', v_qtd, 'novo', false);
  end loop;

  select count(*), coalesce(sum(quantidade), 0) into v_qtd, v_soma from public.lotes where cerveja_id = p_cerveja_id;
  if v_qtd <> cardinality(v_vistos) then
    raise exception 'Os lotes desta cerveja mudaram. Recarregue a página e refaça a contagem.';
  end if;

  -- Lotes novos (mercadoria que chegou).
  for v_item in select * from jsonb_array_elements(coalesce(p_contagem -> 'novos', '[]'::jsonb)) loop
    v_codigo := btrim(coalesce(v_item ->> 'lote', ''));
    if length(v_codigo) not between 1 and 60 then
      raise exception 'Informe o código de cada lote novo (até 60 caracteres).';
    end if;
    if lower(v_codigo) = any (v_codigos) then
      raise exception 'O lote % aparece mais de uma vez nesta cerveja.', v_codigo;
    end if;
    if coalesce(v_item ->> 'validade', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Informe a validade do lote %.', v_codigo;
    end if;
    if coalesce(v_item ->> 'quantidade', '') !~ '^[0-9]{1,7}$' or (v_item ->> 'quantidade')::integer not between 1 and 1000000 then
      raise exception 'Informe a quantidade do lote % (número inteiro maior que zero).', v_codigo;
    end if;
    v_qtd := (v_item ->> 'quantidade')::integer;
    v_codigos := v_codigos || lower(v_codigo);
    v_total := v_total + v_qtd;
    v_itens := v_itens || jsonb_build_object('lote_id', null, 'lote', v_codigo, 'validade', (v_item ->> 'validade')::date,
                                             'antes', null, 'contado', v_qtd, 'novo', true);
  end loop;

  if jsonb_array_length(v_itens) = 0 then
    raise exception 'Informe ao menos um lote com a quantidade contada.';
  end if;
  if v_total > 100000 then
    raise exception 'O total contado (% un.) passa do limite de 100.000 unidades por cerveja. Confira os números.', v_total;
  end if;

  select * into v_vip from public.caixa_vip_do_produto_olist(v_cerveja.olist_id);

  insert into public.lotes_balancos
    (cerveja_id, olist_id, sku, nome, contagem, total, soma_antes, estoque_crm_antes, caixa_vip, caixa_vip_a_caminho, autor_id)
  values
    (v_cerveja.id, v_cerveja.olist_id, v_cerveja.sku, v_cerveja.nome, v_itens, v_total::integer, v_soma, v_cerveja.estoque_olist,
     coalesce(v_vip.na_olist, 0), coalesce(v_vip.a_caminho, 0), auth.uid())
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'total', v_total::integer, 'olist_id', v_cerveja.olist_id);
end;
$$;

-- 2) O servidor conclui, depois que a Olist confirmou ---------------------------------------------

/**
 * A Olist aceitou o balanço: deixa os lotes do CRM iguais à contagem e o estoque da cerveja
 * igual ao total, registra tudo no histórico (com o autor do balanço) e fecha o registro.
 * Tudo numa transação só. Só o servidor chama (service_role), logo depois do lançamento.
 */
create function public.concluir_balanco_dos_lotes(
  p_id bigint,
  p_estoque_antes numeric,
  p_estoque_depois numeric,
  p_id_lancamento bigint,
  p_observacao text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b        public.lotes_balancos;
  v_cerveja  public.lotes_cervejas;
  v_item     jsonb;
begin
  select * into v_b from public.lotes_balancos where id = p_id for update;
  if not found or v_b.status <> 'enviando' then
    raise exception 'O balanço % não está aguardando conclusão.', p_id;
  end if;
  select * into v_cerveja from public.lotes_cervejas where id = v_b.cerveja_id for update;
  if not found then
    raise exception 'A cerveja deste balanço saiu do controle de lotes.';
  end if;

  perform set_config('lotes.balanco', 'on', true);
  perform set_config('lotes.origem', 'balanco', true);
  perform set_config('lotes.autor', coalesce(v_b.autor_id::text, ''), true);

  -- O evento do balanço vem primeiro; os ajustes de cada lote (gatilho) vêm logo abaixo dele.
  insert into public.lote_movimentos (cerveja_id, olist_id, sku, tipo, quantidade, estoque_antes, estoque_depois, origem, autor_id, detalhes)
  values (v_cerveja.id, v_cerveja.olist_id, v_cerveja.sku, 'balanco',
          case when p_estoque_antes is not null then v_b.total - floor(p_estoque_antes)::integer end,
          p_estoque_antes, v_b.total, 'balanco', v_b.autor_id,
          jsonb_build_object('balanco', v_b.id, 'id_lancamento', p_id_lancamento, 'observacao', p_observacao,
                             'conferido_na_olist', p_estoque_depois, 'estoque_no_crm_antes', v_cerveja.estoque_olist,
                             'soma_dos_lotes_antes', v_b.soma_antes, 'caixa_vip', v_b.caixa_vip,
                             'caixa_vip_a_caminho', v_b.caixa_vip_a_caminho, 'lotes', v_b.contagem));

  -- O estoque do CRM passa a ser o total contado; a rotina relê a Olist em seguida (até 5 min)
  -- e, se lá houver outro número (uma venda no mesmo instante), registra a leitura como sempre.
  update public.lotes_cervejas
  set estoque_olist = v_b.total, estoque_lido_em = now(), estoque_origem = 'balanco',
      releitura_pedida_em = now(), leitura_erro = null, leitura_erro_em = null
  where id = v_cerveja.id;

  -- Cada lote fica com a quantidade contada (o gatilho registra cada ajuste, já com o estoque novo).
  for v_item in select * from jsonb_array_elements(v_b.contagem) loop
    if coalesce((v_item ->> 'novo')::boolean, false) then
      insert into public.lotes (cerveja_id, lote, validade, quantidade, criado_por)
      values (v_cerveja.id, v_item ->> 'lote', (v_item ->> 'validade')::date, (v_item ->> 'contado')::integer, v_b.autor_id);
    else
      update public.lotes set quantidade = (v_item ->> 'contado')::integer
      where id = (v_item ->> 'lote_id')::uuid and cerveja_id = v_cerveja.id;
    end if;
  end loop;

  perform set_config('lotes.balanco', '', true);
  perform set_config('lotes.origem', '', true);
  perform set_config('lotes.autor', '', true);

  -- Se alguém mexeu num lote no meio do envio, acerta pela regra de sempre (normalmente não faz nada).
  perform public.conciliar_lotes_da_cerveja(v_cerveja.id, null, 'balanco');

  update public.lotes_balancos
  set status = 'concluido', estoque_antes = p_estoque_antes, estoque_depois = p_estoque_depois,
      id_lancamento = p_id_lancamento, observacao = p_observacao, erro = null, concluido_em = now()
  where id = p_id;
end;
$$;

/**
 * O balanço não foi concluído: 'recusado' (a Olist não aceitou; nada mudou lá) ou 'conferir'
 * (sem confirmação da Olist, ou a Olist mudou e os lotes do CRM não foram gravados). Os lotes
 * do CRM ficam como estavam, e a falha entra no histórico do produto.
 */
create function public.falhar_balanco_dos_lotes(
  p_id bigint,
  p_status text,
  p_erro text,
  p_estoque_antes numeric default null,
  p_estoque_depois numeric default null,
  p_id_lancamento bigint default null,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.lotes_balancos;
begin
  if p_status not in ('recusado', 'conferir') then
    raise exception 'Situação inválida para o balanço: %.', p_status;
  end if;
  select * into v_b from public.lotes_balancos where id = p_id for update;
  if not found or v_b.status <> 'enviando' then
    raise exception 'O balanço % não está aguardando conclusão.', p_id;
  end if;

  update public.lotes_balancos
  set status = p_status, erro = left(p_erro, 500), estoque_antes = p_estoque_antes, estoque_depois = p_estoque_depois,
      id_lancamento = p_id_lancamento, observacao = p_observacao, concluido_em = now()
  where id = p_id;

  insert into public.lote_movimentos (cerveja_id, olist_id, sku, tipo, estoque_antes, estoque_depois, origem, autor_id, detalhes)
  values (v_b.cerveja_id, v_b.olist_id, v_b.sku, 'falha_balanco', p_estoque_antes, p_estoque_depois, 'balanco', v_b.autor_id,
          jsonb_build_object('balanco', v_b.id, 'situacao', p_status, 'erro', left(p_erro, 500), 'total', v_b.total,
                             'id_lancamento', p_id_lancamento, 'observacao', p_observacao, 'lotes', v_b.contagem));
end;
$$;

-- Segurança ----------------------------------------------------------------------------------

revoke all on function
  public.caixa_vip_do_produto_olist(bigint),
  public.iniciar_balanco_dos_lotes(uuid, jsonb),
  public.concluir_balanco_dos_lotes(bigint, numeric, numeric, bigint, text),
  public.falhar_balanco_dos_lotes(bigint, text, text, numeric, numeric, bigint, text)
  from public, anon, authenticated;

-- A equipe registra a contagem e consulta o aviso da Caixa VIP; concluir e falhar são do servidor.
grant execute on function public.caixa_vip_do_produto_olist(bigint), public.iniciar_balanco_dos_lotes(uuid, jsonb)
  to authenticated;
grant execute on function
  public.concluir_balanco_dos_lotes(bigint, numeric, numeric, bigint, text),
  public.falhar_balanco_dos_lotes(bigint, text, text, numeric, numeric, bigint, text)
  to service_role;
