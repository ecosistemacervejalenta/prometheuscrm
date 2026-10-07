-- =============================================================================
-- PROMETHEUS CRM · BANCO DE LEADS · CONTAGEM POR DDD PELO ÍNDICE
--   ddds_dos_leads lia a tabela leads (cada lead guarda a linha inteira da
--   planilha) para contar os números da pasta: com 180 mil leads passava dos
--   8 s do statement_timeout e a tela da pasta/lista caía.
--   O índice de DDD passa a cobrir também os números sem DDD do Brasil, então a
--   contagem sai só do índice (index-only scan), sem tocar na tabela.
-- =============================================================================

create index leads_lista_ddd_whatsapp_idx on public.leads (lista_id, ddd, whatsapp) where whatsapp is not null;

-- Substituído pelo de cima (que tem as mesmas linhas e mais as sem DDD).
drop index public.leads_lista_ddd_idx;
