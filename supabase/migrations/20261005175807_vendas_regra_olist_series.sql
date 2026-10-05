-- =============================================================================
-- PROMETHEUS CRM · 10 · VENDAS: REGRA DO OLIST E SÉRIES DIÁRIAS
--   • situacao_erp_conta_venda(): regra ÚNICA de quais situações do Olist contam
--     como venda — a mesma do "Dashboard de vendas" do Olist (exclui Aberta,
--     Cancelada e Dados incompletos). Todas as consultas usam esta função.
--   • vendas_erp_por_dia() e vendas_crm_por_dia(): vendas por dia para os
--     gráficos de evolução do painel "Vendas por canal".
-- =============================================================================

-- 0 Aberta · 2 Cancelada · 8 Dados incompletos não contam como venda.
-- Para mudar o critério, altere só esta função (nova migration).
create or replace function public.situacao_erp_conta_venda(p_situacao smallint)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_situacao not in (0, 2, 8);
$$;

comment on function public.situacao_erp_conta_venda(smallint) is
  'Situações do Olist que contam como venda (igual ao Dashboard de vendas do Olist): todas exceto 0 Aberta, 2 Cancelada e 8 Dados incompletos.';

-- Vendas por canal num intervalo de datas (inclusivo), pela regra do Olist.
create or replace function public.vendas_erp_por_canal(p_inicio date, p_fim date)
returns table (canal text, valor numeric, pedidos integer)
language sql
stable
set search_path = ''
as $$
  select pe.canal, coalesce(sum(pe.valor), 0), count(*)::integer
  from public.pedidos_erp pe
  where pe.data_pedido between p_inicio and p_fim
    and public.situacao_erp_conta_venda(pe.situacao)
  group by pe.canal;
$$;

-- Vendas por dia e canal (gráfico de evolução), pela regra do Olist.
create or replace function public.vendas_erp_por_dia(p_inicio date, p_fim date)
returns table (dia date, canal text, valor numeric, pedidos integer)
language sql
stable
set search_path = ''
as $$
  select pe.data_pedido, pe.canal, coalesce(sum(pe.valor), 0), count(*)::integer
  from public.pedidos_erp pe
  where pe.data_pedido between p_inicio and p_fim
    and public.situacao_erp_conta_venda(pe.situacao)
  group by pe.data_pedido, pe.canal;
$$;

-- Vendas por dia de um canal do CRM (ex.: Grupo VIP), sem os pedidos cancelados.
-- O dia é o do horário de Brasília (um pedido às 23h30 conta naquele dia).
create or replace function public.vendas_crm_por_dia(p_canal public.canal_venda, p_inicio date, p_fim date)
returns table (dia date, valor numeric, pedidos integer)
language sql
stable
set search_path = ''
as $$
  select (pe.criado_em at time zone 'America/Sao_Paulo')::date, coalesce(sum(pe.total), 0), count(*)::integer
  from public.pedidos pe
  where pe.canal = p_canal
    and pe.status <> 'cancelado'
    and pe.criado_em >= (p_inicio::timestamp at time zone 'America/Sao_Paulo')
    and pe.criado_em < ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo')
  group by 1;
$$;

create index if not exists pedidos_canal_criado_em_idx on public.pedidos (canal, criado_em);

revoke execute on function
  public.situacao_erp_conta_venda(smallint),
  public.vendas_erp_por_dia(date, date),
  public.vendas_crm_por_dia(public.canal_venda, date, date)
from public, anon;

grant execute on function
  public.situacao_erp_conta_venda(smallint),
  public.vendas_erp_por_dia(date, date),
  public.vendas_crm_por_dia(public.canal_venda, date, date)
to authenticated, service_role;
