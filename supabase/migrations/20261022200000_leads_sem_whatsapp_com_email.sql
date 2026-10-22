-- =============================================================================
-- PROMETHEUS CRM · BANCO DE LEADS · SEM WHATSAPP, COM E-MAIL
--   A tela do Banco de Leads mostra como dá para falar com cada lead: quem não
--   tem WhatsApp ainda pode ter e-mail. Cada lista passa a guardar quantos leads
--   estão sem WhatsApp e com e-mail (o resto sai das contagens que já existem).
-- =============================================================================

alter table public.leads_listas
  add column sem_whatsapp_com_email integer not null default 0;

comment on column public.leads_listas.sem_whatsapp_com_email is 'Leads da lista sem WhatsApp e com e-mail; mantido por concluir_importacao_leads.';

-- Contar esses leads sem ler a tabela (são poucos por lista).
create index leads_lista_so_email_idx on public.leads (lista_id) where whatsapp is null and email is not null;

create or replace function public.concluir_importacao_leads(p_lista_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.leads_listas ll
  set total                  = (select count(*) from public.leads l where l.lista_id = ll.id),
      com_whatsapp           = (select count(*) from public.leads l where l.lista_id = ll.id and l.whatsapp is not null),
      com_email              = (select count(*) from public.leads l where l.lista_id = ll.id and l.email is not null),
      sem_whatsapp_com_email = (select count(*) from public.leads l where l.lista_id = ll.id and l.whatsapp is null and l.email is not null),
      ddds                   = (
        select coalesce(jsonb_object_agg(x.ddd, x.numeros), '{}'::jsonb)
        from (
          select l.ddd, count(*) as numeros
          from public.leads l
          where l.lista_id = ll.id and l.whatsapp is not null and l.ddd is not null
          group by l.ddd
        ) x
      ),
      status                 = 'pronta'
  where ll.id = p_lista_id;

  select public.atualizar_resumo_leads(array(select pasta_id from public.leads_listas where id = p_lista_id));
$$;

-- Listas que já existem.
update public.leads_listas ll
set sem_whatsapp_com_email = (select count(*) from public.leads l where l.lista_id = ll.id and l.whatsapp is null and l.email is not null);

-- Soma por pasta (coluna nova no fim; as demais continuam iguais).
create or replace view public.vw_leads_pastas
with (security_invoker = true)
as
select
  p.*,
  count(ll.id)::integer                                as listas,
  coalesce(sum(ll.total), 0)::integer                  as leads,
  coalesce(sum(ll.com_whatsapp), 0)::integer           as com_whatsapp,
  max(ll.criado_em)                                    as ultima_lista_em,
  coalesce(sum(ll.com_email), 0)::integer              as com_email,
  coalesce(sum(ll.sem_whatsapp_com_email), 0)::integer as sem_whatsapp_com_email
from public.leads_pastas p
left join public.leads_listas ll on ll.pasta_id = p.id
group by p.id;
