-- =============================================================================
-- PROMETHEUS CRM · CUSTO DAS CAMPANHAS (WHATSAPP OFICIAL)
--
-- A Meta cobra por mensagem de marketing ENTREGUE, pelo país do contato (Brasil:
-- R$ 0,3217 na tabela em BRL; o mesmo valor cobrado na conta em 13/11/2026).
--
--   • whatsapp_oficial.preco_marketing: preço por mensagem de marketing para o Brasil,
--     medido na própria conta (custo ÷ volume do último dia com marketing, pela
--     pricing_analytics da Meta). Acompanha sozinho as mudanças da tabela da Meta.
--   • campanhas.custo_meta: quanto a Meta informa ter cobrado pelo modelo da campanha
--     (template_analytics, inclui testes e reenvios). Chega com algumas horas de atraso;
--     o custo em tempo real é calculado na tela (entregues × preço).
--   • A rotina das campanhas confere os dois a cada 20 min (custos_conferidos_em).
-- =============================================================================

alter table public.whatsapp_oficial
  add column preco_marketing       numeric(10, 4),
  add column preco_moeda           text,
  add column preco_marketing_dia   date,
  add column custos_conferidos_em  timestamptz;

comment on column public.whatsapp_oficial.preco_marketing is 'Preço por mensagem de marketing entregue no Brasil, medido nas cobranças da conta (custo ÷ volume). Nulo até a primeira medição: a tela usa a tabela da Meta.';
comment on column public.whatsapp_oficial.preco_moeda is 'Moeda da conta do WhatsApp na Meta (ex.: BRL).';
comment on column public.whatsapp_oficial.preco_marketing_dia is 'Dia das cobranças usadas para medir o preço.';
comment on column public.whatsapp_oficial.custos_conferidos_em is 'Última conferência de preço e custos na Meta (a rotina repete a cada 20 min).';

alter table public.campanhas
  add column custo_meta     numeric(12, 2),
  add column custo_meta_em  timestamptz;

comment on column public.campanhas.custo_meta is 'Custo informado pela Meta para o modelo da campanha (inclui testes e reenvios). Nulo quando o modelo é dividido com outra campanha ou a Meta ainda não informou.';
comment on column public.campanhas.custo_meta_em is 'Quando o custo da Meta foi conferido.';

-- Status para a tela: agora com o preço por mensagem (nunca os segredos).
create or replace function public.status_whatsapp_oficial()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.eh_membro_equipe() then (
    select jsonb_build_object(
      'configurado', w.phone_number_id is not null and w.waba_id is not null
                     and exists (select 1 from vault.secrets s where s.name = 'whatsapp_oficial_token'),
      'tem_app_secret', exists (select 1 from vault.secrets s where s.name = 'whatsapp_oficial_app_secret'),
      'app_id', w.app_id,
      'phone_number_id', w.phone_number_id,
      'waba_id', w.waba_id,
      'numero', w.numero,
      'nome_verificado', w.nome_verificado,
      'qualidade', w.qualidade,
      'limite_tier', w.limite_tier,
      'status_nome', w.status_nome,
      'conectado_em', w.conectado_em,
      'verificado_em', w.verificado_em,
      'webhook_recebido_em', w.webhook_recebido_em,
      'ultimo_erro', w.ultimo_erro,
      'preco_marketing', w.preco_marketing,
      'preco_moeda', w.preco_moeda,
      'preco_marketing_dia', w.preco_marketing_dia,
      'token_verificacao', case when public.eh_admin() then w.token_verificacao end
    )
    from (select 1) as sempre
    left join public.whatsapp_oficial w on w.id = 1
  ) end;
$$;

-- vw_campanhas: "c.*" é expandido quando a view é criada — recriada para trazer as colunas novas.
drop view public.vw_campanhas;

create view public.vw_campanhas
with (security_invoker = true)
as
select c.*, n.pendentes, n.enviadas, n.entregues, n.lidas, n.respostas, n.falhas, n.ignoradas, n.sairam
from public.campanhas c
cross join lateral (
  select
    count(*) filter (where e.status in ('pendente', 'enviando'))::integer as pendentes,
    count(*) filter (where e.enviada_em is not null)::integer            as enviadas,
    count(*) filter (where e.entregue_em is not null)::integer           as entregues,
    count(*) filter (where e.lida_em is not null)::integer               as lidas,
    count(*) filter (where e.respondida_em is not null)::integer         as respostas,
    count(*) filter (where e.status = 'falhou')::integer                 as falhas,
    count(*) filter (where e.status = 'ignorada')::integer               as ignoradas,
    count(*) filter (where e.saiu_em is not null)::integer               as sairam
  from public.campanha_envios e
  where e.campanha_id = c.id
) n;

revoke all on public.vw_campanhas from anon;
grant select on public.vw_campanhas to authenticated, service_role;
