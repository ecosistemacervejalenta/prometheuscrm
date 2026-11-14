-- =============================================================================
-- PROMETHEUS CRM · ESTOQUE DA OLIST NAS PRÉ-VENDAS
--
-- A equipe puxa as cervejas da Olist para a pré-venda (título, foto principal e estoque) e o
-- estoque da Olist passa a valer no link. Cada cerveja que entra numa Caixa VIP baixa o estoque
-- lá (lançamento de SAÍDA); cancelamento, item removido, pedido excluído e caixa vencida sem
-- pagamento devolvem (lançamento de ENTRADA). Kit da Olist baixa cada cerveja que o compõe.
-- Não cria pedido de venda nem nota fiscal na Olist — só acerta o estoque.
--
--   • produtos.olist_id / olist_kit: vínculo com o produto da Olist (kit = seus componentes).
--   • estoque_olist: o disponível lido na Olist (cópia local, atualizada pelo webhook de
--     estoque, pela rotina a cada 5 min e logo depois de cada lançamento do CRM).
--   • movimentos_estoque_olist: fila de lançamentos. Cada linha nasce no banco, na MESMA
--     transação da venda/cancelamento; o servidor envia à Olist logo em seguida, com nova
--     tentativa automática. O CRM já desconta a unidade antes de a Olist confirmar, então o
--     próximo cliente nunca compra o que acabou de ser vendido.
--   • Estoque que vale no link = disponível na Olist − lançamentos que a Olist ainda não
--     refletiu (na fila, ou enviados depois da última leitura).
--   • configuracoes.caixa_prazo_pagamento_dias: Caixa VIP sem nenhum pagamento é cancelada
--     sozinha depois desse prazo (contado da última compra, do fechamento ou da última
--     cobrança) e as cervejas voltam ao estoque. 0 = nunca.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Conexão: trava da renovação do token e último erro do estoque
-- -----------------------------------------------------------------------------

alter table public.integracao_olist
  add column renovando_token_desde  timestamptz,
  add column erro_estoque           text,
  add column erro_estoque_em        timestamptz;

comment on column public.integracao_olist.renovando_token_desde is 'Trava da renovação do token: o refresh token da Olist muda a cada uso, então só um processo renova por vez.';
comment on column public.integracao_olist.erro_estoque is 'Último erro da Olist ao ler ou lançar estoque (ex.: aplicativo sem permissão de Estoque). Limpo no próximo sucesso.';

-- Status para a tela agora traz o erro do estoque (nunca os tokens).
create or replace function public.status_integracao_olist()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.eh_membro_equipe() then (
    select jsonb_build_object(
      'conectado', io.refresh_token is not null and io.refresh_expira_em > now(),
      'expirada', io.refresh_token is not null and io.refresh_expira_em <= now(),
      'conectado_em', io.conectado_em,
      'ultima_sincronizacao', io.ultima_sincronizacao,
      'ultimo_erro', io.ultimo_erro,
      'erro_estoque', io.erro_estoque,
      'erro_estoque_em', io.erro_estoque_em
    )
    from public.integracao_olist io
    where io.id = 1
  ) end;
$$;

-- -----------------------------------------------------------------------------
-- Produtos vinculados à Olist
-- -----------------------------------------------------------------------------

alter table public.produtos
  add column olist_id   bigint unique,
  add column olist_kit  jsonb not null default '[]'
    constraint produtos_olist_kit_lista check (jsonb_typeof(olist_kit) = 'array');

comment on column public.produtos.olist_id is 'Produto vinculado na Olist ERP (id da API v3). O estoque da Olist vale nas pré-vendas e cada venda baixa lá.';
comment on column public.produtos.olist_kit is 'Kit na Olist: [{id, sku, nome, quantidade}]. A baixa vai para cada componente. Vazio = produto simples.';

-- Componentes da Olist de um produto do CRM: o próprio produto (simples) ou as cervejas do kit.
create or replace function public.componentes_olist(p_produto_id uuid)
returns table (olist_id bigint, quantidade integer)
language sql
stable
set search_path = ''
as $$
  select c.olist_id, sum(c.quantidade)::integer
  from (
    select (k ->> 'id')::bigint as olist_id,
           greatest(ceil(coalesce((k ->> 'quantidade')::numeric, 1)), 1)::integer as quantidade
    from public.produtos p
    cross join lateral jsonb_array_elements(p.olist_kit) k
    where p.id = p_produto_id
      and p.olist_id is not null
      and jsonb_array_length(p.olist_kit) > 0
      and (k ->> 'id') ~ '^[0-9]+$'
    union all
    select p.olist_id, 1
    from public.produtos p
    where p.id = p_produto_id
      and p.olist_id is not null
      and jsonb_array_length(p.olist_kit) = 0
  ) c
  group by c.olist_id;
$$;

-- -----------------------------------------------------------------------------
-- Estoque lido na Olist
-- -----------------------------------------------------------------------------

create table public.estoque_olist (
  id                 bigint primary key,
  sku                text,
  nome               text not null default '',
  saldo              numeric(14, 3) not null default 0,
  reservado          numeric(14, 3) not null default 0,
  disponivel         numeric(14, 3) not null default 0,
  lido_em            timestamptz,
  atualizando_desde  timestamptz,
  erro               text,
  atualizado_em      timestamptz not null default now()
);

comment on table public.estoque_olist is 'Estoque de cada produto da Olist usado no CRM (id = id do produto na Olist). Lido pelo servidor.';
comment on column public.estoque_olist.disponivel is 'Disponível na Olist (saldo − reservado) no momento da leitura.';
comment on column public.estoque_olist.lido_em is 'Quando o saldo foi pedido à Olist: lançamentos confirmados depois disso ainda não estão no número.';

create trigger estoque_olist_atualizado_em
  before update on public.estoque_olist
  for each row execute function public.definir_atualizado_em();

-- -----------------------------------------------------------------------------
-- Fila de lançamentos de estoque na Olist
-- -----------------------------------------------------------------------------

create type public.status_movimento_olist as enum ('pendente', 'enviando', 'enviado', 'erro', 'conferir', 'ignorado', 'cancelado');

create table public.movimentos_estoque_olist (
  id                bigint generated always as identity primary key,
  olist_produto_id  bigint not null,
  -- Referências sem chave estrangeira: o histórico fica mesmo se o pedido for excluído.
  produto_id        uuid,
  pedido_id         uuid,
  pedido_item_id    uuid,
  pedido_numero     bigint,
  tipo              text not null check (tipo in ('S', 'E')),
  quantidade        integer not null check (quantidade > 0),
  motivo            text not null,
  status            public.status_movimento_olist not null default 'pendente',
  tentativas        integer not null default 0,
  proximo_envio_em  timestamptz not null default now(),
  enviando_desde    timestamptz,
  enviado_em        timestamptz,
  lote              uuid,
  id_lancamento     bigint,
  ultimo_erro       text,
  criado_em         timestamptz not null default now()
);

comment on table public.movimentos_estoque_olist is 'Lançamentos de estoque que o CRM faz na Olist (S = saída, E = entrada). Nascem com a venda/cancelamento e são enviados pelo servidor.';
comment on column public.movimentos_estoque_olist.status is 'pendente → enviando → enviado. erro = a Olist recusou; conferir = o envio foi interrompido sem resposta (veja na Olist se entrou); ignorado = a equipe resolveu à mão (conta como lançado); cancelado = anulado por um lançamento contrário antes de chegar à Olist (nunca enviado).';
comment on column public.movimentos_estoque_olist.lote is 'Lançamentos do mesmo produto enviados juntos viram um lançamento só na Olist (soma das saídas − entradas).';

create index movimentos_olist_fila_idx on public.movimentos_estoque_olist (proximo_envio_em) where status = 'pendente';
create index movimentos_olist_abertos_idx on public.movimentos_estoque_olist (olist_produto_id)
  where status in ('pendente', 'enviando', 'erro', 'conferir');
create index movimentos_olist_enviados_idx on public.movimentos_estoque_olist (olist_produto_id, enviado_em) where status = 'enviado';
create index movimentos_olist_item_idx on public.movimentos_estoque_olist (pedido_item_id) where pedido_item_id is not null;
create index movimentos_olist_pedido_idx on public.movimentos_estoque_olist (pedido_id, criado_em desc) where pedido_id is not null;

-- Disponível na Olist menos o que o CRM já vendeu e a Olist ainda não refletiu.
create or replace function public.estoque_olist_efetivo(p_olist_id bigint)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select e.disponivel - coalesce((
    select sum(case m.tipo when 'S' then m.quantidade else -m.quantidade end)
    from public.movimentos_estoque_olist m
    where m.olist_produto_id = e.id
      and (
        m.status in ('pendente', 'enviando', 'erro', 'conferir')
        or (m.status = 'enviado' and (e.lido_em is null or m.enviado_em >= e.lido_em))
      )
  ), 0)
  from public.estoque_olist e
  where e.id = p_olist_id;
$$;

-- Unidades que ainda dá para vender de um produto do CRM (null = não vinculado à Olist).
-- Kit: o menor número de kits que os componentes permitem montar.
create or replace function public.estoque_olist_produto(p_produto_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when count(*) = 0 then null
    else greatest(min(floor(coalesce(public.estoque_olist_efetivo(c.olist_id), 0) / c.quantidade)), 0)::integer
  end
  from public.componentes_olist(p_produto_id) c;
$$;

-- Vários produtos de uma vez (formulário da pré-venda).
create or replace function public.estoques_olist_produtos(p_produto_ids uuid[])
returns table (produto_id uuid, estoque integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, public.estoque_olist_produto(p.id)
  from public.produtos p
  where p.id = any (p_produto_ids) and p.olist_id is not null;
$$;

-- Trava o estoque dos produtos (e dos componentes dos kits) até o fim da transação:
-- duas compras ao mesmo tempo da última unidade entram em fila.
create or replace function public.travar_estoque_olist(p_produto_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.estoque_olist e
  where e.id in (
    select c.olist_id
    from unnest(p_produto_ids) as pid
    cross join lateral public.componentes_olist(pid) c
  )
  order by e.id
  for update;
end;
$$;

-- Deixa o estoque lançado de um item igual ao que ele deveria ter baixado agora
-- (p_quantidade unidades do produto; 0 = devolver tudo). Gera só a diferença.
-- Lançamento contrário que ainda não chegou à Olist (na fila ou recusado) é anulado em vez de
-- gerar um novo: cancelar uma compra cuja baixa nunca entrou não pode devolver estoque lá.
create or replace function public.ajustar_estoque_olist_item(
  p_item_id     uuid,
  p_produto_id  uuid,
  p_quantidade  integer,
  p_pedido_id   uuid,
  p_motivo      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero  bigint;
  v_comp    record;
  v_mov     record;
  v_resto   integer;
begin
  select pe.numero into v_numero from public.pedidos pe where pe.id = p_pedido_id;

  for v_comp in
    with alvo as (
      select c.olist_id, (c.quantidade * p_quantidade)::integer as quantidade
      from public.componentes_olist(p_produto_id) c
      where coalesce(p_quantidade, 0) > 0
    ),
    lancado as (
      select m.olist_produto_id as olist_id,
             sum(case m.tipo when 'S' then m.quantidade else -m.quantidade end)::integer as quantidade
      from public.movimentos_estoque_olist m
      where m.pedido_item_id = p_item_id and m.status <> 'cancelado'
      group by 1
    )
    select coalesce(a.olist_id, l.olist_id) as olist_id,
           coalesce(a.quantidade, 0) - coalesce(l.quantidade, 0) as diferenca
    from alvo a
    full join lancado l on l.olist_id = a.olist_id
    order by 1
  loop
    continue when v_comp.diferenca = 0;
    v_resto := abs(v_comp.diferenca);

    for v_mov in
      select m.id, m.quantidade
      from public.movimentos_estoque_olist m
      where m.pedido_item_id = p_item_id
        and m.olist_produto_id = v_comp.olist_id
        and m.tipo = case when v_comp.diferenca > 0 then 'E' else 'S' end
        and m.status in ('pendente', 'erro')
      order by m.id desc
      for update skip locked
    loop
      exit when v_resto = 0;
      if v_mov.quantidade <= v_resto then
        update public.movimentos_estoque_olist set status = 'cancelado' where id = v_mov.id;
        v_resto := v_resto - v_mov.quantidade;
      else
        update public.movimentos_estoque_olist set quantidade = quantidade - v_resto where id = v_mov.id;
        v_resto := 0;
      end if;
    end loop;

    if v_resto > 0 then
      insert into public.movimentos_estoque_olist (
        olist_produto_id, produto_id, pedido_id, pedido_item_id, pedido_numero, tipo, quantidade, motivo
      )
      values (
        v_comp.olist_id, p_produto_id, p_pedido_id, p_item_id, v_numero,
        case when v_comp.diferenca > 0 then 'S' else 'E' end,
        v_resto,
        p_motivo
      );
    end if;
  end loop;
end;
$$;

-- Itens de pré-venda (ou que já baixaram estoque) acompanham a Olist: entrou → saída;
-- quantidade mudou → diferença; item removido / pedido excluído → entrada.
create or replace function public.estoque_olist_do_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status  public.status_pedido;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.movimentos_estoque_olist m where m.pedido_item_id = old.id) then
      perform public.ajustar_estoque_olist_item(
        old.id, old.produto_id, 0, old.pedido_id,
        case when exists (select 1 from public.pedidos pe where pe.id = old.pedido_id) then 'item_removido' else 'pedido_excluido' end
      );
    end if;
    return null;
  end if;

  -- Produto excluído do catálogo depois da venda: mantém o que já foi lançado.
  if new.produto_id is null then
    return null;
  end if;

  if not exists (select 1 from public.movimentos_estoque_olist m where m.pedido_item_id = new.id) then
    -- Só itens de pré-venda de produtos vinculados à Olist começam a movimentar estoque.
    if new.pre_venda_id is null or not exists (select 1 from public.componentes_olist(new.produto_id)) then
      return null;
    end if;
  end if;

  select pe.status into v_status from public.pedidos pe where pe.id = new.pedido_id;
  perform public.ajustar_estoque_olist_item(
    new.id, new.produto_id,
    case when v_status = 'cancelado' then 0 else new.quantidade end,
    new.pedido_id,
    case when tg_op = 'INSERT' then 'venda' else 'item_alterado' end
  );
  return null;
end;
$$;

create trigger pedido_itens_estoque_olist
  after insert or delete or update of quantidade, produto_id on public.pedido_itens
  for each row execute function public.estoque_olist_do_item();

-- Pedido cancelado devolve o estoque; reaberto, baixa de novo.
create or replace function public.estoque_olist_do_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item    record;
  v_motivo  text;
begin
  v_motivo := case
    when new.status = 'cancelado' then coalesce(nullif(current_setting('prometheus.motivo_estoque', true), ''), 'cancelamento')
    else 'reabertura'
  end;

  for v_item in
    select i.id, i.produto_id, i.quantidade, i.pre_venda_id
    from public.pedido_itens i
    where i.pedido_id = new.id and i.produto_id is not null
  loop
    if not exists (select 1 from public.movimentos_estoque_olist m where m.pedido_item_id = v_item.id)
       and (v_item.pre_venda_id is null or not exists (select 1 from public.componentes_olist(v_item.produto_id))) then
      continue;
    end if;
    perform public.ajustar_estoque_olist_item(
      v_item.id, v_item.produto_id,
      case when new.status = 'cancelado' then 0 else v_item.quantidade end,
      new.id, v_motivo
    );
  end loop;
  return null;
end;
$$;

create trigger pedidos_estoque_olist
  after update of status on public.pedidos
  for each row
  when ((old.status = 'cancelado') is distinct from (new.status = 'cancelado'))
  execute function public.estoque_olist_do_pedido();

-- -----------------------------------------------------------------------------
-- Compra na pré-venda confere o estoque da Olist (mesma função da Caixa VIP + estoque)
-- -----------------------------------------------------------------------------

create or replace function public.adicionar_itens_pre_venda(p_pedido_id uuid, p_pre_venda_id uuid, p_itens jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pedido       public.pedidos;
  v_item         record;
  v_produto      record;
  v_ja_comprado  integer;
  v_vendido      integer;
  v_olist        integer;
  v_unidades     integer := 0;
  v_valor        numeric := 0;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Selecione pelo menos um produto.' using errcode = 'P0001';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;

  -- Estoque da Olist: trava os produtos (e componentes de kits) da compra, sempre na mesma ordem.
  perform public.travar_estoque_olist(array(
    select distinct (elem ->> 'produto_id')::uuid from jsonb_array_elements(p_itens) as elem
  ));

  for v_item in
    select (elem ->> 'produto_id')::uuid as produto_id,
           sum((elem ->> 'quantidade')::integer)::integer as quantidade
    from jsonb_array_elements(p_itens) as elem
    group by 1
  loop
    continue when v_item.quantidade is null or v_item.quantidade <= 0;

    -- Trava a linha do item para evitar vender além do estoque em pedidos simultâneos.
    select pvi.preco, pvi.limite_por_cliente, pvi.quantidade_disponivel,
           p.id, p.nome, p.volume_ml
      into v_produto
    from public.pre_venda_itens pvi
    join public.produtos p on p.id = pvi.produto_id
    where pvi.pre_venda_id = p_pre_venda_id
      and pvi.produto_id = v_item.produto_id
    for update of pvi;

    if not found then
      raise exception 'Um dos produtos não faz parte desta pré-venda.' using errcode = 'P0001';
    end if;

    if v_produto.limite_por_cliente is not null then
      select coalesce(sum(pi.quantidade), 0) into v_ja_comprado
      from public.pedido_itens pi
      join public.pedidos pe on pe.id = pi.pedido_id
      where pi.pre_venda_id = p_pre_venda_id
        and pi.produto_id = v_item.produto_id
        and pe.cliente_id = v_pedido.cliente_id
        and pe.status <> 'cancelado';

      if v_ja_comprado + v_item.quantidade > v_produto.limite_por_cliente then
        raise exception 'Limite de % unidade(s) por cliente para %.',
          v_produto.limite_por_cliente, v_produto.nome using errcode = 'P0001';
      end if;
    end if;

    if v_produto.quantidade_disponivel is not null then
      select coalesce(sum(pi.quantidade), 0) into v_vendido
      from public.pedido_itens pi
      join public.pedidos pe on pe.id = pi.pedido_id
      where pi.pre_venda_id = p_pre_venda_id
        and pi.produto_id = v_item.produto_id
        and pe.status <> 'cancelado';

      if v_vendido + v_item.quantidade > v_produto.quantidade_disponivel then
        raise exception '% esgotou: restam % unidade(s).',
          v_produto.nome, greatest(v_produto.quantidade_disponivel - v_vendido, 0) using errcode = 'P0001';
      end if;
    end if;

    -- Produto vinculado à Olist: vale o estoque de lá (menos o que o CRM vendeu e ainda não lançou).
    v_olist := public.estoque_olist_produto(v_produto.id);
    if v_olist is not null and v_item.quantidade > v_olist then
      raise exception '% esgotou: restam % unidade(s).', v_produto.nome, greatest(v_olist, 0) using errcode = 'P0001';
    end if;

    update public.pedido_itens
    set quantidade = quantidade + v_item.quantidade
    where pedido_id = p_pedido_id
      and pre_venda_id = p_pre_venda_id
      and produto_id = v_produto.id
      and preco_unitario = v_produto.preco;

    if not found then
      insert into public.pedido_itens (pedido_id, pre_venda_id, produto_id, descricao, preco_unitario, quantidade)
      values (
        p_pedido_id,
        p_pre_venda_id,
        v_produto.id,
        v_produto.nome || coalesce(' · ' || v_produto.volume_ml || ' ml', ''),
        v_produto.preco,
        v_item.quantidade
      );
    end if;

    v_unidades := v_unidades + v_item.quantidade;
    v_valor := v_valor + v_produto.preco * v_item.quantidade;
  end loop;

  if v_unidades = 0 then
    raise exception 'Selecione pelo menos um produto.' using errcode = 'P0001';
  end if;

  return jsonb_build_object('unidades', v_unidades, 'valor', v_valor);
end;
$$;

-- Itens da pré-venda: o "restante" passa a considerar o estoque da Olist (colunas novas no fim).
create or replace view public.vw_pre_venda_itens
with (security_invoker = true)
as
select
  pvi.*,
  p.nome,
  p.estilo,
  p.cervejaria,
  p.volume_ml,
  p.teor_alcoolico,
  p.descricao,
  p.imagem_url,
  coalesce(v.vendido, 0) as vendido,
  case
    when pvi.quantidade_disponivel is null and o.estoque is null then null
    when o.estoque is null then greatest(pvi.quantidade_disponivel - coalesce(v.vendido, 0), 0)
    when pvi.quantidade_disponivel is null then greatest(o.estoque, 0)
    else greatest(least(pvi.quantidade_disponivel - coalesce(v.vendido, 0), o.estoque), 0)
  end as restante,
  p.fotos,
  p.cervejas_do_kit,
  p.olist_id,
  o.estoque as estoque_olist
from public.pre_venda_itens pvi
join public.produtos p on p.id = pvi.produto_id
left join lateral (
  select sum(i.quantidade)::integer as vendido
  from public.pedido_itens i
  join public.pedidos pe on pe.id = i.pedido_id
  where i.pre_venda_id = pvi.pre_venda_id
    and i.produto_id = pvi.produto_id
    and pe.status <> 'cancelado'
) v on true
cross join lateral (select public.estoque_olist_produto(pvi.produto_id) as estoque) o;

-- -----------------------------------------------------------------------------
-- Fila: o servidor pega lotes para enviar; leituras do estoque não se repetem
-- -----------------------------------------------------------------------------

create or replace function public.reservar_movimentos_olist(p_limite integer default 200)
returns setof public.movimentos_estoque_olist
language sql
security definer
set search_path = ''
as $$
  with alvo as (
    select m.id
    from public.movimentos_estoque_olist m
    where m.status = 'pendente' and m.proximo_envio_em <= now()
    order by m.olist_produto_id, m.id
    limit greatest(coalesce(p_limite, 200), 1)
    for update skip locked
  )
  update public.movimentos_estoque_olist m
  set status = 'enviando', enviando_desde = now(), tentativas = m.tentativas + 1
  from alvo
  where m.id = alvo.id
  returning m.*;
$$;

-- Produtos cujo estoque deve ser lido agora (leitura velha e ninguém lendo). Marca a leitura.
create or replace function public.reservar_leitura_estoque_olist(p_ids bigint[], p_idade_segundos integer default 0)
returns bigint[]
language sql
security definer
set search_path = ''
as $$
  with alvo as (
    insert into public.estoque_olist (id)
    select distinct x from unnest(p_ids) as x
    on conflict (id) do nothing
    returning id
  ),
  reservados as (
    update public.estoque_olist e
    set atualizando_desde = now()
    where e.id = any (p_ids)
      and (e.lido_em is null or e.lido_em < now() - make_interval(secs => greatest(coalesce(p_idade_segundos, 0), 0)))
      and (e.atualizando_desde is null or e.atualizando_desde < now() - interval '1 minute')
    returning e.id
  )
  select coalesce(array_agg(r.id), '{}') from (select id from reservados union select id from alvo) r;
$$;

-- Produtos da Olist nas pré-vendas ativas (e componentes dos kits): a rotina mantém atualizados.
create or replace function public.produtos_olist_em_uso()
returns bigint[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct c.olist_id), '{}')
  from public.pre_venda_itens pvi
  join public.pre_vendas pv on pv.id = pvi.pre_venda_id
  cross join lateral public.componentes_olist(pvi.produto_id) c
  where pv.status = 'ativa' and (pv.encerra_em is null or pv.encerra_em > now() - interval '1 day');
$$;

-- Aviso no sino dos administradores (um só por vez: repetições somam no mesmo aviso).
create or replace function public.avisar_estoque_olist(p_titulo text, p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notificacoes n
  set quantidade = n.quantidade + 1, titulo = p_titulo, texto = p_texto, criado_em = now()
  where n.tipo = 'estoque_olist' and n.lida_em is null;

  insert into public.notificacoes (perfil_id, tipo, titulo, texto)
  select p.id, 'estoque_olist', p_titulo, p_texto
  from public.perfis p
  where p.ativo and p.papel = 'admin'
    and not exists (
      select 1 from public.notificacoes n
      where n.perfil_id = p.id and n.tipo = 'estoque_olist' and n.lida_em is null
    );
end;
$$;

-- Equipe resolve um lançamento travado: tentar de novo ou marcar como resolvido à mão.
create or replace function public.resolver_movimento_olist(p_id bigint, p_acao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores resolvem lançamentos de estoque.' using errcode = '42501';
  end if;
  if p_acao = 'reenviar' then
    update public.movimentos_estoque_olist
    set status = 'pendente', proximo_envio_em = now(), ultimo_erro = null, enviando_desde = null
    where id = p_id and status in ('erro', 'conferir');
  elsif p_acao = 'ignorar' then
    -- "Já resolvi na Olist": não envia; a próxima leitura do estoque traz o número certo.
    update public.movimentos_estoque_olist
    set status = 'ignorado', enviado_em = now(), enviando_desde = null
    where id = p_id and status in ('erro', 'conferir');
  else
    raise exception 'Ação inválida.' using errcode = 'P0001';
  end if;
  if not found then
    raise exception 'Este lançamento já foi resolvido.' using errcode = 'P0001';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Caixa VIP sem pagamento vence e devolve o estoque
-- -----------------------------------------------------------------------------

alter table public.configuracoes
  add column caixa_prazo_pagamento_dias integer not null default 7
    constraint configuracoes_caixa_prazo check (caixa_prazo_pagamento_dias between 0 and 60);

comment on column public.configuracoes.caixa_prazo_pagamento_dias is 'Caixa VIP sem nenhum pagamento é cancelada sozinha depois de N dias (da última compra, do fechamento ou da última cobrança) e devolve o estoque. 0 = nunca.';

alter table public.notificacoes drop constraint notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check (tipo in (
  'tarefa_atribuida', 'tarefa_comentario', 'tarefa_impedida', 'tarefa_desimpedida', 'tarefa_prazo', 'tarefa_concluida',
  'whatsapp_mensagem', 'atendimento_transferido', 'pix_recebido', 'estoque_olist', 'caixa_vencida'
));

create or replace function public.vencer_caixas_vip()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dias     integer;
  v_caixa    record;
  v_numeros  text[] := '{}';
  v_ultimo   uuid;
begin
  select coalesce(c.caixa_prazo_pagamento_dias, 0) into v_dias from public.configuracoes c where c.id = 1;
  if coalesce(v_dias, 0) <= 0 then
    return 0;
  end if;

  perform set_config('prometheus.motivo_estoque', 'caixa_vencida', true);

  for v_caixa in
    select pe.id, pe.cliente_id, pe.numero
    from public.pedidos pe
    where pe.caixa is not null
      and pe.status in ('novo', 'confirmado')
      and pe.status_pagamento in ('pendente', 'cobrado')
      and pe.pago_fora_pix = 0
      -- Nada pago e nenhum PIX em aberto (quem está pagando agora não perde a caixa).
      and not exists (
        select 1 from public.cobrancas_pix c
        where c.pedido_id = pe.id
          and (c.status = 'pago'
               or (c.status in ('criando', 'pendente') and coalesce(c.expira_em, c.criado_em + interval '1 day') > now()))
      )
      and greatest(
            pe.criado_em,
            pe.caixa_fechada_em,
            pe.ultima_cobranca_em,
            (select max(a.criado_em) from public.atividades a where a.pedido_id = pe.id and a.tipo = 'caixa_itens_adicionados')
          ) < now() - make_interval(days => v_dias)
    order by pe.criado_em
    limit 200
    for update of pe skip locked
  loop
    update public.pedidos
    set status = 'cancelado',
        observacoes = concat_ws(E'\n', observacoes,
          format('Caixa VIP cancelada sozinha: %s dia(s) sem pagamento. As cervejas voltaram ao estoque.', v_dias))
    where id = v_caixa.id;

    insert into public.atividades (cliente_id, pedido_id, tipo, descricao, dados, autor_id)
    values (
      v_caixa.cliente_id, v_caixa.id, 'caixa_vencida',
      format('Caixa VIP #%s cancelada: %s dia(s) sem pagamento — as cervejas voltaram ao estoque', v_caixa.numero, v_dias),
      jsonb_build_object('prazo_dias', v_dias),
      null
    );

    v_numeros := v_numeros || ('#PRM-' || v_caixa.numero);
    v_ultimo := v_caixa.id;
  end loop;

  perform set_config('prometheus.motivo_estoque', '', true);

  if cardinality(v_numeros) > 0 then
    insert into public.notificacoes (perfil_id, tipo, pedido_id, titulo, texto)
    select p.id, 'caixa_vencida',
           case when cardinality(v_numeros) = 1 then v_ultimo end,
           case when cardinality(v_numeros) = 1 then 'Caixa VIP cancelada por falta de pagamento'
                else format('%s Caixas VIP canceladas por falta de pagamento', cardinality(v_numeros)) end,
           format('%s · %s dia(s) sem pagamento. As cervejas voltaram ao estoque.', array_to_string(v_numeros[1:5], ', ')
                  || case when cardinality(v_numeros) > 5 then format(' e mais %s', cardinality(v_numeros) - 5) else '' end, v_dias)
    from public.perfis p
    where p.ativo and p.papel = 'admin';
  end if;

  return cardinality(v_numeros);
end;
$$;

-- -----------------------------------------------------------------------------
-- Segurança: a equipe só LÊ estoque e fila; quem escreve é o banco (gatilhos) e o servidor
-- -----------------------------------------------------------------------------

alter table public.estoque_olist enable row level security;
alter table public.movimentos_estoque_olist enable row level security;

create policy "Equipe lê o estoque da Olist"
  on public.estoque_olist for select to authenticated
  using ((select public.eh_membro_equipe()));

create policy "Equipe lê os lançamentos de estoque"
  on public.movimentos_estoque_olist for select to authenticated
  using ((select public.eh_membro_equipe()));

revoke all on public.estoque_olist, public.movimentos_estoque_olist from anon, authenticated;
grant select on public.estoque_olist, public.movimentos_estoque_olist to authenticated;
grant all on public.estoque_olist, public.movimentos_estoque_olist to service_role;

revoke execute on function
  public.componentes_olist(uuid),
  public.estoque_olist_efetivo(bigint),
  public.estoque_olist_produto(uuid),
  public.estoques_olist_produtos(uuid[]),
  public.travar_estoque_olist(uuid[]),
  public.ajustar_estoque_olist_item(uuid, uuid, integer, uuid, text),
  public.estoque_olist_do_item(),
  public.estoque_olist_do_pedido(),
  public.reservar_movimentos_olist(integer),
  public.reservar_leitura_estoque_olist(bigint[], integer),
  public.produtos_olist_em_uso(),
  public.avisar_estoque_olist(text, text),
  public.resolver_movimento_olist(bigint, text),
  public.vencer_caixas_vip()
from public, anon;

grant execute on function
  public.componentes_olist(uuid),
  public.estoque_olist_efetivo(bigint),
  public.estoque_olist_produto(uuid),
  public.estoques_olist_produtos(uuid[]),
  public.travar_estoque_olist(uuid[]),
  public.resolver_movimento_olist(bigint, text)
to authenticated, service_role;

grant execute on function
  public.ajustar_estoque_olist_item(uuid, uuid, integer, uuid, text),
  public.reservar_movimentos_olist(integer),
  public.reservar_leitura_estoque_olist(bigint[], integer),
  public.produtos_olist_em_uso(),
  public.avisar_estoque_olist(text, text),
  public.vencer_caixas_vip()
to service_role;
