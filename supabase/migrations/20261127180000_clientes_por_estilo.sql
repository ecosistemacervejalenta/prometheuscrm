-- =============================================================================
-- Clientes por estilo: quem comprou cada estilo e cervejaria da loja da Shopify.
--
-- A loja organiza as cervejas em collections (IPA, Hazy IPA, Stout, Dogma, Chimay…), e cada
-- produto está em várias ao mesmo tempo. O CRM lê os pedidos da Shopify (rotina
-- /api/cron/clientes-por-estilo) e guarda, sem dado pessoal nas tabelas da loja:
--   · shopify_colecoes      — as collections, com o tipo (estilo, cervejaria, tema, ignorar):
--                             o CRM sugere e a equipe pode corrigir (tipo_manual);
--   · shopify_produtos      — os produtos comprados e as collections de cada um;
--   · shopify_compras/itens — os pedidos e o que veio em cada um, ligados ao cliente do CRM.
-- O comprador vira (ou é ligado a) um cliente em `clientes`: pelo ID da Shopify, pelo WhatsApp ou
-- pelo e-mail. Só os dados vazios do cadastro são preenchidos — nada que a equipe escreveu muda.
--
-- Para a campanha: publico_por_colecoes() responde "quem comprou estas collections" e
-- criar_lista_de_colecoes() grava o público como lista do Banco de Leads (pasta "Clientes da
-- loja"), que a campanha já sabe usar (DDD, repetidos e descadastros como hoje).
-- =============================================================================

create type public.tipo_colecao as enum ('estilo', 'cervejaria', 'tema', 'ignorar');

-- Collections da loja -------------------------------------------------------------------------

create table public.shopify_colecoes (
  id           text primary key,
  titulo       text not null,
  handle       text,
  tipo         public.tipo_colecao not null default 'estilo',
  -- A equipe escolheu o tipo: a leitura da loja não troca mais.
  tipo_manual  boolean not null default false,
  produtos     integer not null default 0,
  -- Sumiu da loja na última leitura (fica para não perder o histórico das compras).
  ativa        boolean not null default true,
  lida_em      timestamptz not null default now()
);

comment on table public.shopify_colecoes is 'Collections da loja da Shopify (estilos, cervejarias, temas). id = ID numérico da Shopify.';
comment on column public.shopify_colecoes.tipo is 'Sugerido pelo CRM ao ler a loja; a equipe corrige em Clientes › Por estilo › Organizar.';

-- Produtos comprados e suas collections --------------------------------------------------------

create table public.shopify_produtos (
  id           text primary key,
  titulo       text not null,
  marca        text,
  colecao_ids  text[] not null default '{}',
  lido_em      timestamptz not null default now()
);

comment on table public.shopify_produtos is 'Produtos da Shopify que já apareceram num pedido, com as collections em que estão (relidas 1x/dia).';

create index shopify_produtos_colecoes_idx on public.shopify_produtos using gin (colecao_ids);

-- Pedidos da loja (sem dado pessoal: o comprador é o cliente_id) ------------------------------

create table public.shopify_compras (
  id                 text primary key,
  numero             text,
  cliente_id         uuid references public.clientes (id) on delete set null,
  comprado_em        timestamptz not null,
  atualizado_em      timestamptz not null,
  status_financeiro  text,
  cancelado          boolean not null default false,
  teste              boolean not null default false,
  valor              numeric(12, 2) not null default 0,
  -- Conta como compra: pago (inteiro ou em parte), autorizado ou estornado só em parte.
  valida             boolean generated always as (
                       not cancelado and not teste
                       and coalesce(status_financeiro, '') in ('paid', 'partially_paid', 'partially_refunded', 'authorized')
                     ) stored,
  lida_em            timestamptz not null default now()
);

comment on table public.shopify_compras is 'Pedidos da loja da Shopify lidos pelo CRM. id = ID numérico do pedido na Shopify.';

create index shopify_compras_cliente_idx on public.shopify_compras (cliente_id, comprado_em desc) where valida;
create index shopify_compras_data_idx on public.shopify_compras (comprado_em desc) where valida;

create table public.shopify_compra_itens (
  compra_id   text not null references public.shopify_compras (id) on delete cascade,
  linha       smallint not null,
  produto_id  text,
  titulo      text not null,
  quantidade  integer not null check (quantidade > 0),
  primary key (compra_id, linha)
);

create index shopify_compra_itens_produto_idx on public.shopify_compra_itens (produto_id);

-- Estado da leitura ---------------------------------------------------------------------------

alter table public.configuracoes
  add column compras_sincronizado_ate    timestamptz,
  add column compras_sincronizado_em     timestamptz,
  add column compras_sincronizacao_erro  text,
  add column compras_historico_completo  boolean not null default false,
  add column colecoes_lidas_em           timestamptz;

comment on column public.configuracoes.compras_sincronizado_ate is 'Clientes por estilo: pedidos da Shopify lidos até esta data de atualização (cursor).';
comment on column public.configuracoes.compras_historico_completo is 'A loja inteira já foi lida desde o 1º pedido (precisa de read_all_orders); sem isso, só os últimos 60 dias.';

-- Segurança -----------------------------------------------------------------------------------
-- A equipe lê tudo e só troca o tipo das collections; o resto quem grava é a rotina (chave secreta).

alter table public.shopify_colecoes enable row level security;
alter table public.shopify_produtos enable row level security;
alter table public.shopify_compras enable row level security;
alter table public.shopify_compra_itens enable row level security;

create policy "Equipe vê as collections" on public.shopify_colecoes for select to authenticated
  using ((select public.eh_membro_equipe()));
create policy "Equipe classifica as collections" on public.shopify_colecoes for update to authenticated
  using ((select public.eh_membro_equipe())) with check ((select public.eh_membro_equipe()));
create policy "Equipe vê os produtos da loja" on public.shopify_produtos for select to authenticated
  using ((select public.eh_membro_equipe()));
create policy "Equipe vê as compras da loja" on public.shopify_compras for select to authenticated
  using ((select public.eh_membro_equipe()));
create policy "Equipe vê os itens das compras" on public.shopify_compra_itens for select to authenticated
  using ((select public.eh_membro_equipe()));

revoke all on public.shopify_colecoes, public.shopify_produtos, public.shopify_compras, public.shopify_compra_itens from anon, authenticated;
grant select on public.shopify_colecoes, public.shopify_produtos, public.shopify_compras, public.shopify_compra_itens to authenticated;
grant update (tipo, tipo_manual) on public.shopify_colecoes to authenticated;
grant select, insert, update, delete on public.shopify_colecoes, public.shopify_produtos, public.shopify_compras, public.shopify_compra_itens
  to service_role;

-- =============================================================================
-- Gravação (rotina com a chave secreta)
-- =============================================================================

-- Collections lidas da loja: p_colecoes = [{ id, titulo, handle, produtos, tipo }] com TODAS as
-- collections (o tipo é a sugestão do CRM; não troca o que a equipe escolheu). As que não vieram
-- ficam marcadas como fora da loja.
create or replace function public.registrar_colecoes_shopify(p_colecoes jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_qtd integer;
begin
  insert into public.shopify_colecoes as c (id, titulo, handle, produtos, tipo, ativa, lida_em)
  select x ->> 'id', trim(x ->> 'titulo'), x ->> 'handle', coalesce((x ->> 'produtos')::integer, 0),
         coalesce((x ->> 'tipo')::public.tipo_colecao, 'estilo'), true, now()
  from jsonb_array_elements(coalesce(p_colecoes, '[]')) as x
  where coalesce(x ->> 'id', '') <> '' and coalesce(trim(x ->> 'titulo'), '') <> ''
  on conflict (id) do update
  set titulo   = excluded.titulo,
      handle   = excluded.handle,
      produtos = excluded.produtos,
      tipo     = case when c.tipo_manual then c.tipo else excluded.tipo end,
      ativa    = true,
      lida_em  = now();
  get diagnostics v_qtd = row_count;

  -- Lista vazia = leitura que falhou, não loja sem collections: não marca nada como fora da loja.
  if v_qtd > 0 then
    update public.shopify_colecoes
    set ativa = false
    where ativa and id not in (select x ->> 'id' from jsonb_array_elements(p_colecoes) as x where x ->> 'id' is not null);
  end if;

  update public.configuracoes set colecoes_lidas_em = now() where id = 1;
  return v_qtd;
end;
$$;

-- Produtos: p_produtos = [{ id, titulo, marca, colecao_ids: [] }]. Produto apagado da loja vem
-- com { id, removido: true }: guarda as collections que já tinha e só anota que foi lido.
create or replace function public.registrar_produtos_shopify(p_produtos jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_qtd integer;
begin
  insert into public.shopify_produtos as p (id, titulo, marca, colecao_ids, lido_em)
  select x ->> 'id', coalesce(nullif(trim(x ->> 'titulo'), ''), 'Produto da loja'), nullif(trim(x ->> 'marca'), ''),
         coalesce(array(select jsonb_array_elements_text(x -> 'colecao_ids')), '{}'), now()
  from jsonb_array_elements(coalesce(p_produtos, '[]')) as x
  where coalesce(x ->> 'id', '') <> '' and not coalesce((x ->> 'removido')::boolean, false)
  on conflict (id) do update
  set titulo = excluded.titulo, marca = excluded.marca, colecao_ids = excluded.colecao_ids, lido_em = now();
  get diagnostics v_qtd = row_count;

  insert into public.shopify_produtos as p (id, titulo, lido_em)
  select x ->> 'id', coalesce(nullif(trim(x ->> 'titulo'), ''), 'Produto removido da loja'), now()
  from jsonb_array_elements(coalesce(p_produtos, '[]')) as x
  where coalesce(x ->> 'id', '') <> '' and coalesce((x ->> 'removido')::boolean, false)
  on conflict (id) do update set lido_em = now();

  return v_qtd;
end;
$$;

-- Cliente do pedido: acha pelo ID da Shopify, pelo WhatsApp (com ou sem o 9º dígito) ou pelo
-- e-mail; senão cria (origem shopify). Do cadastro achado, só preenche o que está vazio.
-- Retorna { id, novo }. Cliente anonimizado (LGPD) nunca é achado: os dados dele foram apagados.
create or replace function public.cliente_da_compra_shopify(p_cliente jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_shopify  text := nullif(trim(p_cliente ->> 'shopify_customer_id'), '');
  v_numero   text := public.normalizar_whatsapp(p_cliente ->> 'whatsapp');
  v_email    text := nullif(lower(trim(p_cliente ->> 'email')), '');
  v_nome     text := nullif(regexp_replace(trim(coalesce(p_cliente ->> 'nome', '')), '\s+', ' ', 'g'), '');
  v_uf       text := upper(nullif(trim(p_cliente ->> 'uf'), ''));
  v_id       uuid;
begin
  -- Só celular/fixo do Brasil (55 + DDD + 8 ou 9 dígitos); o resto não serve para o WhatsApp.
  if v_numero !~ '^55[1-9][0-9]9?[0-9]{8}$' then
    v_numero := null;
  end if;
  if v_uf !~ '^[A-Z]{2}$' then
    v_uf := null;
  end if;

  if v_shopify is not null then
    select id into v_id from public.clientes where shopify_customer_id = v_shopify;
  end if;
  if v_id is null and v_numero is not null then
    select id into v_id from public.clientes
    where whatsapp is not null and public.whatsapp_canonico(whatsapp) = public.whatsapp_canonico(v_numero)
    order by (whatsapp = v_numero) desc, criado_em
    limit 1;
  end if;
  if v_id is null and v_email is not null then
    select id into v_id from public.clientes where email = v_email order by criado_em limit 1;
  end if;

  if v_id is null then
    if v_nome is null and v_numero is null and v_email is null then
      return null; -- pedido sem nenhum dado do comprador
    end if;
    insert into public.clientes (nome, whatsapp, email, cep, cidade, uf, origem, shopify_customer_id)
    values (
      coalesce(v_nome, 'Cliente da loja'), v_numero, v_email,
      nullif(public.somente_digitos(p_cliente ->> 'cep'), ''), nullif(trim(p_cliente ->> 'cidade'), ''), v_uf,
      'shopify', v_shopify
    )
    returning id into v_id;
    return jsonb_build_object('id', v_id, 'novo', true);
  end if;

  update public.clientes c
  set shopify_customer_id = coalesce(c.shopify_customer_id,
        case when v_shopify is not null and not exists (select 1 from public.clientes o where o.shopify_customer_id = v_shopify) then v_shopify end),
      whatsapp = coalesce(c.whatsapp,
        case when v_numero is not null and not exists (select 1 from public.clientes o where o.whatsapp = v_numero) then v_numero end),
      email    = coalesce(c.email, v_email),
      cidade   = case when c.cidade is null and c.uf is null then nullif(trim(p_cliente ->> 'cidade'), '') else c.cidade end,
      uf       = case when c.cidade is null and c.uf is null then v_uf else c.uf end
  where c.id = v_id
    and c.anonimizado_em is null
    and (c.shopify_customer_id is null or c.whatsapp is null or c.email is null or (c.cidade is null and c.uf is null));

  return jsonb_build_object('id', v_id, 'novo', false);
end;
$$;

-- Pedidos lidos da Shopify (uma página): p_compras = [{
--   id, numero, comprado_em, atualizado_em, status_financeiro, cancelado, teste, valor,
--   cliente: { shopify_customer_id, nome, whatsapp, email, cidade, uf, cep },
--   itens: [{ produto_id, titulo, quantidade }] }]
-- Rodar de novo com o mesmo pedido só atualiza. O comprador só é procurado/criado quando o
-- pedido conta como compra (pago); depois de ligado, o pedido fica com o mesmo cliente.
create or replace function public.registrar_compras_shopify(p_compras jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_compra    jsonb;
  v_id        text;
  v_cliente   uuid;
  v_ligacao   jsonb;
  v_valida    boolean;
  v_novas     integer := 0;
  v_atualizadas integer := 0;
  v_clientes_novos integer := 0;
  v_existia   boolean;
begin
  for v_compra in select value from jsonb_array_elements(coalesce(p_compras, '[]')) loop
    v_id := nullif(v_compra ->> 'id', '');
    continue when v_id is null;

    select cliente_id, true into v_cliente, v_existia from public.shopify_compras where id = v_id;
    v_existia := coalesce(v_existia, false);

    v_valida := not coalesce((v_compra ->> 'cancelado')::boolean, false)
      and not coalesce((v_compra ->> 'teste')::boolean, false)
      and coalesce(v_compra ->> 'status_financeiro', '') in ('paid', 'partially_paid', 'partially_refunded', 'authorized');

    if v_cliente is null and v_valida then
      v_ligacao := public.cliente_da_compra_shopify(coalesce(v_compra -> 'cliente', '{}'));
      v_cliente := (v_ligacao ->> 'id')::uuid;
      if coalesce((v_ligacao ->> 'novo')::boolean, false) then
        v_clientes_novos := v_clientes_novos + 1;
      end if;
    end if;

    insert into public.shopify_compras as c (
      id, numero, cliente_id, comprado_em, atualizado_em, status_financeiro, cancelado, teste, valor, lida_em
    )
    values (
      v_id, v_compra ->> 'numero', v_cliente,
      (v_compra ->> 'comprado_em')::timestamptz,
      coalesce((v_compra ->> 'atualizado_em')::timestamptz, (v_compra ->> 'comprado_em')::timestamptz),
      nullif(v_compra ->> 'status_financeiro', ''),
      coalesce((v_compra ->> 'cancelado')::boolean, false),
      coalesce((v_compra ->> 'teste')::boolean, false),
      coalesce((v_compra ->> 'valor')::numeric, 0),
      now()
    )
    on conflict (id) do update
    set numero            = excluded.numero,
        cliente_id        = coalesce(c.cliente_id, excluded.cliente_id),
        atualizado_em     = excluded.atualizado_em,
        status_financeiro = excluded.status_financeiro,
        cancelado         = excluded.cancelado,
        teste             = excluded.teste,
        valor             = excluded.valor,
        lida_em           = now();

    delete from public.shopify_compra_itens where compra_id = v_id;
    insert into public.shopify_compra_itens (compra_id, linha, produto_id, titulo, quantidade)
    select v_id, (i.ordem)::smallint, nullif(i.item ->> 'produto_id', ''),
           coalesce(nullif(trim(i.item ->> 'titulo'), ''), 'Item da loja'), (i.item ->> 'quantidade')::integer
    from jsonb_array_elements(coalesce(v_compra -> 'itens', '[]')) with ordinality as i (item, ordem)
    where coalesce((i.item ->> 'quantidade')::integer, 0) > 0;

    if v_existia then v_atualizadas := v_atualizadas + 1; else v_novas := v_novas + 1; end if;
    v_cliente := null;
    v_existia := null;
  end loop;

  return jsonb_build_object('novas', v_novas, 'atualizadas', v_atualizadas, 'clientes_novos', v_clientes_novos);
end;
$$;

-- Produtos que faltam ler (nunca lidos ou lidos há mais de p_horas): a rotina busca as collections.
create or replace function public.produtos_shopify_para_ler(p_horas integer default 24, p_limite integer default 500)
returns setof text
language sql
stable
set search_path = ''
as $$
  select x.produto_id
  from (
    select distinct i.produto_id
    from public.shopify_compra_itens i
    where i.produto_id is not null
  ) x
  left join public.shopify_produtos p on p.id = x.produto_id
  where p.id is null or p.lido_em < now() - make_interval(hours => p_horas)
  order by p.lido_em nulls first
  limit p_limite;
$$;

revoke all on function public.registrar_colecoes_shopify(jsonb) from public, anon, authenticated;
revoke all on function public.registrar_produtos_shopify(jsonb) from public, anon, authenticated;
revoke all on function public.cliente_da_compra_shopify(jsonb) from public, anon, authenticated;
revoke all on function public.registrar_compras_shopify(jsonb) from public, anon, authenticated;
revoke all on function public.produtos_shopify_para_ler(integer, integer) from public, anon, authenticated;
grant execute on function public.registrar_colecoes_shopify(jsonb) to service_role;
grant execute on function public.registrar_produtos_shopify(jsonb) to service_role;
grant execute on function public.cliente_da_compra_shopify(jsonb) to service_role;
grant execute on function public.registrar_compras_shopify(jsonb) to service_role;
grant execute on function public.produtos_shopify_para_ler(integer, integer) to service_role;

-- =============================================================================
-- Leitura (equipe; respeita o RLS de quem chama)
-- =============================================================================

-- Itens comprados (só pedidos que contam como compra e com cliente), com as collections do produto.
create view public.vw_itens_comprados_loja
with (security_invoker = true) as
select c.id as compra_id, c.cliente_id, c.comprado_em, i.produto_id, i.titulo, i.quantidade, coalesce(p.colecao_ids, '{}') as colecao_ids
from public.shopify_compras c
join public.shopify_compra_itens i on i.compra_id = c.id
left join public.shopify_produtos p on p.id = i.produto_id
where c.valida and c.cliente_id is not null;

comment on view public.vw_itens_comprados_loja is 'Itens das compras válidas da loja (Shopify), com as collections de cada produto.';

revoke all on public.vw_itens_comprados_loja from anon;
grant select on public.vw_itens_comprados_loja to authenticated, service_role;

-- Quantos clientes compraram cada collection (desde p_desde; nulo = desde sempre).
create or replace function public.ranking_colecoes(p_desde timestamptz default null)
returns table (
  colecao_id    text,
  titulo        text,
  tipo          public.tipo_colecao,
  produtos      integer,
  compradores   integer,
  garrafas      integer,
  pedidos       integer,
  ultima_compra timestamptz
)
language sql
stable
set search_path = ''
as $$
  with compras as (
    select v.cliente_id, v.compra_id, v.comprado_em, v.quantidade, col.id as colecao_id
    from public.vw_itens_comprados_loja v
    cross join lateral unnest(v.colecao_ids) as col (id)
    where p_desde is null or v.comprado_em >= p_desde
  ),
  por_colecao as (
    select colecao_id,
           count(distinct cliente_id)::integer as compradores,
           sum(quantidade)::integer as garrafas,
           count(distinct compra_id)::integer as pedidos,
           max(comprado_em) as ultima_compra
    from compras
    group by colecao_id
  )
  select s.id, s.titulo, s.tipo, s.produtos,
         coalesce(r.compradores, 0), coalesce(r.garrafas, 0), coalesce(r.pedidos, 0), r.ultima_compra
  from public.shopify_colecoes s
  left join por_colecao r on r.colecao_id = s.id
  where s.tipo <> 'ignorar' and (s.ativa or r.compradores > 0)
  order by coalesce(r.compradores, 0) desc, coalesce(r.garrafas, 0) desc, s.titulo;
$$;

-- Público da campanha: clientes que compraram QUALQUER uma das collections (desde p_desde).
-- p_sem_compra_dias: só quem não compra NADA na loja há pelo menos N dias (recompra).
-- `recebe_campanha` = tem WhatsApp e não pediu para sair das campanhas.
create or replace function public.publico_por_colecoes(
  p_colecoes text[],
  p_desde timestamptz default null,
  p_sem_compra_dias integer default null
)
returns table (
  cliente_id       uuid,
  nome             text,
  whatsapp         text,
  email            text,
  cidade           text,
  uf               text,
  garrafas         integer,
  pedidos          integer,
  ultima_compra    timestamptz,
  ultima_na_loja   timestamptz,
  pedidos_na_loja  integer,
  colecoes         text[],
  recebe_campanha  boolean
)
language sql
stable
set search_path = ''
as $$
  with escolhidas as (
    select v.cliente_id, v.compra_id, v.comprado_em, v.quantidade,
           array(select x from unnest(v.colecao_ids) as x where x = any (p_colecoes)) as casadas
    from public.vw_itens_comprados_loja v
    where v.colecao_ids && p_colecoes
      and (p_desde is null or v.comprado_em >= p_desde)
  ),
  por_cliente as (
    select e.cliente_id,
           sum(e.quantidade)::integer as garrafas,
           count(distinct e.compra_id)::integer as pedidos,
           max(e.comprado_em) as ultima_compra
    from escolhidas e
    group by e.cliente_id
  ),
  casadas as (
    select e.cliente_id, array_agg(distinct c.id) as colecao_ids
    from escolhidas e
    cross join lateral unnest(e.casadas) as c (id)
    group by e.cliente_id
  ),
  na_loja as (
    select c.cliente_id, max(c.comprado_em) as ultima, count(*)::integer as pedidos
    from public.shopify_compras c
    where c.valida and c.cliente_id in (select cliente_id from por_cliente)
    group by c.cliente_id
  )
  select cl.id, cl.nome, cl.whatsapp, cl.email, cl.cidade, cl.uf,
         p.garrafas, p.pedidos, p.ultima_compra, l.ultima, l.pedidos,
         array(select s.titulo from public.shopify_colecoes s where s.id = any (k.colecao_ids) order by s.titulo),
         cl.whatsapp is not null
           and not exists (select 1 from public.whatsapp_descadastros d where d.whatsapp = public.whatsapp_canonico(cl.whatsapp))
  from por_cliente p
  join casadas k on k.cliente_id = p.cliente_id
  join public.clientes cl on cl.id = p.cliente_id
  join na_loja l on l.cliente_id = p.cliente_id
  where cl.anonimizado_em is null
    and coalesce(array_length(p_colecoes, 1), 0) > 0
    and (p_sem_compra_dias is null or l.ultima < now() - make_interval(days => p_sem_compra_dias))
  order by p.garrafas desc, p.ultima_compra desc, cl.nome;
$$;

-- Gosto de um cliente: as collections que ele compra, com garrafas e a última compra.
create or replace function public.gosto_do_cliente(p_cliente_id uuid)
returns table (
  colecao_id    text,
  titulo        text,
  tipo          public.tipo_colecao,
  garrafas      integer,
  pedidos       integer,
  ultima_compra timestamptz
)
language sql
stable
set search_path = ''
as $$
  select s.id, s.titulo, s.tipo, sum(v.quantidade)::integer, count(distinct v.compra_id)::integer, max(v.comprado_em)
  from public.vw_itens_comprados_loja v
  cross join lateral unnest(v.colecao_ids) as col (id)
  join public.shopify_colecoes s on s.id = col.id and s.tipo <> 'ignorar'
  where v.cliente_id = p_cliente_id
  group by s.id, s.titulo, s.tipo
  order by sum(v.quantidade) desc, max(v.comprado_em) desc;
$$;

-- Grava o público como lista do Banco de Leads (pasta "Clientes da loja"), para a campanha.
-- Entram só os que recebem campanha (com WhatsApp e sem descadastro). Retorna
-- { lista_id, pasta_id, nome, total }.
create or replace function public.criar_lista_de_colecoes(
  p_nome text,
  p_colecoes text[],
  p_desde timestamptz default null,
  p_sem_compra_dias integer default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pasta  uuid;
  v_lista  uuid;
  v_base   text := left(coalesce(nullif(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'), ''), 'Clientes da loja'), 110);
  v_nome   text := v_base;
  v_n      integer := 1;
  v_total  integer;
begin
  if not public.eh_membro_equipe() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_colecoes, 1), 0) = 0 then
    raise exception 'Escolha ao menos uma collection.' using errcode = 'P0001';
  end if;

  select id into v_pasta from public.leads_pastas where lower(nome) = lower('Clientes da loja');
  if v_pasta is null then
    insert into public.leads_pastas (nome, descricao)
    values ('Clientes da loja', 'Listas criadas em Clientes › Por estilo, com quem comprou na loja da Shopify.')
    returning id into v_pasta;
  end if;

  while exists (select 1 from public.leads_listas where pasta_id = v_pasta and lower(nome) = lower(v_nome)) loop
    v_n := v_n + 1;
    v_nome := v_base || ' (' || v_n || ')';
  end loop;

  insert into public.leads_listas (pasta_id, nome, origem, colunas, coluna_nome, coluna_whatsapp, coluna_email, status)
  values (
    v_pasta, v_nome, 'Clientes por estilo (Shopify)',
    '[{"chave":"c0","rotulo":"Nome","tipo":"nome"},
      {"chave":"c1","rotulo":"WhatsApp","tipo":"telefone"},
      {"chave":"c2","rotulo":"E-mail","tipo":"email"},
      {"chave":"c3","rotulo":"Cidade","tipo":"texto"},
      {"chave":"c4","rotulo":"Comprou","tipo":"texto"},
      {"chave":"c5","rotulo":"Garrafas","tipo":"texto"},
      {"chave":"c6","rotulo":"Última compra","tipo":"texto"}]'::jsonb,
    'c0', 'c1', 'c2', 'importando'
  )
  returning id into v_lista;

  insert into public.leads (lista_id, linha, nome, whatsapp, email, dados)
  select v_lista, row_number() over (order by p.garrafas desc, p.ultima_compra desc, p.nome),
         p.nome, p.whatsapp, p.email,
         jsonb_strip_nulls(jsonb_build_object(
           'c0', p.nome,
           'c1', p.whatsapp,
           'c2', p.email,
           'c3', nullif(concat_ws(' / ', p.cidade, p.uf), ''),
           'c4', array_to_string(p.colecoes, ', '),
           'c5', p.garrafas::text,
           'c6', to_char(p.ultima_compra at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
         ))
  from public.publico_por_colecoes(p_colecoes, p_desde, p_sem_compra_dias) p
  where p.recebe_campanha;
  get diagnostics v_total = row_count;

  perform public.concluir_importacao_leads(v_lista);
  return jsonb_build_object('lista_id', v_lista, 'pasta_id', v_pasta, 'nome', v_nome, 'total', v_total);
end;
$$;

revoke all on function public.ranking_colecoes(timestamptz) from public, anon;
revoke all on function public.publico_por_colecoes(text[], timestamptz, integer) from public, anon;
revoke all on function public.gosto_do_cliente(uuid) from public, anon;
revoke all on function public.criar_lista_de_colecoes(text, text[], timestamptz, integer) from public, anon;
grant execute on function public.ranking_colecoes(timestamptz) to authenticated;
grant execute on function public.publico_por_colecoes(text[], timestamptz, integer) to authenticated;
grant execute on function public.gosto_do_cliente(uuid) to authenticated;
grant execute on function public.criar_lista_de_colecoes(text, text[], timestamptz, integer) to authenticated;
