-- =============================================================================
-- PROMETHEUS CRM · PIX PELO MERCADO PAGO (baixa automática do pagamento)
--   • integracao_mercado_pago: linha única com a conta do Mercado Pago conectada.
--     O Access Token de produção e a assinatura secreta do webhook são colados pelo
--     admin em Configurações › Mercado Pago e ficam CRIPTOGRAFADOS no Supabase Vault
--     (mercado_pago_access_token / mercado_pago_webhook_secret).
--   • cobrancas_pix: cada PIX gerado para um pedido (QR Code + copia e cola). O
--     webhook /api/webhooks/mercado-pago e a rotina /api/cron/mercado-pago confirmam o
--     pagamento NA API do Mercado Pago (nunca confiam só no aviso) e chamam
--     registrar_status_pix(), que dá baixa no pedido quando o valor pago cobre o total.
--   • Frete a cotar: o 1º PIX cobre só as cervejas; o pedido fica em aberto até a
--     equipe cotar o frete e o cliente pagar o restante pelo link /pagar/{pedido}.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Conexão com a conta
-- -----------------------------------------------------------------------------

create table public.integracao_mercado_pago (
  id                       smallint primary key default 1 check (id = 1),
  conta_id                 text,
  conta_nome               text,
  conta_email              text,
  conectado_em             timestamptz,
  conectado_por            uuid references public.perfis (id) on delete set null,
  verificado_em            timestamptz,
  notificacao_recebida_em  timestamptz,
  ultimo_erro              text,
  atualizado_em            timestamptz not null default now()
);

comment on table public.integracao_mercado_pago is 'Conta do Mercado Pago que recebe os PIX do link (linha única). Access Token e assinatura do webhook ficam no Vault.';

create trigger integracao_mercado_pago_atualizado_em
  before update on public.integracao_mercado_pago
  for each row execute function public.definir_atualizado_em();

insert into public.integracao_mercado_pago (id) values (1) on conflict (id) do nothing;

alter table public.integracao_mercado_pago enable row level security;
-- Sem políticas: a equipe vê só o status, por status_mercado_pago().

-- Grava (ou troca) um segredo no Vault.
create or replace function public.gravar_segredo_mercado_pago(p_nome text, p_valor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_nome;
  if v_id is null then
    perform vault.create_secret(trim(p_valor), p_nome, 'Mercado Pago (PIX do link de pré-venda)');
  else
    perform vault.update_secret(v_id, trim(p_valor));
  end if;
end;
$$;

-- Salva a conexão (só administradores). O servidor já conferiu o token na API do
-- Mercado Pago (/users/me) e manda a conta junto. Token vazio mantém o atual.
create or replace function public.salvar_conexao_mercado_pago(p_token text, p_conta jsonb, p_segredo_webhook text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores conectam o Mercado Pago.' using errcode = '42501';
  end if;

  if nullif(trim(p_token), '') is not null then
    if nullif(trim(p_conta ->> 'id'), '') is null then
      raise exception 'Conta do Mercado Pago não identificada.';
    end if;
    perform public.gravar_segredo_mercado_pago('mercado_pago_access_token', p_token);
    update public.integracao_mercado_pago
    set conta_id = trim(p_conta ->> 'id'),
        conta_nome = nullif(trim(p_conta ->> 'nome'), ''),
        conta_email = nullif(trim(p_conta ->> 'email'), ''),
        conectado_em = now(),
        conectado_por = auth.uid(),
        verificado_em = now(),
        ultimo_erro = null
    where id = 1;
  elsif not exists (select 1 from public.integracao_mercado_pago where id = 1 and conta_id is not null) then
    raise exception 'Cole o Access Token de produção do Mercado Pago.';
  end if;

  if nullif(trim(p_segredo_webhook), '') is not null then
    perform public.gravar_segredo_mercado_pago('mercado_pago_webhook_secret', p_segredo_webhook);
  end if;
end;
$$;

-- Desconecta: o link volta a mostrar a chave PIX da loja e o envio de comprovante.
create or replace function public.desconectar_mercado_pago()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores desconectam o Mercado Pago.' using errcode = '42501';
  end if;
  update public.integracao_mercado_pago
  set conta_id = null, conta_nome = null, conta_email = null, conectado_em = null, conectado_por = null,
      verificado_em = null, ultimo_erro = null
  where id = 1;
end;
$$;

-- Credenciais abertas. EXCLUSIVA do servidor (service role).
create or replace function public.credenciais_mercado_pago()
returns table (conta_id text, access_token text, segredo_webhook text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.conta_id,
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'mercado_pago_access_token'),
    (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'mercado_pago_webhook_secret')
  from public.integracao_mercado_pago m
  where m.id = 1 and m.conta_id is not null;
$$;

-- -----------------------------------------------------------------------------
-- Cobranças PIX
-- -----------------------------------------------------------------------------

create table public.cobrancas_pix (
  id               uuid primary key default gen_random_uuid(),
  pedido_id        uuid not null references public.pedidos (id) on delete cascade,
  valor            numeric(12, 2) not null check (valor > 0),
  status           text not null default 'criando'
                     check (status in ('criando', 'pendente', 'pago', 'expirado', 'cancelado', 'recusado', 'estornado', 'erro')),
  mp_pagamento_id  text unique,
  copia_e_cola     text,
  qr_code_base64   text,
  link_mp          text,
  expira_em        timestamptz,
  valor_pago       numeric(12, 2),
  pago_em          timestamptz,
  detalhe          text,
  consultado_em    timestamptz,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

comment on table public.cobrancas_pix is 'PIX gerados no Mercado Pago para os pedidos. id = external_reference e chave de idempotência no Mercado Pago.';
comment on column public.cobrancas_pix.status is 'criando → pendente → pago | expirado | cancelado | recusado; pago → estornado. erro = o Mercado Pago recusou a criação.';
comment on column public.cobrancas_pix.consultado_em is 'Última conferência direta na API (o link consulta no máximo a cada poucos segundos).';

create index cobrancas_pix_pedido_idx on public.cobrancas_pix (pedido_id, criado_em desc);
create index cobrancas_pix_pendentes_idx on public.cobrancas_pix (criado_em) where status in ('criando', 'pendente');

create trigger cobrancas_pix_atualizado_em
  before update on public.cobrancas_pix
  for each row execute function public.definir_atualizado_em();

alter table public.cobrancas_pix enable row level security;

create policy "Equipe vê as cobranças PIX"
  on public.cobrancas_pix for select to authenticated
  using ((select public.eh_membro_equipe()));

-- Status para a interface (nunca devolve o token nem a assinatura).
create or replace function public.status_mercado_pago()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.eh_membro_equipe() then (
    select jsonb_build_object(
      'conectado', m.conta_id is not null
                   and exists (select 1 from vault.secrets s where s.name = 'mercado_pago_access_token'),
      'conta_id', m.conta_id,
      'conta_nome', m.conta_nome,
      'conta_email', m.conta_email,
      'conectado_em', m.conectado_em,
      'verificado_em', m.verificado_em,
      'notificacao_recebida_em', m.notificacao_recebida_em,
      'ultimo_erro', m.ultimo_erro,
      'assinatura_webhook', exists (select 1 from vault.secrets s where s.name = 'mercado_pago_webhook_secret'),
      'pix_recebidos', (select count(*) from public.cobrancas_pix c where c.status = 'pago')
    )
    from public.integracao_mercado_pago m
    where m.id = 1
  ) end;
$$;

-- Avisos do sino: "PIX recebido" abre o pedido.
alter table public.notificacoes add column pedido_id uuid references public.pedidos (id) on delete cascade;
comment on column public.notificacoes.pedido_id is 'Pedido do aviso (PIX recebido): abre direto o pedido.';
create index notificacoes_pedido_idx on public.notificacoes (pedido_id) where pedido_id is not null;

alter table public.notificacoes drop constraint notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check (tipo in (
  'tarefa_atribuida', 'tarefa_comentario', 'tarefa_impedida', 'tarefa_desimpedida', 'tarefa_prazo', 'tarefa_concluida',
  'whatsapp_mensagem', 'atendimento_transferido', 'pix_recebido'
));

-- Valor já pago por PIX e valor que falta (frete a cotar: só as cervejas por enquanto).
create or replace function public.saldo_pix_pedido(p_pedido public.pedidos)
returns table (pago numeric, devido numeric)
language sql
stable
set search_path = ''
as $$
  select
    v.pago,
    round(greatest(
      case when p_pedido.frete = 'a_cotar' then greatest(p_pedido.subtotal - p_pedido.desconto, 0) else p_pedido.total end - v.pago,
      0
    ), 2)
  from (
    select coalesce(sum(c.valor_pago), 0)::numeric as pago
    from public.cobrancas_pix c
    where c.pedido_id = p_pedido.id and c.status = 'pago'
  ) v;
$$;

-- Dá baixa no pedido quando os PIX pagos cobrem o total (e o frete já foi definido).
create or replace function public.quitar_pedido_pix(p_pedido_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
  v_pago   numeric;
  v_quando timestamptz;
begin
  select * into v_pedido from public.pedidos where id = p_pedido_id;
  if not found
     or v_pedido.status = 'cancelado'
     or v_pedido.status_pagamento not in ('pendente', 'cobrado')
     or v_pedido.frete is not distinct from 'a_cotar' then
    return false;
  end if;

  select s.pago into v_pago from public.saldo_pix_pedido(v_pedido) s;
  if v_pago <= 0 or v_pago < v_pedido.total then
    return false;
  end if;

  select max(c.pago_em) into v_quando from public.cobrancas_pix c where c.pedido_id = p_pedido_id and c.status = 'pago';

  update public.pedidos
  set status_pagamento = 'pago',
      forma_pagamento = 'PIX · Mercado Pago',
      pago_em = coalesce(v_quando, now())
  where id = p_pedido_id;
  return true;
end;
$$;

-- Valores do pedido mudaram (frete cotado, desconto...) e já há PIX pago: tenta quitar.
create or replace function public.conferir_quitacao_pix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.cobrancas_pix c where c.pedido_id = new.id and c.status = 'pago') then
    perform public.quitar_pedido_pix(new.id);
  end if;
  return null;
end;
$$;

create trigger pedidos_conferir_quitacao_pix
  after update of subtotal, taxa_entrega, desconto, frete on public.pedidos
  for each row
  when (old.subtotal is distinct from new.subtotal or old.taxa_entrega is distinct from new.taxa_entrega
        or old.desconto is distinct from new.desconto or old.frete is distinct from new.frete)
  execute function public.conferir_quitacao_pix();

-- Prepara um PIX para o que falta pagar do pedido (service role).
--   situacao: 'pago' | 'cancelado' | 'aguardando_frete' → nada a cobrar agora;
--             'pendente' → reaproveita o PIX ainda válido (mesmo valor);
--             'criar'    → o servidor cria o pagamento no Mercado Pago com esta cobrança.
create or replace function public.preparar_cobranca_pix(p_pedido_id uuid, p_validade_minutos integer default 1440)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido   public.pedidos;
  v_cliente  public.clientes;
  v_titulo   text;
  v_pago     numeric;
  v_devido   numeric;
  v_cob      public.cobrancas_pix;
  v_resumo   jsonb;
begin
  -- Trava o pedido: duas abas abertas não geram dois PIX.
  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;

  select * into v_cliente from public.clientes where id = v_pedido.cliente_id;
  select pv.titulo into v_titulo from public.pre_vendas pv where pv.id = v_pedido.pre_venda_id;
  select s.pago, s.devido into v_pago, v_devido from public.saldo_pix_pedido(v_pedido) s;

  v_resumo := jsonb_build_object(
    'pedido_id', v_pedido.id,
    'numero', v_pedido.numero,
    'total', v_pedido.total,
    'pago', v_pago,
    'devido', v_devido,
    'frete', v_pedido.frete,
    'cliente_nome', v_cliente.nome,
    'cliente_email', v_cliente.email,
    'pre_venda_titulo', v_titulo
  );

  if v_pedido.status = 'cancelado' then
    return v_resumo || jsonb_build_object('situacao', 'cancelado');
  end if;
  if v_pedido.status_pagamento = 'pago' then
    return v_resumo || jsonb_build_object('situacao', 'pago');
  end if;
  if v_devido <= 0 then
    return v_resumo || jsonb_build_object('situacao', case when v_pedido.frete = 'a_cotar' then 'aguardando_frete' else 'pago' end);
  end if;

  -- PIX do mesmo valor ainda válido por pelo menos 15 min (ou sendo criado agora).
  select * into v_cob
  from public.cobrancas_pix c
  where c.pedido_id = p_pedido_id
    and c.valor = v_devido
    and ((c.status = 'pendente' and c.expira_em > now() + interval '15 minutes')
         or (c.status = 'criando' and c.criado_em > now() - interval '2 minutes'))
  order by c.criado_em desc
  limit 1;

  if not found then
    insert into public.cobrancas_pix (pedido_id, valor, expira_em)
    values (p_pedido_id, v_devido, now() + make_interval(mins => greatest(p_validade_minutos, 30)))
    returning * into v_cob;
  end if;

  return v_resumo || jsonb_build_object(
    'situacao', case when v_cob.status = 'pendente' then 'pendente' else 'criar' end,
    'cobranca', jsonb_build_object(
      'id', v_cob.id,
      'valor', v_cob.valor,
      'status', v_cob.status,
      'expira_em', v_cob.expira_em,
      'copia_e_cola', v_cob.copia_e_cola,
      'qr_code_base64', v_cob.qr_code_base64,
      'link_mp', v_cob.link_mp
    )
  );
end;
$$;

-- Resultado da criação no Mercado Pago (service role).
create or replace function public.concluir_cobranca_pix(p_cobranca_id uuid, p_dados jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(p_dados ->> 'erro', '') is not null then
    update public.cobrancas_pix
    set status = 'erro', detalhe = left(p_dados ->> 'erro', 500)
    where id = p_cobranca_id and status = 'criando';
    return;
  end if;

  update public.cobrancas_pix
  set mp_pagamento_id = coalesce(mp_pagamento_id, p_dados ->> 'mp_pagamento_id'),
      copia_e_cola = p_dados ->> 'copia_e_cola',
      qr_code_base64 = p_dados ->> 'qr_code_base64',
      link_mp = p_dados ->> 'link_mp',
      expira_em = coalesce(nullif(p_dados ->> 'expira_em', '')::timestamptz, expira_em),
      status = case when status = 'criando' then 'pendente' else status end,
      consultado_em = now()
  where id = p_cobranca_id;
end;
$$;

-- Situação de um pagamento conferida na API do Mercado Pago (service role).
-- Localiza pela id do pagamento ou pela external_reference (= id da cobrança).
create or replace function public.registrar_status_pix(
  p_cobranca_id uuid,
  p_mp_pagamento_id text,
  p_status_mp text,
  p_valor_pago numeric default null,
  p_pago_em timestamptz default null,
  p_detalhe text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cob     public.cobrancas_pix;
  v_pedido  public.pedidos;
  v_novo    text;
  v_quitou  boolean := false;
  v_valor   text;
begin
  select * into v_cob from public.cobrancas_pix where mp_pagamento_id = p_mp_pagamento_id for update;
  if not found and p_cobranca_id is not null then
    select * into v_cob from public.cobrancas_pix
    where id = p_cobranca_id and (mp_pagamento_id is null or mp_pagamento_id = p_mp_pagamento_id)
    for update;
  end if;
  if not found then
    return null; -- pagamento de outra origem (maquininha, link avulso...)
  end if;

  v_novo := case p_status_mp
    when 'approved' then 'pago'
    when 'pending' then 'pendente'
    when 'in_process' then 'pendente'
    when 'in_mediation' then 'pendente'
    when 'authorized' then 'pendente'
    when 'rejected' then 'recusado'
    when 'cancelled' then case when v_cob.expira_em <= now() + interval '1 minute' then 'expirado' else 'cancelado' end
    when 'refunded' then 'estornado'
    when 'charged_back' then 'estornado'
    else v_cob.status
  end;

  -- Avisos fora de ordem não desfazem um pagamento: de "pago" só se vai para "estornado".
  if v_cob.status = 'pago' and v_novo <> 'estornado' then
    v_novo := 'pago';
  end if;
  if v_cob.status = 'estornado' then
    v_novo := 'estornado';
  end if;
  if v_novo = 'criando' then
    v_novo := 'pendente';
  end if;

  update public.cobrancas_pix
  set mp_pagamento_id = coalesce(mp_pagamento_id, p_mp_pagamento_id),
      status = v_novo,
      valor_pago = case when v_novo in ('pago', 'estornado') then coalesce(p_valor_pago, valor_pago, valor) else valor_pago end,
      pago_em = case when v_novo = 'pago' then coalesce(pago_em, p_pago_em, now()) else pago_em end,
      detalhe = coalesce(nullif(p_detalhe, ''), detalhe),
      consultado_em = now()
  where id = v_cob.id
  returning * into v_cob;

  select * into v_pedido from public.pedidos where id = v_cob.pedido_id;
  v_valor := replace(to_char(coalesce(v_cob.valor_pago, v_cob.valor), 'FM999999990.00'), '.', ',');

  if v_novo = 'pago' and v_cob.pago_em is not null and v_cob.status = 'pago'
     and not exists (select 1 from public.atividades a where a.tipo = 'pix_recebido' and a.dados ->> 'cobranca_id' = v_cob.id::text) then
    insert into public.atividades (cliente_id, pedido_id, tipo, descricao, dados, autor_id)
    values (
      v_pedido.cliente_id, v_pedido.id, 'pix_recebido',
      format('PIX de R$ %s recebido pelo Mercado Pago (pedido #%s)', v_valor, v_pedido.numero),
      jsonb_build_object('cobranca_id', v_cob.id, 'mp_pagamento_id', v_cob.mp_pagamento_id, 'valor', v_cob.valor_pago),
      null
    );

    insert into public.notificacoes (perfil_id, tipo, pedido_id, titulo, texto)
    select p.id, 'pix_recebido', v_pedido.id,
           format('PIX recebido · #PRM-%s', v_pedido.numero),
           format('R$ %s de %s%s', v_valor,
                  coalesce((select c.nome from public.clientes c where c.id = v_pedido.cliente_id), 'cliente'),
                  case when v_pedido.frete = 'a_cotar' then ' · falta cotar o frete' else '' end)
    from public.perfis p
    where p.ativo and p.papel = 'admin';

    v_quitou := public.quitar_pedido_pix(v_pedido.id);
  end if;

  if v_novo = 'estornado'
     and not exists (select 1 from public.atividades a where a.tipo = 'pix_estornado' and a.dados ->> 'cobranca_id' = v_cob.id::text) then
    insert into public.atividades (cliente_id, pedido_id, tipo, descricao, dados, autor_id)
    values (
      v_pedido.cliente_id, v_pedido.id, 'pix_estornado',
      format('PIX de R$ %s devolvido ao cliente pelo Mercado Pago (pedido #%s)', v_valor, v_pedido.numero),
      jsonb_build_object('cobranca_id', v_cob.id, 'mp_pagamento_id', v_cob.mp_pagamento_id),
      null
    );
    update public.pedidos
    set status_pagamento = 'estornado'
    where id = v_pedido.id and status_pagamento = 'pago' and forma_pagamento = 'PIX · Mercado Pago';
  end if;

  return jsonb_build_object(
    'pedido_id', v_pedido.id,
    'numero', v_pedido.numero,
    'status', v_novo,
    'quitou', v_quitou
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------

revoke all on public.integracao_mercado_pago from anon, authenticated;
grant all on public.integracao_mercado_pago to service_role;

revoke all on public.cobrancas_pix from anon, authenticated;
grant select on public.cobrancas_pix to authenticated;
grant all on public.cobrancas_pix to service_role;

revoke execute on function
  public.gravar_segredo_mercado_pago(text, text),
  public.status_mercado_pago(),
  public.salvar_conexao_mercado_pago(text, jsonb, text),
  public.desconectar_mercado_pago(),
  public.credenciais_mercado_pago(),
  public.saldo_pix_pedido(public.pedidos),
  public.quitar_pedido_pix(uuid),
  public.conferir_quitacao_pix(),
  public.preparar_cobranca_pix(uuid, integer),
  public.concluir_cobranca_pix(uuid, jsonb),
  public.registrar_status_pix(uuid, text, text, numeric, timestamptz, text)
from public, anon, authenticated;

grant execute on function
  public.status_mercado_pago(),
  public.salvar_conexao_mercado_pago(text, jsonb, text),
  public.desconectar_mercado_pago(),
  public.saldo_pix_pedido(public.pedidos)
to authenticated;

grant execute on function
  public.status_mercado_pago(),
  public.credenciais_mercado_pago(),
  public.saldo_pix_pedido(public.pedidos),
  public.quitar_pedido_pix(uuid),
  public.preparar_cobranca_pix(uuid, integer),
  public.concluir_cobranca_pix(uuid, jsonb),
  public.registrar_status_pix(uuid, text, text, numeric, timestamptz, text)
to service_role;
