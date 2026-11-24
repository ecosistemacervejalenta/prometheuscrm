-- =============================================================================
-- Lotes e validades: quantidade de cada lote
--
-- Pedido do dono da loja (2026-11-24): ao cadastrar o lote, informar quantas unidades
-- daquele lote existem. O painel do módulo soma as unidades por situação da validade
-- (vencidos, crítico, atenção, alerta, OK).
--   • Continua tudo só no CRM: a quantidade do lote não vai para a Olist.
--   • Lotes cadastrados antes desta mudança ficam sem quantidade (nulo) até serem editados.
-- =============================================================================

alter table public.lotes
  add column quantidade integer,
  add constraint lotes_quantidade_check check (quantidade is null or quantidade between 0 and 1000000);

comment on column public.lotes.quantidade is 'Unidades deste lote (nulo = lote antigo, ainda sem quantidade informada).';
