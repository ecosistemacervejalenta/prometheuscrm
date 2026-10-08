-- =============================================================================
-- PROMETHEUS CRM · BANCO DE LEADS · DDDs E E-MAILS DE CADA LISTA
--   A tela do Banco de Leads mostra o mapa e o ranking de DDDs e os e-mails de
--   todo o banco. Contar isso na hora lê a tabela leads inteira (≈ 2 s com 440
--   mil leads, e cresce a cada lista importada); então cada lista guarda as
--   contagens dela, feitas ao concluir a importação, só pelos índices.
-- =============================================================================

alter table public.leads_listas
  add column com_email integer not null default 0,
  add column ddds jsonb not null default '{}' check (jsonb_typeof(ddds) = 'object');

comment on column public.leads_listas.com_email is 'Leads da lista com e-mail; mantido por concluir_importacao_leads.';
comment on column public.leads_listas.ddds is
  'WhatsApp da lista por DDD ({"11": 1234, ...}); mantido por concluir_importacao_leads. Sem DDD do Brasil = com_whatsapp − soma.';

-- Contar os e-mails de uma lista sem ler a tabela.
create index leads_lista_email_idx on public.leads (lista_id) where email is not null;

-- Recalcula os totais da lista e a marca como pronta (agora com e-mails e DDDs).
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
$$;

-- Listas que já existem.
update public.leads_listas ll
set com_email = (select count(*) from public.leads l where l.lista_id = ll.id and l.email is not null),
    ddds      = (
      select coalesce(jsonb_object_agg(x.ddd, x.numeros), '{}'::jsonb)
      from (
        select l.ddd, count(*) as numeros
        from public.leads l
        where l.lista_id = ll.id and l.whatsapp is not null and l.ddd is not null
        group by l.ddd
      ) x
    );

-- E-mails por pasta (coluna nova no fim; as demais continuam iguais).
create or replace view public.vw_leads_pastas
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
