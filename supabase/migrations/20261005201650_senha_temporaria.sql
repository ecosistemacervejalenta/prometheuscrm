-- =============================================================================
-- PROMETHEUS CRM · 14 · EQUIPE — SENHA TEMPORÁRIA
--   O administrador cadastra a pessoa em Configurações › Equipe e o CRM gera
--   uma senha temporária (sem e-mail). Enquanto trocar_senha = true, o CRM só
--   abre a tela de criar senha; ao salvar a própria senha, volta a false.
--   "Nova senha" na lista de membros gera outra senha temporária.
-- =============================================================================

alter table public.perfis
  add column trocar_senha boolean not null default false;

comment on column public.perfis.trocar_senha is
  'Entrou com senha temporária: precisa criar a própria senha antes de usar o CRM.';
