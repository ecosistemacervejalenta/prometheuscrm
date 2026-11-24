-- =============================================================================
-- Lotes e validades
--
-- Pedido do dono da loja (2026-11-24): um módulo só para registrar no CRM o lote e a
-- validade de cada cerveja.
--   • A cerveja entra pelo SKU: o CRM consulta o produto na Olist (só leitura) e guarda
--     foto principal, nome, SKU e as unidades em estoque de lá.
--   • Nada é enviado à Olist: estas tabelas não têm gatilho nem fila de lançamento.
--   • Cadastro próprio, separado do catálogo das pré-vendas (produtos): cadastrar uma
--     cerveja aqui não a vincula à baixa de estoque da Olist.
-- =============================================================================

-- Cervejas no controle -----------------------------------------------------------------

create table public.lotes_cervejas (
  id               uuid primary key default gen_random_uuid(),
  sku              text not null,
  olist_id         bigint not null,
  nome             text not null,
  foto_url         text,
  estoque_olist    numeric(12, 2),
  estoque_lido_em  timestamptz,
  criado_por       uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint lotes_cervejas_olist_id_key unique (olist_id),
  constraint lotes_cervejas_sku_check check (length(sku) between 1 and 60 and sku = btrim(sku)),
  constraint lotes_cervejas_nome_check check (length(nome) between 1 and 200)
);

comment on table public.lotes_cervejas is 'Cervejas do módulo Lotes e validades, trazidas da Olist pelo SKU (só leitura: nada volta para a Olist).';
comment on column public.lotes_cervejas.olist_id is 'Id do produto na Olist ERP (API v3), usado para reler nome e estoque.';
comment on column public.lotes_cervejas.foto_url is 'Foto principal copiada da Olist para o bucket "produtos".';
comment on column public.lotes_cervejas.estoque_olist is 'Unidades em estoque na Olist na última leitura (nulo = a Olist não informou).';
comment on column public.lotes_cervejas.estoque_lido_em is 'Quando o estoque foi lido na Olist pela última vez.';

-- O mesmo SKU não entra duas vezes (sem diferenciar maiúsculas de minúsculas).
create unique index lotes_cervejas_sku_key on public.lotes_cervejas (lower(sku));

create trigger lotes_cervejas_atualizado_em
  before update on public.lotes_cervejas
  for each row execute function public.definir_atualizado_em();

-- Lotes ----------------------------------------------------------------------------------

create table public.lotes (
  id             uuid primary key default gen_random_uuid(),
  cerveja_id     uuid not null references public.lotes_cervejas (id) on delete cascade,
  lote           text not null,
  validade       date not null,
  criado_por     uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint lotes_lote_check check (length(lote) between 1 and 60 and lote = btrim(lote))
);

comment on table public.lotes is 'Lote e validade de cada cerveja do módulo Lotes e validades.';
comment on column public.lotes.lote is 'Código do lote impresso na lata/garrafa.';

create unique index lotes_cerveja_lote_key on public.lotes (cerveja_id, lower(lote));
create index lotes_validade_idx on public.lotes (validade);

create trigger lotes_atualizado_em
  before update on public.lotes
  for each row execute function public.definir_atualizado_em();

-- Segurança ----------------------------------------------------------------------------------

alter table public.lotes_cervejas enable row level security;
alter table public.lotes enable row level security;

create policy "Equipe gerencia as cervejas dos lotes"
  on public.lotes_cervejas for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe gerencia os lotes"
  on public.lotes for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

revoke all on public.lotes_cervejas, public.lotes from anon, authenticated;
grant select, insert, update, delete on public.lotes_cervejas, public.lotes to authenticated, service_role;
