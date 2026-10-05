-- =============================================================================
-- PROMETHEUS CRM · 15 · ATENDIMENTO WHATSAPP — FOTO DO CONTATO
--   URL da foto de perfil (CDN do WhatsApp, temporária: vale ~10 dias).
--   O CRM busca ao chegar um contato novo, ao abrir a conversa com o link
--   vencendo e na rotina /api/cron/whatsapp. Sem foto (ou escondida pela
--   privacidade do contato) = iniciais.
-- =============================================================================

alter table public.whatsapp_contatos
  add column foto_url          text,
  add column foto_expira_em    timestamptz,
  add column foto_conferida_em timestamptz;

comment on column public.whatsapp_contatos.foto_url is 'Foto de perfil (URL temporária do WhatsApp). Nula = sem foto ou privada.';
comment on column public.whatsapp_contatos.foto_expira_em is 'Validade do link (parâmetro "oe" da URL). Renovar antes de vencer.';
comment on column public.whatsapp_contatos.foto_conferida_em is 'Última consulta à uazapi (evita consultar de novo a cada abertura).';

-- A foto entra na visão da caixa de entrada (coluna nova no fim, como exige o replace).
create or replace view public.vw_atendimentos
with (security_invoker = true)
as
select
  a.*,
  c.chatid,
  c.whatsapp,
  c.lead_id,
  coalesce(c.nome, cl.nome, c.nome_whatsapp) as contato_nome,
  c.nome_whatsapp,
  r.nome   as responsavel_nome,
  cl.id    as cliente_id,
  cl.nome  as cliente_nome,
  lower(concat_ws(' ', c.nome, c.nome_whatsapp, cl.nome, c.whatsapp)) as busca,
  case when c.foto_expira_em is null or c.foto_expira_em > now() then c.foto_url end as contato_foto
from public.atendimentos a
join public.whatsapp_contatos c on c.id = a.contato_id
left join public.perfis r on r.id = a.responsavel_id
left join public.clientes cl on cl.whatsapp = c.whatsapp;
