-- =============================================================================
-- PROMETHEUS CRM · MARKETPLACES (MERCADO LIVRE E SHOPEE)
--   • integracao_marketplace: uma linha por canal com a conexão OAuth (tokens,
--     conta autorizada, validade). Só o servidor lê e grava os tokens — a equipe
--     vê apenas o status, pela função status_marketplaces().
--   • A chave secreta de cada app (Client Secret do Mercado Livre / Partner Key
--     da Shopee) é colada pelo admin em Configurações › Marketplaces e fica
--     CRIPTOGRAFADA no Supabase Vault (mercado_livre_client_secret /
--     shopee_partner_key), como no WhatsApp oficial.
--   • A troca do código por tokens, a renovação diária e a conferência da conta
--     ficam na rotina /api/cron/marketplaces (service role).
-- =============================================================================

create table public.integracao_marketplace (
  canal                    text primary key check (canal in ('mercado_livre', 'shopee')),
  -- Mercado Livre: Client ID (ID do app) · Shopee: Live Partner ID.
  client_id                text,
  -- Conta autorizada: Mercado Livre user_id · Shopee shop_id.
  conta_id                 text,
  conta_nome               text,
  access_token             text,
  refresh_token            text,
  access_expira_em         timestamptz,
  refresh_expira_em        timestamptz,
  -- Shopee: a loja autoriza por no máximo 365 dias; depois é preciso autorizar de novo.
  autorizacao_expira_em    timestamptz,
  conectado_em             timestamptz,
  conectado_por            uuid references public.perfis (id) on delete set null,
  verificado_em            timestamptz,
  notificacao_recebida_em  timestamptz,
  ultimo_erro              text,
  atualizado_em            timestamptz not null default now()
);

comment on table public.integracao_marketplace is 'Conexão OAuth com Mercado Livre e Shopee (uma linha por canal). Tokens acessíveis só pelo servidor; chaves secretas no Vault.';

create trigger integracao_marketplace_atualizado_em
  before update on public.integracao_marketplace
  for each row execute function public.definir_atualizado_em();

insert into public.integracao_marketplace (canal) values ('mercado_livre'), ('shopee') on conflict (canal) do nothing;

alter table public.integracao_marketplace enable row level security;
-- Sem políticas: nenhum usuário lê os tokens, nem pela API do Supabase.

create or replace function public.nome_segredo_marketplace(p_canal text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_canal when 'mercado_livre' then 'mercado_livre_client_secret' when 'shopee' then 'shopee_partner_key' end;
$$;

-- Status para a interface (nunca devolve tokens nem chaves secretas).
create or replace function public.status_marketplaces()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.eh_membro_equipe() then (
    select coalesce(jsonb_object_agg(m.canal, jsonb_build_object(
      'configurado', m.client_id is not null
                     and exists (select 1 from vault.secrets s where s.name = public.nome_segredo_marketplace(m.canal)),
      'client_id', m.client_id,
      'conectado', m.refresh_token is not null,
      'conta_id', m.conta_id,
      'conta_nome', m.conta_nome,
      'conectado_em', m.conectado_em,
      'autorizacao_expira_em', m.autorizacao_expira_em,
      'verificado_em', m.verificado_em,
      'notificacao_recebida_em', m.notificacao_recebida_em,
      'ultimo_erro', m.ultimo_erro
    )), '{}'::jsonb)
    from public.integracao_marketplace m
  ) end;
$$;

-- Salva o ID do app e a chave secreta (só administradores). Chave vazia mantém a já salva.
-- Trocar o ID do app apaga a autorização anterior (ela pertence ao app antigo).
create or replace function public.salvar_credenciais_marketplace(p_canal text, p_client_id text, p_segredo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text := public.nome_segredo_marketplace(p_canal);
  v_id   uuid;
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores conectam os marketplaces.' using errcode = '42501';
  end if;
  if v_nome is null then
    raise exception 'Canal desconhecido.';
  end if;

  if nullif(trim(p_segredo), '') is not null then
    select id into v_id from vault.secrets where name = v_nome;
    if v_id is null then
      perform vault.create_secret(trim(p_segredo), v_nome, 'Chave secreta do app (' || p_canal || ')');
    else
      perform vault.update_secret(v_id, trim(p_segredo));
    end if;
  elsif not exists (select 1 from vault.secrets where name = v_nome) then
    raise exception 'Cole a chave secreta do app.';
  end if;

  update public.integracao_marketplace m
  set client_id = trim(p_client_id),
      ultimo_erro = null,
      conta_id = case when m.client_id is distinct from trim(p_client_id) then null else m.conta_id end,
      conta_nome = case when m.client_id is distinct from trim(p_client_id) then null else m.conta_nome end,
      access_token = case when m.client_id is distinct from trim(p_client_id) then null else m.access_token end,
      refresh_token = case when m.client_id is distinct from trim(p_client_id) then null else m.refresh_token end
  where m.canal = p_canal;
end;
$$;

-- Desconecta (apaga os tokens). O ID do app e a chave continuam salvos para reconectar com um clique.
create or replace function public.desconectar_marketplace(p_canal text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores desconectam os marketplaces.' using errcode = '42501';
  end if;
  update public.integracao_marketplace
  set access_token = null, refresh_token = null, access_expira_em = null, refresh_expira_em = null,
      autorizacao_expira_em = null, conta_id = null, conta_nome = null, conectado_em = null,
      conectado_por = null, verificado_em = null, ultimo_erro = null
  where canal = p_canal;
end;
$$;

-- Credenciais completas (chave secreta aberta e tokens). EXCLUSIVA do servidor (service role).
create or replace function public.credenciais_marketplace(p_canal text)
returns table (
  client_id text, segredo text, conta_id text, access_token text, refresh_token text,
  access_expira_em timestamptz, refresh_expira_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.client_id,
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = public.nome_segredo_marketplace(m.canal)),
    m.conta_id,
    m.access_token,
    m.refresh_token,
    m.access_expira_em,
    m.refresh_expira_em
  from public.integracao_marketplace m
  where m.canal = p_canal;
$$;

revoke all on public.integracao_marketplace from anon, authenticated;
grant all on public.integracao_marketplace to service_role;

revoke execute on function
  public.nome_segredo_marketplace(text),
  public.status_marketplaces(),
  public.salvar_credenciais_marketplace(text, text, text),
  public.desconectar_marketplace(text),
  public.credenciais_marketplace(text)
from public, anon, authenticated;

grant execute on function
  public.status_marketplaces(),
  public.salvar_credenciais_marketplace(text, text, text),
  public.desconectar_marketplace(text)
to authenticated;

grant execute on function
  public.nome_segredo_marketplace(text),
  public.status_marketplaces(),
  public.credenciais_marketplace(text)
to service_role;
