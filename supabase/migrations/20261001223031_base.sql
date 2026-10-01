-- =============================================================================
-- PROMETHEUS CRM · 01 · BASE
-- Funções utilitárias, perfis da equipe e configurações da loja.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Funções utilitárias
-- -----------------------------------------------------------------------------

-- Atualiza a coluna `atualizado_em` em qualquer tabela que a possua.
create or replace function public.definir_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- Mantém apenas os dígitos de um texto (CPF, CNPJ, CEP, telefone...).
create or replace function public.somente_digitos(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(coalesce(p_texto, ''), '\D', '', 'g'), '');
$$;

-- Normaliza um número de WhatsApp para o formato internacional só com dígitos.
-- Ex.: "(11) 98765-4321" → "5511987654321". Números com DDI são mantidos.
create or replace function public.normalizar_whatsapp(p_numero text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d is null or d = '' then null
    when length(d) in (10, 11) then '55' || d
    else d
  end
  from (select ltrim(public.somente_digitos(p_numero), '0') as d) as numero;
$$;

-- -----------------------------------------------------------------------------
-- Perfis da equipe (1:1 com auth.users)
-- -----------------------------------------------------------------------------

create type public.papel_usuario as enum ('admin', 'equipe');

create table public.perfis (
  id            uuid primary key references auth.users (id) on delete cascade,
  nome          text not null default '',
  email         text,
  cargo         text,
  papel         public.papel_usuario not null default 'equipe',
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.perfis is 'Membros da equipe com acesso ao CRM. Criado automaticamente a cada novo usuário do Supabase Auth.';

create trigger perfis_atualizado_em
  before update on public.perfis
  for each row execute function public.definir_atualizado_em();

-- Cria o perfil quando um usuário é criado no Supabase Auth.
-- • O primeiro usuário do sistema vira administrador ativo.
-- • Os demais nascem INATIVOS: o convite feito pela tela Configurações › Equipe
--   ativa o perfil na hora; contas criadas por outros meios aguardam um admin.
create or replace function public.criar_perfil_para_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primeiro boolean := not exists (select 1 from public.perfis);
begin
  insert into public.perfis (id, nome, email, papel, ativo)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'nome', ''), split_part(new.email, '@', 1)),
    new.email,
    case when v_primeiro then 'admin'::public.papel_usuario else 'equipe'::public.papel_usuario end,
    v_primeiro
  );
  return new;
end;
$$;

create trigger ao_criar_usuario_criar_perfil
  after insert on auth.users
  for each row execute function public.criar_perfil_para_novo_usuario();

-- Somente administradores (ou o servidor) alteram papel e status de acesso.
create or replace function public.proteger_campos_do_perfil()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
     and (new.papel is distinct from old.papel or new.ativo is distinct from old.ativo)
     and not public.eh_admin() then
    raise exception 'Apenas administradores alteram papel ou acesso.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- O usuário logado é um membro ativo da equipe?
create or replace function public.eh_membro_equipe()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis
    where id = (select auth.uid()) and ativo
  );
$$;

-- O usuário logado é administrador?
create or replace function public.eh_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfis
    where id = (select auth.uid()) and ativo and papel = 'admin'
  );
$$;

create trigger perfis_proteger_campos
  before update on public.perfis
  for each row execute function public.proteger_campos_do_perfil();

alter table public.perfis enable row level security;

create policy "Equipe vê os perfis"
  on public.perfis for select to authenticated
  using ((select public.eh_membro_equipe()));

create policy "Usuário edita o próprio perfil; admin edita todos"
  on public.perfis for update to authenticated
  using (id = (select auth.uid()) or (select public.eh_admin()))
  with check (id = (select auth.uid()) or (select public.eh_admin()));

-- -----------------------------------------------------------------------------
-- Configurações da loja (linha única, id = 1)
-- Placeholders aceitos nas mensagens: veja README › "Mensagens de WhatsApp".
-- -----------------------------------------------------------------------------

create table public.configuracoes (
  id                  smallint primary key default 1 check (id = 1),
  nome_loja           text not null default 'Prometheus',
  whatsapp_loja       text,
  chave_pix           text,
  nome_recebedor_pix  text,
  mensagem_pre_venda  text not null default E'🍺 *{titulo}*\n\n{descricao}\n\nGaranta a sua pelo link 👇\n{link}',
  mensagem_cobranca   text not null default E'Olá, {nome}! Tudo bem? 🍺\n\nSegue o resumo do seu pedido *#{pedido}*{pre_venda}:\n{itens}\n\n*Total: {total}*\n\n{pagamento}\n\nAssim que pagar, é só mandar o comprovante por aqui. Obrigado! 🙌',
  atualizado_em       timestamptz not null default now()
);

comment on table public.configuracoes is 'Configurações gerais da loja (linha única). Mensagens usam placeholders entre chaves.';

create trigger configuracoes_atualizado_em
  before update on public.configuracoes
  for each row execute function public.definir_atualizado_em();

insert into public.configuracoes (id) values (1) on conflict (id) do nothing;

alter table public.configuracoes enable row level security;

create policy "Equipe lê as configurações"
  on public.configuracoes for select to authenticated
  using ((select public.eh_membro_equipe()));

create policy "Equipe atualiza as configurações"
  on public.configuracoes for update to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));
