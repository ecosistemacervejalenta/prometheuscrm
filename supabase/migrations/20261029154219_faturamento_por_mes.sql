-- =============================================================================
-- PROMETHEUS CRM · FATURAMENTO POR MÊS (META E RECORDE DA VISÃO GERAL)
--   • faturamento_por_mes(): total vendido em cada mês, com a mesma regra do
--     painel "Vendas por canal" — Mercado Livre, Shopee e Loja Virtual pelo
--     Olist (situacao_erp_conta_venda) + Grupo VIP pelos pedidos do CRM não
--     cancelados (dia de Brasília).
--   • A meta de cada mês é o faturamento do mês anterior; o recorde é o maior
--     mês da história. As duas contas são feitas na tela a partir desta função.
-- =============================================================================

create or replace function public.faturamento_por_mes(p_inicio date, p_fim date)
returns table (mes date, valor numeric, pedidos integer)
language sql
stable
set search_path = ''
as $$
  with vendas as (
    select date_trunc('month', pe.data_pedido)::date as mes, pe.valor
    from public.pedidos_erp pe
    where pe.data_pedido between p_inicio and p_fim
      and pe.canal in ('mercado_livre', 'shopee', 'shopify')
      and public.situacao_erp_conta_venda(pe.situacao)
    union all
    select date_trunc('month', pe.criado_em at time zone 'America/Sao_Paulo')::date, pe.total
    from public.pedidos pe
    where pe.canal = 'grupo_vip'
      and pe.status <> 'cancelado'
      and pe.criado_em >= (p_inicio::timestamp at time zone 'America/Sao_Paulo')
      and pe.criado_em < ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo')
  )
  select v.mes, coalesce(sum(v.valor), 0), count(*)::integer
  from vendas v
  group by v.mes
  order by v.mes;
$$;

comment on function public.faturamento_por_mes(date, date) is
  'Faturamento mensal (Olist: Mercado Livre, Shopee e Loja Virtual + Grupo VIP do CRM), pela mesma regra do painel Vendas por canal.';

revoke execute on function public.faturamento_por_mes(date, date) from public, anon;
grant execute on function public.faturamento_por_mes(date, date) to authenticated, service_role;
