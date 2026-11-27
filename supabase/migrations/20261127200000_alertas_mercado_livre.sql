-- =============================================================================
-- Mercado Livre: alertas no grupo da equipe (WhatsApp)
--
-- Pedido do dono da loja (2026-11-27): quando alguém mandar mensagem ou abrir reclamação no
-- Mercado Livre, avisar o grupo da equipe no WhatsApp com uma mensagem de alerta.
--
--   • O Mercado Livre avisa o CRM (/api/webhooks/mercado-livre) nos tópicos questions
--     (pergunta em anúncio), messages (mensagem pós-venda) e post_purchase (reclamação,
--     devolução, mediação). O CRM busca o detalhe na API com o token da conta e monta o alerta.
--   • Quem fala com o grupo é o n8n (fluxo "Cerveja Lenta - Aviso de Venda (grupo equipe)",
--     entrada "Evento do CRM (Mercado Livre)"), como nos avisos de validade dos lotes: o CRM manda
--     o evento mercado_livre.alerta pela fila de webhooks com a mensagem pronta.
--   • Cada coisa avisa uma vez só: pergunta (por id), mensagem (por id) e reclamação (por id e
--     etapa — abrir a reclamação avisa; ir para mediação com o Mercado Livre avisa de novo).
--   • Os alertas ficam guardados (ml_alertas) para a tela mostrar os últimos e se chegaram ao n8n.
-- =============================================================================

create table public.ml_alertas (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null,
  -- Evita aviso repetido: "pergunta:<id>", "mensagem:<id>", "reclamacao:<id>:<etapa>", "teste:<uuid>".
  chave       text not null unique,
  -- Recurso do Mercado Livre que gerou o alerta (ex.: /questions/123).
  recurso     text,
  titulo      text not null,
  link        text,
  detalhes    jsonb not null default '{}',
  evento_id   uuid references public.eventos_integracao (id) on delete set null,
  criado_por  uuid references public.perfis (id) on delete set null,
  criado_em   timestamptz not null default now(),
  constraint ml_alertas_tipo_check check (tipo in ('pergunta', 'mensagem', 'reclamacao', 'teste'))
);

comment on table public.ml_alertas is 'Alertas do Mercado Livre (pergunta, mensagem pós-venda, reclamação) mandados ao grupo da equipe pelo n8n.';
comment on column public.ml_alertas.chave is 'Identidade do alerta: o mesmo recurso nunca avisa duas vezes (o Mercado Livre repete notificações).';
comment on column public.ml_alertas.evento_id is 'Evento da fila de webhooks que levou o alerta ao n8n (status da entrega).';

create index ml_alertas_criado_idx on public.ml_alertas (criado_em desc);

-- Grava o alerta (se ainda não existe) e põe o evento na fila. Devolve o id do evento, ou nulo
-- quando o alerta já tinha sido dado (notificação repetida). Só o servidor chama.
create or replace function public.registrar_alerta_ml(
  p_tipo      text,
  p_chave     text,
  p_recurso   text,
  p_titulo    text,
  p_link      text,
  p_payload   jsonb,
  p_criado_por uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alerta uuid;
  v_evento uuid;
begin
  insert into public.ml_alertas (tipo, chave, recurso, titulo, link, detalhes, criado_por)
  values (p_tipo, p_chave, p_recurso, p_titulo, p_link, coalesce(p_payload, '{}'), p_criado_por)
  on conflict (chave) do nothing
  returning id into v_alerta;

  if v_alerta is null then
    return null;
  end if;

  v_evento := public.registrar_evento('mercado_livre.alerta', 'ml_alerta', v_alerta,
                                      coalesce(p_payload, '{}') || jsonb_build_object('alerta_id', v_alerta));
  update public.ml_alertas set evento_id = v_evento where id = v_alerta;
  return v_evento;
end;
$$;

-- Webhook do n8n que recebe os alertas -------------------------------------------------------

insert into public.webhooks (nome, url, eventos)
select 'n8n · alertas do Mercado Livre (grupo da equipe)',
       'https://n8n-4kwf.srv1854385.hstgr.cloud/webhook/crm-mercado-livre-grupo',
       array['mercado_livre.alerta']
where not exists (
  select 1 from public.webhooks where url = 'https://n8n-4kwf.srv1854385.hstgr.cloud/webhook/crm-mercado-livre-grupo'
);

-- Segurança ----------------------------------------------------------------------------------

alter table public.ml_alertas enable row level security;

create policy "Equipe vê os alertas do Mercado Livre"
  on public.ml_alertas for select to authenticated
  using ((select public.eh_membro_equipe()));

revoke all on public.ml_alertas from anon, authenticated;
grant select on public.ml_alertas to authenticated;
grant select, insert, update, delete on public.ml_alertas to service_role;

revoke all on function public.registrar_alerta_ml(text, text, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.registrar_alerta_ml(text, text, text, text, text, jsonb, uuid) to service_role;
