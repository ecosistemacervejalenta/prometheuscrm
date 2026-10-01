-- =============================================================================
-- PROMETHEUS CRM · 02 · FORNECEDORES E VENDEDORES
-- Empresas fornecedoras, vendedores (representantes) e o vínculo N:N entre eles:
-- um vendedor pode representar várias empresas e uma empresa pode ter vários
-- vendedores.
-- =============================================================================

create table public.fornecedores (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(trim(nome)) > 0),
  razao_social  text,
  cnpj          text unique,
  telefone      text,
  email         text,
  site          text,
  cidade        text,
  uf            text check (uf is null or uf ~ '^[A-Z]{2}$'),
  observacoes   text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.fornecedores is 'Empresas fornecedoras (cervejarias, distribuidoras, serviços).';
comment on column public.fornecedores.cnpj is 'Somente dígitos.';

create table public.vendedores (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(trim(nome)) > 0),
  whatsapp      text,
  email         text,
  observacoes   text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.vendedores is 'Vendedores/representantes que atendem a loja.';

create table public.fornecedor_vendedores (
  fornecedor_id uuid not null references public.fornecedores (id) on delete cascade,
  vendedor_id   uuid not null references public.vendedores (id) on delete cascade,
  criado_em     timestamptz not null default now(),
  primary key (fornecedor_id, vendedor_id)
);

comment on table public.fornecedor_vendedores is 'Quais empresas cada vendedor representa.';

create index fornecedor_vendedores_vendedor_idx on public.fornecedor_vendedores (vendedor_id);

-- Normalização -----------------------------------------------------------------

create or replace function public.normalizar_fornecedor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome  := trim(new.nome);
  new.cnpj  := public.somente_digitos(new.cnpj);
  new.uf    := nullif(upper(trim(new.uf)), '');
  new.email := nullif(lower(trim(new.email)), '');
  return new;
end;
$$;

create trigger fornecedores_normalizar
  before insert or update on public.fornecedores
  for each row execute function public.normalizar_fornecedor();

create trigger fornecedores_atualizado_em
  before update on public.fornecedores
  for each row execute function public.definir_atualizado_em();

create or replace function public.normalizar_vendedor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome     := trim(new.nome);
  new.whatsapp := public.normalizar_whatsapp(new.whatsapp);
  new.email    := nullif(lower(trim(new.email)), '');
  return new;
end;
$$;

create trigger vendedores_normalizar
  before insert or update on public.vendedores
  for each row execute function public.normalizar_vendedor();

create trigger vendedores_atualizado_em
  before update on public.vendedores
  for each row execute function public.definir_atualizado_em();

-- Define (de forma atômica) as empresas que um vendedor representa.
-- `p_novas_empresas` cria fornecedores na hora, pelo nome, se ainda não existirem.
create or replace function public.definir_empresas_do_vendedor(
  p_vendedor_id    uuid,
  p_fornecedor_ids uuid[] default '{}',
  p_novas_empresas text[] default '{}'
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_nome text;
  v_id   uuid;
  v_ids  uuid[] := coalesce(p_fornecedor_ids, '{}');
begin
  foreach v_nome in array coalesce(p_novas_empresas, '{}') loop
    v_nome := trim(v_nome);
    continue when v_nome = '';

    select id into v_id from public.fornecedores where lower(nome) = lower(v_nome) limit 1;
    if v_id is null then
      insert into public.fornecedores (nome) values (v_nome) returning id into v_id;
    end if;
    v_ids := array_append(v_ids, v_id);
    v_id := null;
  end loop;

  delete from public.fornecedor_vendedores
  where vendedor_id = p_vendedor_id
    and fornecedor_id <> all (v_ids);

  insert into public.fornecedor_vendedores (fornecedor_id, vendedor_id)
  select distinct unnest(v_ids), p_vendedor_id
  on conflict do nothing;
end;
$$;

-- Segurança --------------------------------------------------------------------

alter table public.fornecedores enable row level security;
alter table public.vendedores enable row level security;
alter table public.fornecedor_vendedores enable row level security;

create policy "Equipe gerencia fornecedores"
  on public.fornecedores for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe gerencia vendedores"
  on public.vendedores for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe gerencia vínculos fornecedor × vendedor"
  on public.fornecedor_vendedores for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));
