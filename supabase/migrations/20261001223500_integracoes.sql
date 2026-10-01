-- =============================================================================
-- PROMETHEUS CRM · 06 · INTEGRAÇÕES (n8n, Shopify, App)
--
-- Padrão "outbox": toda mudança relevante gera uma linha em eventos_integracao.
-- O endpoint /api/cron/eventos entrega cada evento aos webhooks cadastrados
-- (ex.: n8n), com assinatura HMAC-SHA256 e novas tentativas automáticas.
-- =============================================================================

create type public.status_evento as enum ('pendente', 'enviado', 'erro', 'ignorado');

-- Destinos de webhook (ex.: um fluxo do n8n) ------------------------------------

create table public.webhooks (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (length(trim(nome)) > 0),
  url            text not null check (url ~ '^https?://'),
  eventos        text[] not null default '{*}',
  segredo        text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

comment on table public.webhooks is 'Destinos que recebem os eventos do CRM (n8n, Zapier, App...). eventos = {*} recebe todos.';
comment on column public.webhooks.segredo is 'Usado para assinar o corpo (header X-Prometheus-Assinatura: sha256=...).';

create trigger webhooks_atualizado_em
  before update on public.webhooks
  for each row execute function public.definir_atualizado_em();

-- Fila de eventos (outbox) -------------------------------------------------------

create table public.eventos_integracao (
  id                    uuid primary key default gen_random_uuid(),
  tipo                  text not null,
  entidade              text,
  entidade_id           uuid,
  payload               jsonb not null default '{}',
  status                public.status_evento not null default 'pendente',
  tentativas            integer not null default 0,
  ultimo_erro           text,
  proxima_tentativa_em  timestamptz not null default now(),
  criado_em             timestamptz not null default now(),
  processado_em         timestamptz
);

comment on table public.eventos_integracao is 'Fila de eventos para integrações. Processada por /api/cron/eventos.';

create index eventos_integracao_fila_idx
  on public.eventos_integracao (proxima_tentativa_em)
  where status = 'pendente';
create index eventos_integracao_criado_idx on public.eventos_integracao (criado_em desc);

create or replace function public.registrar_evento(
  p_tipo         text,
  p_entidade     text,
  p_entidade_id  uuid,
  p_payload      jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.eventos_integracao (tipo, entidade, entidade_id, payload)
  values (p_tipo, p_entidade, p_entidade_id, coalesce(p_payload, '{}'))
  returning id into v_id;
  return v_id;
end;
$$;

-- Pedido completo em JSON (usado nos eventos e na API /api/v1).
create or replace function public.pedido_json(p_pedido_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id',                pe.id,
    'numero',            pe.numero,
    'canal',             pe.canal,
    'origem',            pe.origem,
    'status',            pe.status,
    'status_pagamento',  pe.status_pagamento,
    'subtotal',          pe.subtotal,
    'taxa_entrega',      pe.taxa_entrega,
    'desconto',          pe.desconto,
    'total',             pe.total,
    'endereco_entrega',  pe.endereco_entrega,
    'observacoes',       pe.observacoes,
    'cobrancas_enviadas', pe.cobrancas_enviadas,
    'pago_em',           pe.pago_em,
    'criado_em',         pe.criado_em,
    'shopify_order_id',  pe.shopify_order_id,
    'pre_venda', case when pv.id is null then null else
      jsonb_build_object('id', pv.id, 'titulo', pv.titulo, 'slug', pv.slug) end,
    'cliente', jsonb_build_object(
      'id', c.id, 'nome', c.nome, 'whatsapp', c.whatsapp, 'email', c.email, 'vip', c.vip
    ),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'produto_id', i.produto_id,
        'descricao', i.descricao,
        'quantidade', i.quantidade,
        'preco_unitario', i.preco_unitario,
        'total', i.total
      ) order by i.descricao)
      from public.pedido_itens i
      where i.pedido_id = pe.id
    ), '[]'::jsonb)
  )
  from public.pedidos pe
  join public.clientes c on c.id = pe.cliente_id
  left join public.pre_vendas pv on pv.id = pe.pre_venda_id
  where pe.id = p_pedido_id;
$$;

-- Gatilhos que alimentam a fila --------------------------------------------------

create or replace function public.emitir_evento_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.registrar_evento(
    case tg_op when 'INSERT' then 'cliente.criado' else 'cliente.atualizado' end,
    'cliente', new.id, to_jsonb(new)
  );
  return null;
end;
$$;

create trigger clientes_emitir_evento
  after insert or update on public.clientes
  for each row execute function public.emitir_evento_cliente();

-- Disparado no COMMIT (deferred), quando os itens do pedido já existem.
create or replace function public.emitir_evento_pedido_criado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.registrar_evento('pedido.criado', 'pedido', new.id, public.pedido_json(new.id));
  return null;
end;
$$;

create constraint trigger pedidos_emitir_evento_criado
  after insert on public.pedidos
  deferrable initially deferred
  for each row execute function public.emitir_evento_pedido_criado();

create or replace function public.emitir_evento_pedido_atualizado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := public.pedido_json(new.id) || jsonb_build_object(
    'anterior', jsonb_build_object('status', old.status, 'status_pagamento', old.status_pagamento)
  );
begin
  perform public.registrar_evento('pedido.atualizado', 'pedido', new.id, v_payload);

  if new.status_pagamento = 'pago' and old.status_pagamento <> 'pago' then
    perform public.registrar_evento('pedido.pago', 'pedido', new.id, v_payload);
  end if;

  if new.status = 'cancelado' and old.status <> 'cancelado' then
    perform public.registrar_evento('pedido.cancelado', 'pedido', new.id, v_payload);
  end if;

  return null;
end;
$$;

create trigger pedidos_emitir_evento_atualizado
  after update of status, status_pagamento on public.pedidos
  for each row
  when (old.status is distinct from new.status or old.status_pagamento is distinct from new.status_pagamento)
  execute function public.emitir_evento_pedido_atualizado();

create or replace function public.emitir_evento_pre_venda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.registrar_evento(
    case tg_op when 'INSERT' then 'pre_venda.criada' else 'pre_venda.atualizada' end,
    'pre_venda', new.id,
    to_jsonb(new) || jsonb_build_object('link_path', '/p/' || new.slug)
  );
  return null;
end;
$$;

create trigger pre_vendas_emitir_evento
  after insert or update on public.pre_vendas
  for each row execute function public.emitir_evento_pre_venda();

-- -----------------------------------------------------------------------------
-- Shopify: importação idempotente de pedidos (chamada por /api/webhooks/shopify)
--   p_pedido: {
--     shopify_order_id, status, status_pagamento, taxa_entrega, desconto,
--     observacoes, criado_em, endereco_entrega: {...},
--     cliente: {shopify_customer_id, nome, email, whatsapp, cep, logradouro,
--               numero, complemento, bairro, cidade, uf},
--     itens: [{shopify_variant_id, sku, descricao, quantidade, preco_unitario}]
--   }
-- -----------------------------------------------------------------------------

create or replace function public.importar_pedido_shopify(p_pedido jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_c           jsonb := coalesce(p_pedido -> 'cliente', '{}');
  v_whatsapp    text := public.normalizar_whatsapp(v_c ->> 'whatsapp');
  v_email       text := nullif(lower(trim(v_c ->> 'email')), '');
  v_cliente_id  uuid;
  v_pedido_id   uuid;
  v_numero      bigint;
  v_item        jsonb;
begin
  if coalesce(p_pedido ->> 'shopify_order_id', '') = '' then
    raise exception 'shopify_order_id é obrigatório.' using errcode = 'P0001';
  end if;

  -- Pedido já importado: apenas sincroniza status.
  select id into v_pedido_id from public.pedidos where shopify_order_id = p_pedido ->> 'shopify_order_id';
  if v_pedido_id is not null then
    update public.pedidos
    set status_pagamento = coalesce((p_pedido ->> 'status_pagamento')::public.status_pagamento, status_pagamento),
        status = coalesce((p_pedido ->> 'status')::public.status_pedido, status)
    where id = v_pedido_id;
    return v_pedido_id;
  end if;

  -- Cliente: procura por ID da Shopify, depois WhatsApp, depois e-mail.
  select id into v_cliente_id from public.clientes
  where shopify_customer_id = nullif(v_c ->> 'shopify_customer_id', '');

  if v_cliente_id is null and v_whatsapp is not null then
    select id into v_cliente_id from public.clientes where whatsapp = v_whatsapp;
  end if;

  if v_cliente_id is null and v_email is not null then
    select id into v_cliente_id from public.clientes where email = v_email order by criado_em limit 1;
  end if;

  if v_cliente_id is null then
    insert into public.clientes (
      nome, whatsapp, email, cep, logradouro, numero, complemento, bairro, cidade, uf,
      origem, shopify_customer_id
    )
    values (
      coalesce(nullif(trim(v_c ->> 'nome'), ''), 'Cliente Shopify'), v_whatsapp, v_email,
      v_c ->> 'cep', v_c ->> 'logradouro', v_c ->> 'numero', v_c ->> 'complemento',
      v_c ->> 'bairro', v_c ->> 'cidade', v_c ->> 'uf',
      'shopify', nullif(v_c ->> 'shopify_customer_id', '')
    )
    returning id into v_cliente_id;
  else
    update public.clientes
    set shopify_customer_id = coalesce(shopify_customer_id, nullif(v_c ->> 'shopify_customer_id', ''))
    where id = v_cliente_id;
  end if;

  insert into public.pedidos (
    cliente_id, canal, origem, status, status_pagamento, taxa_entrega, desconto,
    endereco_entrega, observacoes, shopify_order_id, criado_em
  )
  values (
    v_cliente_id, 'shopify', 'shopify',
    coalesce((p_pedido ->> 'status')::public.status_pedido, 'novo'),
    coalesce((p_pedido ->> 'status_pagamento')::public.status_pagamento, 'pendente'),
    coalesce((p_pedido ->> 'taxa_entrega')::numeric, 0),
    coalesce((p_pedido ->> 'desconto')::numeric, 0),
    p_pedido -> 'endereco_entrega',
    nullif(trim(p_pedido ->> 'observacoes'), ''),
    p_pedido ->> 'shopify_order_id',
    coalesce((p_pedido ->> 'criado_em')::timestamptz, now())
  )
  returning id, numero into v_pedido_id, v_numero;

  for v_item in select value from jsonb_array_elements(coalesce(p_pedido -> 'itens', '[]'::jsonb)) loop
    insert into public.pedido_itens (pedido_id, produto_id, descricao, preco_unitario, quantidade)
    values (
      v_pedido_id,
      (
        select p.id from public.produtos p
        where p.shopify_variant_id = v_item ->> 'shopify_variant_id'
           or (p.sku is not null and p.sku = v_item ->> 'sku')
        limit 1
      ),
      coalesce(nullif(v_item ->> 'descricao', ''), 'Item Shopify'),
      coalesce((v_item ->> 'preco_unitario')::numeric, 0),
      greatest(coalesce((v_item ->> 'quantidade')::integer, 1), 1)
    );
  end loop;

  insert into public.atividades (cliente_id, pedido_id, tipo, descricao)
  values (v_cliente_id, v_pedido_id, 'pedido_criado', format('Pedido #%s importado da Shopify', v_numero));

  return v_pedido_id;
end;
$$;

-- Segurança --------------------------------------------------------------------

alter table public.webhooks enable row level security;
alter table public.eventos_integracao enable row level security;

create policy "Equipe gerencia webhooks"
  on public.webhooks for all to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

create policy "Equipe acompanha a fila de eventos"
  on public.eventos_integracao for select to authenticated
  using ((select public.eh_membro_equipe()));

create policy "Equipe reenvia eventos"
  on public.eventos_integracao for update to authenticated
  using ((select public.eh_membro_equipe()))
  with check ((select public.eh_membro_equipe()));

revoke all on function public.importar_pedido_shopify(jsonb) from public, anon, authenticated;
grant execute on function public.importar_pedido_shopify(jsonb) to service_role;
