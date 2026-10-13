-- =============================================================================
-- PROMETHEUS CRM · TAREFAS — QUEM PARTICIPA DO QUADRO
--   perfis.participa_tarefas: a pessoa aparece para ser marcada como
--   responsável. Desligado = continua com acesso ao CRM, só não entra na lista
--   (ex.: conta técnica de desenvolvimento). Membros novos já participam.
--   Quem já é responsável por uma tarefa continua nela até ser tirado.
-- =============================================================================

alter table public.perfis
  add column participa_tarefas boolean not null default true;

comment on column public.perfis.participa_tarefas is 'Aparece como opção de responsável no quadro de Tarefas.';

-- A conta técnica (desenvolvimento) não entra no quadro: o Raphael usa a conta "Raphael Martins".
update public.perfis set participa_tarefas = false where lower(email) = 'raphaelhenrique.ti@gmail.com';

-- Só membros ativos que participam do quadro podem ser marcados.
create or replace function public.validar_responsavel_tarefa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfis;
begin
  select * into v_perfil from public.perfis where id = new.perfil_id;
  if not found or not v_perfil.ativo then
    raise exception 'Este membro está sem acesso ao CRM e não pode ser responsável.' using errcode = 'P0001';
  end if;
  if not v_perfil.participa_tarefas then
    raise exception '% não participa do quadro de Tarefas.', coalesce(nullif(v_perfil.nome, ''), 'Este membro') using errcode = 'P0001';
  end if;
  return new;
end;
$$;
