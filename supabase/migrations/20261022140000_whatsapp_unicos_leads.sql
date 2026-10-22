-- =============================================================================
-- PROMETHEUS CRM · BANCO DE LEADS · WHATSAPP SEM REPETIR
--   `com_whatsapp` de cada lista conta o número uma vez por lista; somando as
--   listas, o mesmo número entra várias vezes (o banco tinha 606 mil "com
--   WhatsApp" para 476 mil números diferentes). Contar sem repetir na hora leva
--   ~2 s no banco todo e cresce a cada lista, então a contagem fica guardada:
--     · por pasta, em leads_pastas (whatsapp_unicos / whatsapp_validos);
--     · do banco todo, em leads_resumo (uma linha, com os números por DDD).
--   Recalculada ao concluir uma importação e ao excluir ou mover uma lista.
-- =============================================================================

alter table public.leads_pastas
  add column whatsapp_unicos  integer not null default 0,
  add column whatsapp_validos integer not null default 0;

comment on column public.leads_pastas.whatsapp_unicos is 'Números de WhatsApp diferentes na pasta (o mesmo número em várias listas conta uma vez).';
comment on column public.leads_pastas.whatsapp_validos is 'Dos números diferentes, os com DDD do Brasil em formato válido (ddd_do_whatsapp).';

create table public.leads_resumo (
  id               boolean primary key default true check (id),
  whatsapp_unicos  integer not null default 0,
  -- Números diferentes por DDD ({"11": 1234, ...}); sem DDD do Brasil = whatsapp_unicos − soma.
  ddds             jsonb not null default '{}' check (jsonb_typeof(ddds) = 'object'),
  atualizado_em    timestamptz not null default now()
);

comment on table public.leads_resumo is 'Uma linha: WhatsApp diferentes de todo o Banco de Leads e por DDD. Mantida por atualizar_resumo_leads.';

insert into public.leads_resumo default values;

-- Recalcula as pastas indicadas e o resumo do banco (pelos índices, sem ler a tabela leads).
create or replace function public.atualizar_resumo_leads(p_pastas uuid[] default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.leads_pastas p
  set whatsapp_unicos  = x.unicos,
      whatsapp_validos = x.validos
  from public.leads_pastas alvo
  cross join lateral (
    select coalesce(sum(d.numeros), 0)::integer                               as unicos,
           coalesce(sum(d.numeros) filter (where d.ddd is not null), 0)::integer as validos
    from public.ddds_dos_leads(p_pasta_id => alvo.id) d
  ) x
  where p.id = alvo.id
    and (p_pastas is null or alvo.id = any (p_pastas));

  update public.leads_resumo r
  set whatsapp_unicos = coalesce(x.unicos, 0),
      ddds            = coalesce(x.ddds, '{}'::jsonb),
      atualizado_em   = now()
  from (
    select sum(d.numeros)::integer as unicos,
           jsonb_object_agg(d.ddd, d.numeros) filter (where d.ddd is not null) as ddds
    from public.ddds_dos_leads() d
  ) x
  where r.id;
end;
$$;

-- Concluir a importação também atualiza a pasta da lista e o banco.
create or replace function public.concluir_importacao_leads(p_lista_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.leads_listas ll
  set total        = (select count(*) from public.leads l where l.lista_id = ll.id),
      com_whatsapp = (select count(*) from public.leads l where l.lista_id = ll.id and l.whatsapp is not null),
      com_email    = (select count(*) from public.leads l where l.lista_id = ll.id and l.email is not null),
      ddds         = (
        select coalesce(jsonb_object_agg(x.ddd, x.numeros), '{}'::jsonb)
        from (
          select l.ddd, count(*) as numeros
          from public.leads l
          where l.lista_id = ll.id and l.whatsapp is not null and l.ddd is not null
          group by l.ddd
        ) x
      ),
      status       = 'pronta'
  where ll.id = p_lista_id;

  select public.atualizar_resumo_leads(array(select pasta_id from public.leads_listas where id = p_lista_id));
$$;

-- Excluir uma lista (os leads vão junto, em cascata) ou movê-la de pasta muda as contagens.
create or replace function public.leads_listas_atualizar_resumo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.atualizar_resumo_leads(array[old.pasta_id]);
  elsif new.pasta_id is distinct from old.pasta_id then
    perform public.atualizar_resumo_leads(array[old.pasta_id, new.pasta_id]);
  end if;
  return null;
end;
$$;

-- AFTER: roda depois da exclusão em cascata dos leads.
create trigger leads_listas_resumo
  after delete or update of pasta_id on public.leads_listas
  for each row execute function public.leads_listas_atualizar_resumo();

-- A visão fixou as colunas de leads_pastas (p.*) na criação: recriada para incluir as novas.
drop view public.vw_leads_pastas;

create view public.vw_leads_pastas
with (security_invoker = true)
as
select
  p.*,
  count(ll.id)::integer                      as listas,
  coalesce(sum(ll.total), 0)::integer        as leads,
  coalesce(sum(ll.com_whatsapp), 0)::integer as com_whatsapp,
  max(ll.criado_em)                          as ultima_lista_em,
  coalesce(sum(ll.com_email), 0)::integer    as com_email
from public.leads_pastas p
left join public.leads_listas ll on ll.pasta_id = p.id
group by p.id;

-- Segurança ---------------------------------------------------------------------

alter table public.leads_resumo enable row level security;

create policy "Equipe vê e atualiza o resumo dos leads"
  on public.leads_resumo for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

revoke all on public.leads_resumo, public.vw_leads_pastas from anon;
grant select, update on public.leads_resumo to authenticated, service_role;
grant select on public.vw_leads_pastas to authenticated, service_role;

revoke execute on function
  public.atualizar_resumo_leads(uuid[]),
  public.leads_listas_atualizar_resumo()
from public, anon;

grant execute on function public.atualizar_resumo_leads(uuid[]) to authenticated, service_role;

-- Contagens das pastas e do banco que já existem.
select public.atualizar_resumo_leads();
