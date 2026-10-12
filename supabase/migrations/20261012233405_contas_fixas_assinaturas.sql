-- =============================================================================
-- PROMETHEUS CRM · CONTAS FIXAS: ASSINATURAS DE FERRAMENTAS
-- Cadastra as assinaturas da planilha "Controle Financeiro de Assinaturas 2026"
-- como contas fixas, a partir de outubro/2026.
--   • Valores em dólar convertidos pela cotação da planilha (US$ 1 = R$ 5,15);
--     o valor original fica nas observações. Ajuste o valor real ao pagar.
--   • O projeto (Geral, Haroldinho, Lupp) fica nas observações.
--   • Fora: "Servidor Total Host" (cancelado em set/2026) e "Token de API
--     (carga)" (recarga avulsa, sem vencimento fixo — lance como variável).
--   • Idempotente: não duplica uma conta fixa que já exista com o mesmo nome.
-- As contas do mês são geradas por gerar_contas_fixas() ao abrir Contas a pagar.
-- =============================================================================

insert into public.contas_fixas (descricao, categoria, valor, dia_vencimento, inicio_em, observacoes)
select a.descricao, 'Software', a.valor, a.dia_vencimento, date '2026-10-01', a.observacoes
from (
  values
    ('ChatGPT',             103.00, 21, 'Uso geral do ecossistema (IA) · Projeto: Geral · Cobrança em dólar: US$ 20,00 (cotação R$ 5,15)'),
    ('Lovable',             257.50,  5, 'Front da loja e App · Projeto: Geral · Cobrança em dólar: US$ 50,00 (cotação R$ 5,15)'),
    ('Napoleon Host',       127.99,  2, 'Servidor de e-mail e Landing Pages · Projeto: Geral'),
    ('Shopify',             193.59, 26, 'Nossa loja virtual · Projeto: Geral · Cobrança em dólar: US$ 37,59 (cotação R$ 5,15)'),
    ('Hostinger',           108.99, 24, 'Servidor n8n (automações e Neural Haroldinho Sommelier) · Projeto: Geral'),
    ('Converta App',        499.00,  5, 'Plugin conversor de e-commerce para app Android e iOS · Projeto: Geral'),
    ('Claude Code Max',     550.00, 13, 'Time de Dev · Projeto: Geral'),
    ('uazapi',               29.90, 24, 'API de envio de mensagens WhatsApp (número principal) · Projeto: Geral'),
    ('Supabase Haroldinho', 128.75,  5, 'Banco de dados — onde tudo do Haroldinho fica guardado · Projeto: Haroldinho · Cobrança em dólar: US$ 25,00 (cotação R$ 5,15)'),
    ('Supabase Lupp',       128.75,  5, 'Servidor isolado com todos os dados do app Lupp · Projeto: Lupp · Cobrança em dólar: US$ 25,00 (cotação R$ 5,15)'),
    ('Vercel',              103.00,  5, 'Front do app Lupp — mostra ao cliente o que está no banco de dados · Projeto: Lupp · Cobrança em dólar: US$ 20,00 (cotação R$ 5,15)')
) as a (descricao, valor, dia_vencimento, observacoes)
where not exists (
  select 1 from public.contas_fixas cf where lower(trim(cf.descricao)) = lower(a.descricao)
);
