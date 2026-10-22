-- =============================================================================
-- PROMETHEUS CRM · FRASE DO DIA
--   Pop-up motivacional no desktop: aparece uma vez por dia para cada login em
--   cada IP (o mesmo login entrando de outra rede vê de novo). A frase do dia
--   é escolhida no código (src/features/motivacao/frases.ts); aqui fica só o
--   registro de quem já viu, para não repetir o pop-up.
-- =============================================================================

create table public.frase_do_dia_vistas (
  perfil_id  uuid not null references public.perfis (id) on delete cascade,
  dia        date not null,
  ip         text not null,
  visto_em   timestamptz not null default now(),
  primary key (perfil_id, dia, ip),
  constraint frase_do_dia_vistas_ip_check check (char_length(ip) between 1 and 64)
);

comment on table public.frase_do_dia_vistas is 'Quem já viu a frase do dia, por dia (Brasília) e IP. Uma linha = pop-up já exibido.';

alter table public.frase_do_dia_vistas enable row level security;

create policy "Membro vê o que já viu"
  on public.frase_do_dia_vistas for select to authenticated
  using (perfil_id = (select auth.uid()) and (select public.eh_membro_equipe()));

create policy "Membro registra o que viu"
  on public.frase_do_dia_vistas for insert to authenticated
  with check (perfil_id = (select auth.uid()) and (select public.eh_membro_equipe()));

revoke all on public.frase_do_dia_vistas from anon, authenticated;
grant select, insert on public.frase_do_dia_vistas to authenticated;
grant select, insert, update, delete on public.frase_do_dia_vistas to service_role;
