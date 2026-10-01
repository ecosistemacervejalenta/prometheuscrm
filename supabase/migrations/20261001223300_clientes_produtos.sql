-- =============================================================================
-- PROMETHEUS CRM · 04 · CLIENTES E PRODUTOS
-- O WhatsApp normalizado é a chave de identificação do cliente: é por ele que
-- o link de pré-venda reconhece quem já tem cadastro.
-- =============================================================================

create type public.origem_cliente as enum ('manual', 'pre_venda', 'shopify', 'app', 'importacao');

create table public.clientes (
  id                   uuid primary key default gen_random_uuid(),
  nome                 text not null check (length(trim(nome)) > 0),
  whatsapp             text unique,
  email                text,
  cpf                  text,
  data_nascimento      date,
  -- Endereço de entrega principal
  cep                  text,
  logradouro           text,
  numero               text,
  complemento          text,
  bairro               text,
  cidade               text,
  uf                   text check (uf is null or uf ~ '^[A-Z]{2}$'),
  referencia           text,
  -- Relacionamento
  vip                  boolean not null default false,
  tags                 text[] not null default '{}',
  origem               public.origem_cliente not null default 'manual',
  observacoes          text,
  -- Integrações futuras
  shopify_customer_id  text unique,
  app_usuario_id       text unique,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);

comment on table public.clientes is 'Clientes da loja. whatsapp é único e normalizado (55 + DDD + número).';
comment on column public.clientes.whatsapp is 'Somente dígitos com DDI. Ex.: 5511987654321.';
comment on column public.clientes.shopify_customer_id is 'ID do cliente na Shopify (preenchido pela integração).';
comment on column public.clientes.app_usuario_id is 'ID do usuário no App próprio (integração futura).';

create index clientes_nome_idx on public.clientes (lower(nome));
create index clientes_vip_idx on public.clientes (vip) where vip;

create or replace function public.normalizar_cliente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome     := trim(new.nome);
  new.whatsapp := public.normalizar_whatsapp(new.whatsapp);
  new.email    := nullif(lower(trim(new.email)), '');
  new.cpf      := public.somente_digitos(new.cpf);
  new.cep      := public.somente_digitos(new.cep);
  new.uf       := nullif(upper(trim(new.uf)), '');
  new.tags     := coalesce(new.tags, '{}');
  return new;
end;
$$;

create trigger clientes_normalizar
  before insert or update on public.clientes
  for each row execute function public.normalizar_cliente();

create trigger clientes_atualizado_em
  before update on public.clientes
  for each row execute function public.definir_atualizado_em();

-- Endereço do cliente em JSON (usado como "foto" do endereço em cada pedido).
create or replace function public.endereco_do_cliente(p_cliente public.clientes)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when p_cliente.logradouro is null then null
    else jsonb_strip_nulls(jsonb_build_object(
      'cep',         p_cliente.cep,
      'logradouro',  p_cliente.logradouro,
      'numero',      p_cliente.numero,
      'complemento', p_cliente.complemento,
      'bairro',      p_cliente.bairro,
      'cidade',      p_cliente.cidade,
      'uf',          p_cliente.uf,
      'referencia',  p_cliente.referencia
    ))
  end;
$$;

-- Produtos (cervejas) --------------------------------------------------------------

create table public.produtos (
  id                  uuid primary key default gen_random_uuid(),
  nome                text not null check (length(trim(nome)) > 0),
  estilo              text,
  cervejaria          text,
  fornecedor_id       uuid references public.fornecedores (id) on delete set null,
  volume_ml           integer check (volume_ml is null or volume_ml > 0),
  teor_alcoolico      numeric(4, 1) check (teor_alcoolico is null or teor_alcoolico >= 0),
  descricao           text,
  preco               numeric(12, 2) not null default 0 check (preco >= 0),
  imagem_url          text,
  sku                 text unique,
  ativo               boolean not null default true,
  shopify_product_id  text,
  shopify_variant_id  text unique,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

comment on table public.produtos is 'Catálogo de cervejas e demais produtos vendidos.';
comment on column public.produtos.shopify_variant_id is 'Variante correspondente na Shopify (integração).';

create index produtos_ativo_idx on public.produtos (ativo, nome);

create trigger produtos_atualizado_em
  before update on public.produtos
  for each row execute function public.definir_atualizado_em();

-- Segurança --------------------------------------------------------------------

alter table public.clientes enable row level security;
alter table public.produtos enable row level security;

create policy "Equipe gerencia clientes"
  on public.clientes for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe gerencia produtos"
  on public.produtos for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));
