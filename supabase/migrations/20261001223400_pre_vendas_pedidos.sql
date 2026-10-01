-- =============================================================================
-- PROMETHEUS CRM · 05 · PRÉ-VENDAS, PEDIDOS E LINHA DO TEMPO
--
-- Fluxo da pré-venda:
--   1. A equipe cria uma pré-venda (campanha) com as cervejas e preços.
--   2. O link público /p/{slug} é disparado no WhatsApp (grupo VIP, listas...).
--   3. O cliente informa o WhatsApp. Se já tem cadastro, o sistema puxa tudo;
--      se não, ele preenche nome e endereço uma única vez.
--   4. O cliente escolhe as cervejas e confirma → registrar_pedido_pre_venda().
-- =============================================================================

create type public.canal_venda as enum ('grupo_vip', 'whatsapp', 'loja', 'shopify', 'app');
create type public.status_pre_venda as enum ('rascunho', 'ativa', 'encerrada');
create type public.status_pedido as enum ('novo', 'confirmado', 'separado', 'entregue', 'cancelado');
create type public.status_pagamento as enum ('pendente', 'cobrado', 'pago', 'estornado');
create type public.origem_pedido as enum ('link', 'manual', 'shopify', 'app', 'api');

-- -----------------------------------------------------------------------------
-- Pré-vendas (campanhas com link público)
-- -----------------------------------------------------------------------------

create table public.pre_vendas (
  id                uuid primary key default gen_random_uuid(),
  titulo            text not null check (length(trim(titulo)) > 0),
  descricao         text,
  slug              text not null unique
                      default lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  canal             public.canal_venda not null default 'grupo_vip',
  status            public.status_pre_venda not null default 'ativa',
  encerra_em        timestamptz,
  previsao_entrega  date,
  taxa_entrega      numeric(12, 2) not null default 0 check (taxa_entrega >= 0),
  criado_por        uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  constraint pre_vendas_slug_formato check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60)
);

comment on table public.pre_vendas is 'Campanhas de pré-venda. O link público é /p/{slug}.';
comment on column public.pre_vendas.encerra_em is 'Após esta data o link para de aceitar pedidos.';

create trigger pre_vendas_atualizado_em
  before update on public.pre_vendas
  for each row execute function public.definir_atualizado_em();

create table public.pre_venda_itens (
  id                      uuid primary key default gen_random_uuid(),
  pre_venda_id            uuid not null references public.pre_vendas (id) on delete cascade,
  produto_id              uuid not null references public.produtos (id) on delete restrict,
  preco                   numeric(12, 2) not null check (preco >= 0),
  limite_por_cliente      integer check (limite_por_cliente is null or limite_por_cliente > 0),
  quantidade_disponivel   integer check (quantidade_disponivel is null or quantidade_disponivel >= 0),
  ordem                   integer not null default 0,
  unique (pre_venda_id, produto_id)
);

comment on table public.pre_venda_itens is 'Produtos ofertados em cada pré-venda, com preço próprio e limites opcionais.';
comment on column public.pre_venda_itens.quantidade_disponivel is 'Estoque total da pré-venda (null = ilimitado).';

create index pre_venda_itens_produto_idx on public.pre_venda_itens (produto_id);

-- -----------------------------------------------------------------------------
-- Pedidos
-- -----------------------------------------------------------------------------

create table public.pedidos (
  id                  uuid primary key default gen_random_uuid(),
  numero              bigint generated always as identity (start with 10001) unique,
  cliente_id          uuid not null references public.clientes (id) on delete restrict,
  pre_venda_id        uuid references public.pre_vendas (id) on delete set null,
  canal               public.canal_venda not null default 'whatsapp',
  origem              public.origem_pedido not null default 'manual',
  status              public.status_pedido not null default 'novo',
  status_pagamento    public.status_pagamento not null default 'pendente',
  subtotal            numeric(12, 2) not null default 0 check (subtotal >= 0),
  taxa_entrega        numeric(12, 2) not null default 0 check (taxa_entrega >= 0),
  desconto            numeric(12, 2) not null default 0 check (desconto >= 0),
  total               numeric(12, 2) not null generated always as (greatest(subtotal + taxa_entrega - desconto, 0)) stored,
  endereco_entrega    jsonb,
  observacoes         text,
  cobrancas_enviadas  integer not null default 0,
  ultima_cobranca_em  timestamptz,
  pago_em             timestamptz,
  forma_pagamento     text,
  shopify_order_id    text unique,
  criado_por          uuid references public.perfis (id) on delete set null,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

comment on table public.pedidos is 'Pedidos de todos os canais. Itens em pedido_itens; subtotal é recalculado por trigger.';
comment on column public.pedidos.numero is 'Número amigável exibido como #PRM-10001.';
comment on column public.pedidos.endereco_entrega is 'Cópia do endereço no momento do pedido.';

create index pedidos_cliente_idx on public.pedidos (cliente_id, criado_em desc);
create index pedidos_pre_venda_idx on public.pedidos (pre_venda_id);
create index pedidos_canal_idx on public.pedidos (canal, criado_em desc);
create index pedidos_pagamento_idx on public.pedidos (status_pagamento) where status <> 'cancelado';

create table public.pedido_itens (
  id              uuid primary key default gen_random_uuid(),
  pedido_id       uuid not null references public.pedidos (id) on delete cascade,
  produto_id      uuid references public.produtos (id) on delete set null,
  descricao       text not null,
  preco_unitario  numeric(12, 2) not null check (preco_unitario >= 0),
  quantidade      integer not null check (quantidade > 0),
  total           numeric(12, 2) not null generated always as (preco_unitario * quantidade) stored
);

comment on column public.pedido_itens.descricao is 'Nome do produto no momento da venda.';

create index pedido_itens_pedido_idx on public.pedido_itens (pedido_id);
create index pedido_itens_produto_idx on public.pedido_itens (produto_id);

create trigger pedidos_atualizado_em
  before update on public.pedidos
  for each row execute function public.definir_atualizado_em();

-- Data de pagamento acompanha o status do pagamento.
create or replace function public.normalizar_pedido()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status_pagamento = 'pago' then
    new.pago_em := coalesce(new.pago_em, now());
  else
    new.pago_em := null;
  end if;
  return new;
end;
$$;

create trigger pedidos_normalizar
  before insert or update on public.pedidos
  for each row execute function public.normalizar_pedido();

-- Subtotal do pedido = soma dos itens.
create or replace function public.recalcular_subtotal_pedido()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_pedido_id uuid;
begin
  if tg_op = 'DELETE' then
    v_pedido_id := old.pedido_id;
  else
    v_pedido_id := new.pedido_id;
  end if;

  update public.pedidos
  set subtotal = coalesce((select sum(i.total) from public.pedido_itens i where i.pedido_id = v_pedido_id), 0)
  where id = v_pedido_id;

  return null;
end;
$$;

create trigger pedido_itens_recalcular_subtotal
  after insert or update or delete on public.pedido_itens
  for each row execute function public.recalcular_subtotal_pedido();

-- -----------------------------------------------------------------------------
-- Linha do tempo (atividades do cliente e do pedido)
-- -----------------------------------------------------------------------------

create table public.atividades (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid references public.clientes (id) on delete cascade,
  pedido_id   uuid references public.pedidos (id) on delete cascade,
  tipo        text not null,
  descricao   text not null,
  dados       jsonb not null default '{}',
  autor_id    uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em   timestamptz not null default now()
);

comment on table public.atividades is 'Histórico de eventos exibido na ficha do cliente e do pedido.';

create index atividades_cliente_idx on public.atividades (cliente_id, criado_em desc);
create index atividades_pedido_idx on public.atividades (pedido_id, criado_em desc);

-- Registra na linha do tempo as mudanças de status do pedido e do pagamento.
create or replace function public.registrar_mudancas_pedido()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- "cobrado" é registrado por registrar_cobranca(), com mais contexto.
  if new.status_pagamento is distinct from old.status_pagamento and new.status_pagamento <> 'cobrado' then
    insert into public.atividades (cliente_id, pedido_id, tipo, descricao)
    values (
      new.cliente_id, new.id, 'pagamento_' || new.status_pagamento,
      format('Pedido #%s: %s', new.numero, case new.status_pagamento
        when 'pago' then 'pagamento confirmado'
        when 'pendente' then 'pagamento voltou para pendente'
        when 'estornado' then 'pagamento estornado'
      end)
    );
  end if;

  if new.status is distinct from old.status then
    insert into public.atividades (cliente_id, pedido_id, tipo, descricao)
    values (
      new.cliente_id, new.id, 'status_' || new.status,
      format('Pedido #%s marcado como %s', new.numero, new.status)
    );
  end if;

  return null;
end;
$$;

create trigger pedidos_registrar_mudancas
  after update of status, status_pagamento on public.pedidos
  for each row execute function public.registrar_mudancas_pedido();

-- -----------------------------------------------------------------------------
-- Funções de negócio (RPC)
-- -----------------------------------------------------------------------------

-- Cria um pedido completo de forma atômica, calculando os preços no banco.
--   p_itens: [{"produto_id": "uuid", "quantidade": 2}, ...]
-- Em pré-vendas usa o preço da pré-venda e respeita limite por cliente e estoque.
create or replace function public.criar_pedido(
  p_cliente_id    uuid,
  p_itens         jsonb,
  p_pre_venda_id  uuid default null,
  p_canal         public.canal_venda default null,
  p_origem        public.origem_pedido default 'manual',
  p_observacoes   text default null,
  p_endereco      jsonb default null,
  p_taxa_entrega  numeric default null,
  p_desconto      numeric default 0
)
returns public.pedidos
language plpgsql
set search_path = ''
as $$
declare
  v_cliente      public.clientes;
  v_pre_venda    public.pre_vendas;
  v_pedido       public.pedidos;
  v_item         record;
  v_produto      record;
  v_ja_comprado  integer;
  v_vendido      integer;
  v_qtd_itens    integer := 0;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Selecione pelo menos um produto.' using errcode = 'P0001';
  end if;

  select * into v_cliente from public.clientes where id = p_cliente_id;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0001';
  end if;

  if p_pre_venda_id is not null then
    select * into v_pre_venda from public.pre_vendas where id = p_pre_venda_id;
    if not found then
      raise exception 'Pré-venda não encontrada.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.pedidos (
    cliente_id, pre_venda_id, canal, origem, taxa_entrega, desconto,
    observacoes, endereco_entrega, criado_por
  )
  values (
    v_cliente.id,
    v_pre_venda.id,
    coalesce(p_canal, v_pre_venda.canal, 'whatsapp'),
    coalesce(p_origem, 'manual'),
    coalesce(p_taxa_entrega, v_pre_venda.taxa_entrega, 0),
    coalesce(p_desconto, 0),
    nullif(trim(p_observacoes), ''),
    coalesce(p_endereco, public.endereco_do_cliente(v_cliente)),
    (select auth.uid())
  )
  returning * into v_pedido;

  for v_item in
    select (elem ->> 'produto_id')::uuid as produto_id,
           sum((elem ->> 'quantidade')::integer)::integer as quantidade
    from jsonb_array_elements(p_itens) as elem
    group by 1
  loop
    continue when v_item.quantidade is null or v_item.quantidade <= 0;

    if v_pre_venda.id is not null then
      -- Trava a linha do item para evitar vender além do estoque em pedidos simultâneos.
      select pvi.preco, pvi.limite_por_cliente, pvi.quantidade_disponivel,
             p.id, p.nome, p.volume_ml
        into v_produto
      from public.pre_venda_itens pvi
      join public.produtos p on p.id = pvi.produto_id
      where pvi.pre_venda_id = v_pre_venda.id
        and pvi.produto_id = v_item.produto_id
      for update of pvi;

      if not found then
        raise exception 'Um dos produtos não faz parte desta pré-venda.' using errcode = 'P0001';
      end if;

      if v_produto.limite_por_cliente is not null then
        select coalesce(sum(pi.quantidade), 0) into v_ja_comprado
        from public.pedido_itens pi
        join public.pedidos pe on pe.id = pi.pedido_id
        where pe.pre_venda_id = v_pre_venda.id
          and pe.cliente_id = v_cliente.id
          and pe.status <> 'cancelado'
          and pi.produto_id = v_item.produto_id;

        if v_ja_comprado + v_item.quantidade > v_produto.limite_por_cliente then
          raise exception 'Limite de % unidade(s) por cliente para %.',
            v_produto.limite_por_cliente, v_produto.nome using errcode = 'P0001';
        end if;
      end if;

      if v_produto.quantidade_disponivel is not null then
        select coalesce(sum(pi.quantidade), 0) into v_vendido
        from public.pedido_itens pi
        join public.pedidos pe on pe.id = pi.pedido_id
        where pe.pre_venda_id = v_pre_venda.id
          and pe.status <> 'cancelado'
          and pi.produto_id = v_item.produto_id;

        if v_vendido + v_item.quantidade > v_produto.quantidade_disponivel then
          raise exception '% esgotou: restam % unidade(s).',
            v_produto.nome, greatest(v_produto.quantidade_disponivel - v_vendido, 0) using errcode = 'P0001';
        end if;
      end if;
    else
      select p.preco, null::integer as limite_por_cliente, null::integer as quantidade_disponivel,
             p.id, p.nome, p.volume_ml
        into v_produto
      from public.produtos p
      where p.id = v_item.produto_id and p.ativo;

      if not found then
        raise exception 'Produto não encontrado ou inativo.' using errcode = 'P0001';
      end if;
    end if;

    insert into public.pedido_itens (pedido_id, produto_id, descricao, preco_unitario, quantidade)
    values (
      v_pedido.id,
      v_produto.id,
      v_produto.nome || coalesce(' · ' || v_produto.volume_ml || ' ml', ''),
      v_produto.preco,
      v_item.quantidade
    );

    v_qtd_itens := v_qtd_itens + 1;
  end loop;

  if v_qtd_itens = 0 then
    raise exception 'Selecione pelo menos um produto.' using errcode = 'P0001';
  end if;

  select * into v_pedido from public.pedidos where id = v_pedido.id;

  insert into public.atividades (cliente_id, pedido_id, tipo, descricao, dados)
  values (
    v_cliente.id, v_pedido.id, 'pedido_criado',
    format('Pedido #%s criado%s', v_pedido.numero,
           coalesce(' na pré-venda "' || v_pre_venda.titulo || '"', '')),
    jsonb_build_object('total', v_pedido.total, 'origem', v_pedido.origem, 'canal', v_pedido.canal)
  );

  return v_pedido;
end;
$$;

-- Cria (p_id nulo) ou atualiza uma pré-venda com seus itens de forma atômica.
--   p_dados: {titulo, descricao, slug, canal, status, encerra_em, previsao_entrega, taxa_entrega}
--   p_itens: [{produto_id, preco, limite_por_cliente, quantidade_disponivel}, ...] (na ordem de exibição)
create or replace function public.salvar_pre_venda(
  p_dados  jsonb,
  p_itens  jsonb,
  p_id     uuid default null
)
returns public.pre_vendas
language plpgsql
set search_path = ''
as $$
declare
  v_pre_venda public.pre_vendas;
begin
  if p_id is null then
    insert into public.pre_vendas (
      titulo, descricao, slug, canal, status, encerra_em, previsao_entrega, taxa_entrega
    )
    values (
      p_dados ->> 'titulo',
      nullif(trim(p_dados ->> 'descricao'), ''),
      coalesce(nullif(trim(p_dados ->> 'slug'), ''), lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
      coalesce((p_dados ->> 'canal')::public.canal_venda, 'grupo_vip'),
      coalesce((p_dados ->> 'status')::public.status_pre_venda, 'ativa'),
      (p_dados ->> 'encerra_em')::timestamptz,
      (p_dados ->> 'previsao_entrega')::date,
      coalesce((p_dados ->> 'taxa_entrega')::numeric, 0)
    )
    returning * into v_pre_venda;
  else
    update public.pre_vendas
    set titulo           = p_dados ->> 'titulo',
        descricao        = nullif(trim(p_dados ->> 'descricao'), ''),
        slug             = coalesce(nullif(trim(p_dados ->> 'slug'), ''), slug),
        canal            = coalesce((p_dados ->> 'canal')::public.canal_venda, canal),
        status           = coalesce((p_dados ->> 'status')::public.status_pre_venda, status),
        encerra_em       = (p_dados ->> 'encerra_em')::timestamptz,
        previsao_entrega = (p_dados ->> 'previsao_entrega')::date,
        taxa_entrega     = coalesce((p_dados ->> 'taxa_entrega')::numeric, 0)
    where id = p_id
    returning * into v_pre_venda;

    if not found then
      raise exception 'Pré-venda não encontrada.' using errcode = 'P0001';
    end if;
  end if;

  delete from public.pre_venda_itens
  where pre_venda_id = v_pre_venda.id
    and produto_id not in (
      select (e ->> 'produto_id')::uuid from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) as e
    );

  insert into public.pre_venda_itens (
    pre_venda_id, produto_id, preco, limite_por_cliente, quantidade_disponivel, ordem
  )
  select
    v_pre_venda.id,
    (item.e ->> 'produto_id')::uuid,
    (item.e ->> 'preco')::numeric,
    (item.e ->> 'limite_por_cliente')::integer,
    (item.e ->> 'quantidade_disponivel')::integer,
    item.ordem::integer
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) with ordinality as item(e, ordem)
  on conflict (pre_venda_id, produto_id) do update
  set preco                 = excluded.preco,
      limite_por_cliente    = excluded.limite_por_cliente,
      quantidade_disponivel = excluded.quantidade_disponivel,
      ordem                 = excluded.ordem;

  if not exists (select 1 from public.pre_venda_itens where pre_venda_id = v_pre_venda.id) then
    raise exception 'Adicione pelo menos uma cerveja à pré-venda.' using errcode = 'P0001';
  end if;

  return v_pre_venda;
end;
$$;

-- Registra uma cobrança enviada (WhatsApp) e marca o pedido como "cobrado".
create or replace function public.registrar_cobranca(p_pedido_id uuid)
returns public.pedidos
language plpgsql
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
begin
  update public.pedidos
  set cobrancas_enviadas = cobrancas_enviadas + 1,
      ultima_cobranca_em = now(),
      status_pagamento = case when status_pagamento = 'pendente'
                              then 'cobrado'::public.status_pagamento
                              else status_pagamento end
  where id = p_pedido_id
  returning * into v_pedido;

  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;

  insert into public.atividades (cliente_id, pedido_id, tipo, descricao)
  values (
    v_pedido.cliente_id, v_pedido.id, 'cobranca_enviada',
    format('%sª cobrança do pedido #%s enviada pelo WhatsApp', v_pedido.cobrancas_enviadas, v_pedido.numero)
  );

  return v_pedido;
end;
$$;

-- Identifica o cliente pelo WhatsApp no link público, devolvendo apenas dados
-- mascarados (o link é público: nunca expor endereço completo, e-mail ou CPF).
create or replace function public.identificar_cliente_pre_venda(p_whatsapp text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'encontrado', true,
        'primeiro_nome', split_part(c.nome, ' ', 1),
        'tem_endereco', c.logradouro is not null,
        'endereco_resumo', case when c.logradouro is null then null else
          left(c.logradouro, 12) || case when length(c.logradouro) > 12 then '…' else '' end
          || ', nº ' || coalesce(left(c.numero, 1) || repeat('*', greatest(length(c.numero) - 1, 0)), 's/n')
          || coalesce(' · ' || c.bairro, '')
          || coalesce(' · ' || c.cidade || coalesce('/' || c.uf, ''), '')
        end
      )
      from public.clientes c
      where c.whatsapp = public.normalizar_whatsapp(p_whatsapp)
    ),
    jsonb_build_object('encontrado', false)
  );
$$;

-- Registra um pedido vindo do link público da pré-venda.
--   p_cliente: {whatsapp, nome, email, cep, logradouro, numero, complemento,
--               bairro, cidade, uf, referencia}
-- Cliente novo → é cadastrado (uma única vez). Cliente existente → usa o
-- cadastro; o endereço só é alterado se p_atualizar_endereco = true.
create or replace function public.registrar_pedido_pre_venda(
  p_slug                text,
  p_cliente             jsonb,
  p_itens               jsonb,
  p_atualizar_endereco  boolean default false,
  p_observacoes         text default null
)
returns public.pedidos
language plpgsql
set search_path = ''
as $$
declare
  v_pre_venda          public.pre_vendas;
  v_cliente            public.clientes;
  v_whatsapp           text := public.normalizar_whatsapp(p_cliente ->> 'whatsapp');
  v_gravar_endereco    boolean;
begin
  select * into v_pre_venda from public.pre_vendas where slug = p_slug;
  if not found
     or v_pre_venda.status <> 'ativa'
     or (v_pre_venda.encerra_em is not null and v_pre_venda.encerra_em <= now()) then
    raise exception 'Esta pré-venda não está mais disponível.' using errcode = 'P0001';
  end if;

  if v_whatsapp is null or length(v_whatsapp) < 12 or length(v_whatsapp) > 15 then
    raise exception 'Informe um número de WhatsApp válido, com DDD.' using errcode = 'P0001';
  end if;

  select * into v_cliente from public.clientes where whatsapp = v_whatsapp for update;
  v_gravar_endereco := not found or p_atualizar_endereco or v_cliente.logradouro is null;

  if v_gravar_endereco and (
       coalesce(trim(p_cliente ->> 'logradouro'), '') = ''
    or coalesce(trim(p_cliente ->> 'numero'), '') = ''
    or coalesce(trim(p_cliente ->> 'bairro'), '') = ''
    or coalesce(trim(p_cliente ->> 'cidade'), '') = ''
    or coalesce(trim(p_cliente ->> 'uf'), '') = ''
  ) then
    raise exception 'Informe o endereço de entrega completo.' using errcode = 'P0001';
  end if;

  if v_cliente.id is null then
    if coalesce(trim(p_cliente ->> 'nome'), '') = '' then
      raise exception 'Informe seu nome.' using errcode = 'P0001';
    end if;

    insert into public.clientes (
      nome, whatsapp, email, cep, logradouro, numero, complemento,
      bairro, cidade, uf, referencia, origem, vip
    )
    values (
      p_cliente ->> 'nome', v_whatsapp, p_cliente ->> 'email',
      p_cliente ->> 'cep', p_cliente ->> 'logradouro', p_cliente ->> 'numero',
      nullif(trim(p_cliente ->> 'complemento'), ''), p_cliente ->> 'bairro',
      p_cliente ->> 'cidade', p_cliente ->> 'uf', nullif(trim(p_cliente ->> 'referencia'), ''),
      'pre_venda', v_pre_venda.canal = 'grupo_vip'
    )
    returning * into v_cliente;

    insert into public.atividades (cliente_id, tipo, descricao)
    values (v_cliente.id, 'cliente_criado',
            format('Cadastro feito pelo link da pré-venda "%s"', v_pre_venda.titulo));
  else
    if v_gravar_endereco then
      update public.clientes
      set cep = p_cliente ->> 'cep',
          logradouro = p_cliente ->> 'logradouro',
          numero = p_cliente ->> 'numero',
          complemento = nullif(trim(p_cliente ->> 'complemento'), ''),
          bairro = p_cliente ->> 'bairro',
          cidade = p_cliente ->> 'cidade',
          uf = p_cliente ->> 'uf',
          referencia = nullif(trim(p_cliente ->> 'referencia'), '')
      where id = v_cliente.id
      returning * into v_cliente;

      insert into public.atividades (cliente_id, tipo, descricao)
      values (v_cliente.id, 'endereco_atualizado', 'Endereço de entrega atualizado pelo link da pré-venda');
    end if;

    -- Quem compra pelo link do grupo VIP passa a ser VIP.
    if v_pre_venda.canal = 'grupo_vip' and not v_cliente.vip then
      update public.clientes set vip = true where id = v_cliente.id;
    end if;
  end if;

  return public.criar_pedido(
    p_cliente_id   => v_cliente.id,
    p_itens        => p_itens,
    p_pre_venda_id => v_pre_venda.id,
    p_origem       => 'link',
    p_observacoes  => p_observacoes
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Relatórios
-- -----------------------------------------------------------------------------

-- Quantidade vendida por cerveja (base do relatório do Grupo VIP).
create or replace function public.resumo_produtos_vendidos(
  p_canal             public.canal_venda default null,
  p_pre_venda_id      uuid default null,
  p_inicio            timestamptz default null,
  p_fim               timestamptz default null,
  p_status_pagamento  public.status_pagamento default null
)
returns table (
  produto_id  uuid,
  descricao   text,
  estilo      text,
  quantidade  integer,
  total       numeric,
  pedidos     integer
)
language sql
stable
set search_path = ''
as $$
  select
    pi.produto_id,
    min(pi.descricao) as descricao,
    min(pr.estilo) as estilo,
    sum(pi.quantidade)::integer as quantidade,
    sum(pi.total) as total,
    count(distinct pi.pedido_id)::integer as pedidos
  from public.pedido_itens pi
  join public.pedidos pe on pe.id = pi.pedido_id
  left join public.produtos pr on pr.id = pi.produto_id
  where pe.status <> 'cancelado'
    and (p_canal is null or pe.canal = p_canal)
    and (p_pre_venda_id is null or pe.pre_venda_id = p_pre_venda_id)
    and (p_inicio is null or pe.criado_em >= p_inicio)
    and (p_fim is null or pe.criado_em < p_fim)
    and (p_status_pagamento is null or pe.status_pagamento = p_status_pagamento)
  group by pi.produto_id, case when pi.produto_id is null then pi.descricao end
  order by quantidade desc, descricao;
$$;

-- Receita semanal por canal (gráfico da visão geral).
create or replace function public.receita_semanal(p_semanas integer default 12)
returns table (semana date, canal public.canal_venda, total numeric, pedidos integer)
language sql
stable
set search_path = ''
as $$
  select
    (date_trunc('week', pe.criado_em at time zone 'America/Sao_Paulo'))::date as semana,
    pe.canal,
    sum(pe.total) as total,
    count(*)::integer as pedidos
  from public.pedidos pe
  where pe.status <> 'cancelado'
    and pe.criado_em >= (
      date_trunc('week', now() at time zone 'America/Sao_Paulo')
      - make_interval(weeks => greatest(p_semanas, 1) - 1)
    ) at time zone 'America/Sao_Paulo'
  group by 1, 2
  order by 1, 2;
$$;

-- Indicadores da visão geral para um período [p_inicio, p_fim).
create or replace function public.metricas_painel(p_inicio timestamptz, p_fim timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with periodo as (
    select pe.total, pe.status_pagamento
    from public.pedidos pe
    where pe.status <> 'cancelado' and pe.criado_em >= p_inicio and pe.criado_em < p_fim
  )
  select jsonb_build_object(
    'receita',          coalesce((select sum(total) from periodo), 0),
    'pedidos',          (select count(*) from periodo),
    'ticket_medio',     coalesce((select round(avg(total), 2) from periodo), 0),
    'recebido',         coalesce((
                          select sum(pe.total) from public.pedidos pe
                          where pe.status <> 'cancelado' and pe.status_pagamento = 'pago'
                            and pe.pago_em >= p_inicio and pe.pago_em < p_fim
                        ), 0),
    'a_receber',        coalesce((
                          select sum(pe.total) from public.pedidos pe
                          where pe.status <> 'cancelado' and pe.status_pagamento in ('pendente', 'cobrado')
                        ), 0),
    'pedidos_a_receber', (
                          select count(*) from public.pedidos pe
                          where pe.status <> 'cancelado' and pe.status_pagamento in ('pendente', 'cobrado')
                        ),
    'clientes',         (select count(*) from public.clientes),
    'clientes_novos',   (select count(*) from public.clientes c where c.criado_em >= p_inicio and c.criado_em < p_fim),
    'clientes_vip',     (select count(*) from public.clientes c where c.vip),
    'pre_vendas_ativas', (
                          select count(*) from public.pre_vendas pv
                          where pv.status = 'ativa' and (pv.encerra_em is null or pv.encerra_em > now())
                        )
  );
$$;

-- -----------------------------------------------------------------------------
-- Visões (security_invoker: respeitam o RLS de quem consulta)
-- -----------------------------------------------------------------------------

create view public.vw_pedidos
with (security_invoker = true)
as
select
  pe.*,
  c.nome      as cliente_nome,
  c.whatsapp  as cliente_whatsapp,
  pv.titulo   as pre_venda_titulo,
  coalesce(q.unidades, 0) as unidades
from public.pedidos pe
join public.clientes c on c.id = pe.cliente_id
left join public.pre_vendas pv on pv.id = pe.pre_venda_id
left join lateral (
  select sum(i.quantidade)::integer as unidades
  from public.pedido_itens i
  where i.pedido_id = pe.id
) q on true;

create view public.vw_clientes
with (security_invoker = true)
as
select
  c.*,
  coalesce(r.pedidos, 0)      as pedidos,
  coalesce(r.total_gasto, 0)  as total_gasto,
  coalesce(r.em_aberto, 0)    as em_aberto,
  r.ultimo_pedido_em
from public.clientes c
left join lateral (
  select
    count(*)::integer as pedidos,
    sum(pe.total) as total_gasto,
    sum(pe.total) filter (where pe.status_pagamento in ('pendente', 'cobrado')) as em_aberto,
    max(pe.criado_em) as ultimo_pedido_em
  from public.pedidos pe
  where pe.cliente_id = c.id and pe.status <> 'cancelado'
) r on true;

create view public.vw_pre_vendas
with (security_invoker = true)
as
select
  pv.*,
  case
    when pv.status = 'ativa' and pv.encerra_em is not null and pv.encerra_em <= now()
      then 'encerrada'::public.status_pre_venda
    else pv.status
  end as status_efetivo,
  coalesce(r.pedidos, 0)    as pedidos,
  coalesce(r.total, 0)      as total_vendido,
  coalesce(r.recebido, 0)   as total_recebido,
  coalesce(u.unidades, 0)   as unidades
from public.pre_vendas pv
left join lateral (
  select
    count(*)::integer as pedidos,
    sum(pe.total) as total,
    sum(pe.total) filter (where pe.status_pagamento = 'pago') as recebido
  from public.pedidos pe
  where pe.pre_venda_id = pv.id and pe.status <> 'cancelado'
) r on true
left join lateral (
  select sum(i.quantidade)::integer as unidades
  from public.pedido_itens i
  join public.pedidos pe on pe.id = i.pedido_id
  where pe.pre_venda_id = pv.id and pe.status <> 'cancelado'
) u on true;

create view public.vw_pre_venda_itens
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
    when pvi.quantidade_disponivel is null then null
    else greatest(pvi.quantidade_disponivel - coalesce(v.vendido, 0), 0)
  end as restante
from public.pre_venda_itens pvi
join public.produtos p on p.id = pvi.produto_id
left join lateral (
  select sum(i.quantidade)::integer as vendido
  from public.pedido_itens i
  join public.pedidos pe on pe.id = i.pedido_id
  where pe.pre_venda_id = pvi.pre_venda_id
    and i.produto_id = pvi.produto_id
    and pe.status <> 'cancelado'
) v on true;

-- -----------------------------------------------------------------------------
-- Segurança
-- -----------------------------------------------------------------------------

alter table public.pre_vendas enable row level security;
alter table public.pre_venda_itens enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_itens enable row level security;
alter table public.atividades enable row level security;

create policy "Equipe gerencia pré-vendas"
  on public.pre_vendas for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe gerencia itens de pré-venda"
  on public.pre_venda_itens for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe gerencia pedidos"
  on public.pedidos for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe gerencia itens de pedido"
  on public.pedido_itens for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe vê a linha do tempo"
  on public.atividades for select to authenticated
  using ((select public.eh_membro_equipe()));

create policy "Equipe registra atividades"
  on public.atividades for insert to authenticated
  with check ((select public.eh_membro_equipe()));

-- As funções do link público só podem ser chamadas pelo servidor (chave secreta).
revoke all on function public.registrar_pedido_pre_venda(text, jsonb, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function public.identificar_cliente_pre_venda(text) from public, anon, authenticated;
grant execute on function public.registrar_pedido_pre_venda(text, jsonb, jsonb, boolean, text) to service_role;
grant execute on function public.identificar_cliente_pre_venda(text) to service_role;
