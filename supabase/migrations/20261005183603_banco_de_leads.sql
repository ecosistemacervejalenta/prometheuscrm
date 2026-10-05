-- =============================================================================
-- PROMETHEUS CRM · 11 · BANCO DE LEADS
--   Pastas → listas → leads. Cada lista vem de um arquivo (CSV, XLS/XLSX, TXT):
--   todas as colunas originais ficam em `dados` (jsonb) e as principais —
--   nome, WhatsApp (normalizado) e e-mail — viram colunas para busca, para
--   evitar números repetidos na lista e para os disparos futuros.
-- =============================================================================

-- Pastas ------------------------------------------------------------------------

create table public.leads_pastas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null check (length(trim(nome)) between 1 and 80),
  descricao     text,
  criado_por    uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.leads_pastas is 'Pastas do Banco de Leads (ex.: "Central da Cerveja"). Cada pasta agrupa várias listas.';

create unique index leads_pastas_nome_key on public.leads_pastas (lower(nome));

-- Listas ------------------------------------------------------------------------

create type public.status_lista_leads as enum ('importando', 'pronta');

create table public.leads_listas (
  id               uuid primary key default gen_random_uuid(),
  -- restrict: uma pasta só pode ser excluída depois de esvaziada (evita apagar leads sem querer).
  pasta_id         uuid not null references public.leads_pastas (id) on delete restrict,
  nome             text not null check (length(trim(nome)) between 1 and 120),
  origem           text,
  arquivo_nome     text,
  -- Colunas do arquivo, na ordem: [{ "chave": "c0", "rotulo": "Nome", "tipo": "nome" }, ...]
  colunas          jsonb not null default '[]' check (jsonb_typeof(colunas) = 'array'),
  coluna_nome      text,
  coluna_whatsapp  text,
  coluna_email     text,
  status           public.status_lista_leads not null default 'importando',
  total            integer not null default 0,
  com_whatsapp     integer not null default 0,
  criado_por       uuid references public.perfis (id) on delete set null default auth.uid(),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

comment on table public.leads_listas is 'Listas importadas de arquivos. `colunas` guarda as colunas originais (ordem, rótulo e tipo detectado).';

create unique index leads_listas_nome_key on public.leads_listas (pasta_id, lower(nome));
create index leads_listas_pasta_idx on public.leads_listas (pasta_id);

-- Leads -------------------------------------------------------------------------

create table public.leads (
  id         uuid primary key default gen_random_uuid(),
  lista_id   uuid not null references public.leads_listas (id) on delete cascade,
  linha      integer not null,
  nome       text,
  whatsapp   text,
  email      text,
  dados      jsonb not null default '{}' check (jsonb_typeof(dados) = 'object'),
  -- Texto de busca (todas as colunas), mantido pelo banco.
  busca      text generated always as (
               lower(coalesce(nome, '') || ' ' || coalesce(whatsapp, '') || ' ' || coalesce(email, '') || ' ' || dados::text)
             ) stored,
  criado_em  timestamptz not null default now()
);

comment on table public.leads is 'Leads de uma lista. `dados` = linha original do arquivo (chaves c0, c1... de leads_listas.colunas).';
comment on column public.leads.whatsapp is 'Somente dígitos com DDI (5511987654321). Nulo se o número for inválido — o valor original continua em `dados`.';

-- A linha do arquivo é única na lista: reenviar um lote não duplica nem as linhas sem WhatsApp.
create unique index leads_lista_linha_key on public.leads (lista_id, linha);
create index leads_whatsapp_idx on public.leads (whatsapp) where whatsapp is not null;
-- O mesmo número não se repete dentro de uma lista.
create unique index leads_lista_whatsapp_key on public.leads (lista_id, whatsapp) where whatsapp is not null;

create or replace function public.normalizar_lead()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_whatsapp text := public.normalizar_whatsapp(new.whatsapp);
begin
  new.nome     := nullif(regexp_replace(trim(coalesce(new.nome, '')), '\s+', ' ', 'g'), '');
  new.email    := nullif(lower(trim(coalesce(new.email, ''))), '');
  new.whatsapp := case when length(v_whatsapp) between 12 and 15 then v_whatsapp end;
  return new;
end;
$$;

create trigger leads_normalizar
  before insert or update on public.leads
  for each row execute function public.normalizar_lead();

create or replace function public.normalizar_nome_leads()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome := regexp_replace(trim(new.nome), '\s+', ' ', 'g');
  return new;
end;
$$;

create trigger leads_pastas_normalizar before insert or update on public.leads_pastas
  for each row execute function public.normalizar_nome_leads();
create trigger leads_listas_normalizar before insert or update on public.leads_listas
  for each row execute function public.normalizar_nome_leads();
create trigger leads_pastas_atualizado_em before update on public.leads_pastas
  for each row execute function public.definir_atualizado_em();
create trigger leads_listas_atualizado_em before update on public.leads_listas
  for each row execute function public.definir_atualizado_em();

-- Importação em lotes -----------------------------------------------------------

-- Insere um lote de leads (até 5.000). Números repetidos na lista e linhas já
-- importadas são ignorados — reenviar um lote (ex.: após falha de rede) não duplica nada.
-- Retorna quantos leads entraram.
create or replace function public.importar_leads(p_lista_id uuid, p_leads jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_inseridos integer;
begin
  if jsonb_typeof(p_leads) <> 'array' then
    raise exception 'Formato inválido: envie uma lista de leads.';
  end if;
  if jsonb_array_length(p_leads) > 5000 then
    raise exception 'Envie no máximo 5.000 leads por vez.';
  end if;

  insert into public.leads (lista_id, linha, nome, whatsapp, email, dados)
  select p_lista_id, l.linha, l.nome, l.whatsapp, l.email, coalesce(l.dados, '{}'::jsonb)
  from jsonb_to_recordset(p_leads) as l(linha integer, nome text, whatsapp text, email text, dados jsonb)
  on conflict do nothing;

  get diagnostics v_inseridos = row_count;
  return v_inseridos;
end;
$$;

-- Recalcula os totais da lista e a marca como pronta.
create or replace function public.concluir_importacao_leads(p_lista_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.leads_listas ll
  set total        = (select count(*) from public.leads l where l.lista_id = ll.id),
      com_whatsapp = (select count(*) from public.leads l where l.lista_id = ll.id and l.whatsapp is not null),
      status       = 'pronta'
  where ll.id = p_lista_id;
$$;

-- Visões ------------------------------------------------------------------------

create view public.vw_leads
with (security_invoker = true)
as
select
  l.*,
  exists (select 1 from public.clientes c where c.whatsapp = l.whatsapp) as ja_cliente
from public.leads l;

create view public.vw_leads_pastas
with (security_invoker = true)
as
select
  p.*,
  count(ll.id)::integer                    as listas,
  coalesce(sum(ll.total), 0)::integer      as leads,
  coalesce(sum(ll.com_whatsapp), 0)::integer as com_whatsapp,
  max(ll.criado_em)                        as ultima_lista_em
from public.leads_pastas p
left join public.leads_listas ll on ll.pasta_id = p.id
group by p.id;

-- Segurança ---------------------------------------------------------------------

alter table public.leads_pastas enable row level security;
alter table public.leads_listas enable row level security;
alter table public.leads enable row level security;

create policy "Equipe gerencia pastas de leads"
  on public.leads_pastas for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe gerencia listas de leads"
  on public.leads_listas for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe gerencia leads"
  on public.leads for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

revoke all on public.leads_pastas, public.leads_listas, public.leads, public.vw_leads, public.vw_leads_pastas from anon;
grant select, insert, update, delete on public.leads_pastas, public.leads_listas, public.leads to authenticated, service_role;
grant select on public.vw_leads, public.vw_leads_pastas to authenticated, service_role;

revoke execute on function
  public.importar_leads(uuid, jsonb),
  public.concluir_importacao_leads(uuid)
from public, anon;

grant execute on function
  public.importar_leads(uuid, jsonb),
  public.concluir_importacao_leads(uuid)
to authenticated, service_role;
