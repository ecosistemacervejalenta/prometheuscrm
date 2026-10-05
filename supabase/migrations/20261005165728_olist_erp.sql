-- =============================================================================
-- PROMETHEUS CRM · 09 · OLIST ERP (API v3)
--   • integracao_olist: conexão OAuth2 com o Olist (tokens). Só o servidor lê e
--     grava — a equipe vê apenas o status, pela função status_integracao_olist().
--   • pedidos_erp: cópia enxuta dos pedidos do Olist (canal, situação, data e
--     valor), sincronizada pelo servidor. Alimenta o painel "Vendas por canal".
-- =============================================================================

create table public.integracao_olist (
  id                    smallint primary key default 1 check (id = 1),
  access_token          text,
  refresh_token         text,
  access_expira_em      timestamptz,
  refresh_expira_em     timestamptz,
  conectado_em          timestamptz,
  conectado_por         uuid references public.perfis (id) on delete set null,
  ultima_sincronizacao  timestamptz,
  -- Início da última sincronização bem-sucedida (cursor da busca por data de atualização).
  sincronizado_ate      timestamptz,
  -- Trava contra duas sincronizações ao mesmo tempo (cron + botão).
  sincronizando_desde   timestamptz,
  ultimo_erro           text,
  atualizado_em         timestamptz not null default now()
);

comment on table public.integracao_olist is 'Conexão OAuth2 com o Olist ERP (linha única). Tokens acessíveis só pelo servidor (service role).';

create trigger integracao_olist_atualizado_em
  before update on public.integracao_olist
  for each row execute function public.definir_atualizado_em();

alter table public.integracao_olist enable row level security;
-- Sem políticas para authenticated: nenhum usuário lê os tokens, nem pela API do Supabase.

create table public.pedidos_erp (
  id               bigint primary key,
  numero           integer,
  canal            text not null,
  ecommerce        text,
  situacao         smallint not null default 0,
  data_pedido      date not null,
  valor            numeric(12, 2) not null default 0,
  sincronizado_em  timestamptz not null default now()
);

comment on table public.pedidos_erp is 'Pedidos de venda do Olist ERP (id = id do pedido no Olist). Somente leitura para a equipe.';
comment on column public.pedidos_erp.canal is 'mercado_livre | shopee | shopify | outro (ex.: API Tiny) | sem_ecommerce';
comment on column public.pedidos_erp.situacao is 'Situação no Olist: 0 aberta, 1 faturada, 2 cancelada, 3 aprovada, 4 preparando envio, 5 enviada, 6 entregue, 7 pronto envio, 8 dados incompletos, 9 não entregue.';

create index pedidos_erp_data_idx on public.pedidos_erp (data_pedido, canal);

alter table public.pedidos_erp enable row level security;

create policy "Equipe lê pedidos do ERP"
  on public.pedidos_erp for select to authenticated
  using ((select public.eh_membro_equipe()));

-- Vendas por canal num intervalo de datas (inclusivo), sem os pedidos cancelados.
create or replace function public.vendas_erp_por_canal(p_inicio date, p_fim date)
returns table (canal text, valor numeric, pedidos integer)
language sql
stable
set search_path = ''
as $$
  select pe.canal, coalesce(sum(pe.valor), 0), count(*)::integer
  from public.pedidos_erp pe
  where pe.data_pedido between p_inicio and p_fim
    and pe.situacao <> 2
  group by pe.canal;
$$;

-- Status da conexão para a interface (nunca devolve os tokens).
create or replace function public.status_integracao_olist()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.eh_membro_equipe() then (
    select jsonb_build_object(
      'conectado', io.refresh_token is not null and io.refresh_expira_em > now(),
      'expirada', io.refresh_token is not null and io.refresh_expira_em <= now(),
      'conectado_em', io.conectado_em,
      'ultima_sincronizacao', io.ultima_sincronizacao,
      'ultimo_erro', io.ultimo_erro
    )
    from public.integracao_olist io
    where io.id = 1
  ) end;
$$;

-- Grava a conexão após o OAuth (callback). Só administradores conectam o Olist.
create or replace function public.salvar_conexao_olist(
  p_access_token      text,
  p_refresh_token     text,
  p_access_expira_em  timestamptz,
  p_refresh_expira_em timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores conectam o Olist.' using errcode = '42501';
  end if;
  insert into public.integracao_olist (
    id, access_token, refresh_token, access_expira_em, refresh_expira_em,
    conectado_em, conectado_por, ultimo_erro, sincronizando_desde
  )
  values (1, p_access_token, p_refresh_token, p_access_expira_em, p_refresh_expira_em, now(), auth.uid(), null, null)
  on conflict (id) do update set
    access_token        = excluded.access_token,
    refresh_token       = excluded.refresh_token,
    access_expira_em    = excluded.access_expira_em,
    refresh_expira_em   = excluded.refresh_expira_em,
    conectado_em        = excluded.conectado_em,
    conectado_por       = excluded.conectado_por,
    ultimo_erro         = null,
    sincronizando_desde = null;
end;
$$;

-- Desconecta (apaga os tokens). Os pedidos já sincronizados continuam no histórico.
create or replace function public.desconectar_olist()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores desconectam o Olist.' using errcode = '42501';
  end if;
  update public.integracao_olist
  set access_token = null, refresh_token = null, access_expira_em = null, refresh_expira_em = null,
      sincronizando_desde = null, ultimo_erro = null
  where id = 1;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões (anon sem acesso; equipe só lê pedidos_erp; tokens só service_role)
-- -----------------------------------------------------------------------------

revoke all on public.integracao_olist, public.pedidos_erp from anon, authenticated;
grant select on public.pedidos_erp to authenticated;
grant all on public.integracao_olist, public.pedidos_erp to service_role;

revoke execute on function
  public.vendas_erp_por_canal(date, date),
  public.status_integracao_olist(),
  public.salvar_conexao_olist(text, text, timestamptz, timestamptz),
  public.desconectar_olist()
from public, anon;

grant execute on function
  public.vendas_erp_por_canal(date, date),
  public.status_integracao_olist(),
  public.salvar_conexao_olist(text, text, timestamptz, timestamptz),
  public.desconectar_olist()
to authenticated, service_role;
