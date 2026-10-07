-- =============================================================================
-- PROMETHEUS CRM · ATENDIMENTO WHATSAPP — "ASSINAR COMO"
--   A assinatura (*Nome:* no início da mensagem) passa a usar o nome completo
--   do responsável pelo atendimento. Na conversa, a equipe pode trocar para
--   outro nome da lista "Assinar como" (Configurações › Integrações) — útil
--   quando várias pessoas usam a mesma conta do CRM.
--   A escolha fica no atendimento e volta para o responsável quando ele é
--   transferido ou devolvido para a fila.
-- =============================================================================

alter table public.configuracoes
  add column whatsapp_nomes_assinatura text[] not null default '{}';

comment on column public.configuracoes.whatsapp_nomes_assinatura is 'Nomes que a equipe pode escolher em "Assinar como" na conversa do WhatsApp.';

update public.configuracoes
set whatsapp_nomes_assinatura = array['Raphael Martins', 'Haroldo Neto', 'Renan Rodrigues', 'Aline Campos', 'Pedro Barros']
where id = 1;

alter table public.atendimentos
  add column assinatura_nome text
    constraint atendimentos_assinatura_nome_check check (assinatura_nome is null or length(trim(assinatura_nome)) between 1 and 60);

comment on column public.atendimentos.assinatura_nome is 'Nome escolhido em "Assinar como". Nulo = assina com o nome do responsável.';

create or replace function public.limpar_assinatura_ao_transferir()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Assumir da fila mantém a escolha; transferir ou devolver para a fila volta para o responsável.
  if old.responsavel_id is not null and new.responsavel_id is distinct from old.responsavel_id then
    new.assinatura_nome := null;
  end if;
  return new;
end;
$$;

create trigger atendimentos_limpar_assinatura
  before update of responsavel_id on public.atendimentos
  for each row execute function public.limpar_assinatura_ao_transferir();
