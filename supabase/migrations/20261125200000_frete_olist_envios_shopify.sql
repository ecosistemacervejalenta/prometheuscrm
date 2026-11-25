-- =============================================================================
-- PROMETHEUS CRM · FRETE CALCULADO PELO OLIST ENVIOS (VIA SHOPIFY)
--
-- CEP fora da lista de CEPs VIP: em vez de a equipe cotar na mão, o CRM pergunta à
-- loja da Shopify quanto custa o envio (o app Olist Envios responde lá dentro) e cobra
-- a opção mais barata. Nada é criado na Shopify: é só um cálculo (draftOrderCalculate).
--
--   • integracao_shopify: linha única com o app da loja (Dev Dashboard). O Client secret
--     e o token de acesso (vale 24 h, renovado sozinho) ficam CRIPTOGRAFADOS no Vault
--     (shopify_client_secret / shopify_access_token).
--   • Peso: 500 g por cerveja (kit conta cada cerveja de dentro). O servidor manda o
--     peso; aqui fica só a contagem de unidades (unidades_para_frete).
--   • pedidos.frete_cotacao: o último cálculo automático (serviço, valor, unidades, CEP).
--     Nulo = frete fixo (VIP) ou cotado à mão pela equipe.
--   • O cálculo vale para as unidades e o CEP da hora: cerveja nova na caixa ou CEP novo
--     → o frete volta para "a cotar" e é calculado de novo quando o cliente vê ou fecha a
--     caixa. Se a Shopify não responder, fica "a cotar" e a equipe cota como sempre.
--   • Frete cotado à mão (cotar_frete_pedido) nunca é trocado pelo cálculo automático.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cálculo guardado no pedido
-- -----------------------------------------------------------------------------

alter table public.pedidos add column frete_cotacao jsonb;

comment on column public.pedidos.frete_cotacao is
  'Último cálculo automático do frete (Olist Envios via Shopify): {origem, situacao: ok|falhou|desatualizada, servico, valor, unidades, peso_kg, cep, cotado_em, opcoes | motivo, detalhe, tentado_em}. Nulo = frete fixo ou cotado à mão.';

create index pedidos_frete_calculado_idx on public.pedidos (criado_em)
  where frete = 'cotado' and frete_cotacao ->> 'origem' = 'shopify';

-- -----------------------------------------------------------------------------
-- Conexão com a loja (Admin API)
-- -----------------------------------------------------------------------------

create table public.integracao_shopify (
  id               smallint primary key default 1 check (id = 1),
  loja             text check (loja is null or loja ~ '^[a-z0-9][a-z0-9-]{0,60}$'),
  loja_nome        text,
  client_id        text,
  escopos          text,
  token_expira_em  timestamptz,
  conectado_em     timestamptz,
  conectado_por    uuid references public.perfis (id) on delete set null,
  verificado_em    timestamptz,
  cotacao_em       timestamptz,
  ultimo_erro      text,
  atualizado_em    timestamptz not null default now()
);

comment on table public.integracao_shopify is 'App da loja na Shopify usado para calcular o frete (linha única). Client secret e token ficam no Vault.';
comment on column public.integracao_shopify.loja is 'Subdomínio da loja: "minhaloja" de minhaloja.myshopify.com.';
comment on column public.integracao_shopify.cotacao_em is 'Último frete calculado com sucesso.';

create trigger integracao_shopify_atualizado_em
  before update on public.integracao_shopify
  for each row execute function public.definir_atualizado_em();

insert into public.integracao_shopify (id) values (1) on conflict (id) do nothing;

alter table public.integracao_shopify enable row level security;
-- Sem políticas: a equipe vê só o status, por status_shopify().

-- Grava (ou troca) um segredo da Shopify no Vault.
create or replace function public.gravar_segredo_shopify(p_nome text, p_valor text)
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
    perform vault.create_secret(trim(p_valor), p_nome, 'Shopify (cálculo de frete do link de pré-venda)');
  else
    perform vault.update_secret(v_id, trim(p_valor));
  end if;
end;
$$;

-- Salva a conexão (só administradores). O servidor já trocou o Client ID + secret por um
-- token na Shopify e conferiu a permissão de rascunhos de pedido; aqui só guarda.
create or replace function public.salvar_conexao_shopify(
  p_loja             text,
  p_loja_nome        text,
  p_client_id        text,
  p_client_secret    text,
  p_escopos          text,
  p_token            text,
  p_token_expira_em  timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores conectam a Shopify.' using errcode = '42501';
  end if;
  if nullif(trim(p_loja), '') is null or nullif(trim(p_client_id), '') is null
     or nullif(trim(p_client_secret), '') is null or nullif(trim(p_token), '') is null then
    raise exception 'Informe a loja, o Client ID e o Client secret.' using errcode = 'P0001';
  end if;

  perform public.gravar_segredo_shopify('shopify_client_secret', p_client_secret);
  perform public.gravar_segredo_shopify('shopify_access_token', p_token);

  update public.integracao_shopify
  set loja = lower(trim(p_loja)),
      loja_nome = nullif(trim(p_loja_nome), ''),
      client_id = trim(p_client_id),
      escopos = nullif(trim(p_escopos), ''),
      token_expira_em = p_token_expira_em,
      conectado_em = now(),
      conectado_por = auth.uid(),
      verificado_em = now(),
      ultimo_erro = null
  where id = 1;
end;
$$;

-- Desconecta: CEP fora da lista VIP volta a ser "frete a cotar" pela equipe.
create or replace function public.desconectar_shopify()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin() then
    raise exception 'Apenas administradores desconectam a Shopify.' using errcode = '42501';
  end if;
  update public.integracao_shopify
  set loja = null, loja_nome = null, client_id = null, escopos = null, token_expira_em = null,
      conectado_em = null, conectado_por = null, verificado_em = null, ultimo_erro = null
  where id = 1;
  delete from vault.secrets where name in ('shopify_client_secret', 'shopify_access_token');
end;
$$;

-- Credenciais abertas. EXCLUSIVA do servidor (service role).
create or replace function public.credenciais_shopify()
returns table (loja text, client_id text, client_secret text, access_token text, token_expira_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.loja,
    s.client_id,
    (select v.decrypted_secret from vault.decrypted_secrets v where v.name = 'shopify_client_secret'),
    (select v.decrypted_secret from vault.decrypted_secrets v where v.name = 'shopify_access_token'),
    s.token_expira_em
  from public.integracao_shopify s
  where s.id = 1 and s.conectado_em is not null and s.loja is not null and s.client_id is not null;
$$;

-- Token novo (a Shopify dá um por 24 h). EXCLUSIVA do servidor (service role).
create or replace function public.gravar_token_shopify(p_token text, p_expira_em timestamptz, p_escopos text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(trim(p_token), '') is null then
    raise exception 'Token vazio.' using errcode = 'P0001';
  end if;
  -- Primeiro a linha (trava contra o "Desconectar" simultâneo); desconectada, não guarda nada.
  update public.integracao_shopify
  set token_expira_em = p_expira_em,
      escopos = coalesce(nullif(trim(p_escopos), ''), escopos),
      verificado_em = now()
  where id = 1 and conectado_em is not null;
  if not found then
    return;
  end if;
  perform public.gravar_segredo_shopify('shopify_access_token', p_token);
end;
$$;

-- Status para a interface (nunca devolve o secret nem o token).
create or replace function public.status_shopify()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.eh_membro_equipe() then (
    select jsonb_build_object(
      'conectado', s.conectado_em is not null
                   and exists (select 1 from vault.secrets v where v.name = 'shopify_client_secret'),
      'loja', s.loja,
      'loja_nome', s.loja_nome,
      'client_id', s.client_id,
      'escopos', s.escopos,
      'conectado_em', s.conectado_em,
      'verificado_em', s.verificado_em,
      'cotacao_em', s.cotacao_em,
      'ultimo_erro', s.ultimo_erro,
      'fretes_calculados', (
        select count(*) from public.pedidos pe
        where pe.frete = 'cotado' and pe.frete_cotacao ->> 'origem' = 'shopify'
      )
    )
    from public.integracao_shopify s
    where s.id = 1
  ) end;
$$;

-- -----------------------------------------------------------------------------
-- Frete calculado no pedido
-- -----------------------------------------------------------------------------

-- Cervejas (latas/garrafas) do pedido para o peso do frete: o kit conta cada cerveja de dentro.
create or replace function public.unidades_para_frete(p_pedido_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(i.quantidade * greatest(coalesce(k.cervejas, 1), 1)), 0)::integer
  from public.pedido_itens i
  left join public.produtos p on p.id = i.produto_id
  left join lateral (
    select sum(
      case when c ->> 'quantidade' ~ '^[0-9]{1,4}(\.[0-9]+)?$' then greatest(ceil((c ->> 'quantidade')::numeric), 1) else 1 end
    )::integer as cervejas
    from jsonb_array_elements(
      case
        when jsonb_array_length(coalesce(p.cervejas_do_kit, '[]'::jsonb)) > 0 then p.cervejas_do_kit
        else coalesce(p.olist_kit, '[]'::jsonb)
      end
    ) c
  ) k on true
  where i.pedido_id = p_pedido_id;
$$;

-- O frete deste pedido precisa ser calculado agora? (service role)
--   calcular = true  → devolve o que o servidor manda para a Shopify (unidades, CEP, endereço, valor);
--   calcular = false → motivo: pedido_nao_encontrado | pedido_fechado | frete_fixo | frete_manual |
--                      em_dia | sem_itens | sem_cep | tentativa_recente.
--   p_forcar: a equipe clicou em "Calcular" (ignora a espera depois de uma tentativa que falhou).
create or replace function public.frete_a_calcular(p_pedido_id uuid, p_forcar boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pedido    public.pedidos;
  v_cot       jsonb;
  v_unidades  integer;
  v_cep       text;
  v_mesma     boolean;
begin
  select * into v_pedido from public.pedidos where id = p_pedido_id;
  if not found then
    return jsonb_build_object('calcular', false, 'motivo', 'pedido_nao_encontrado');
  end if;

  if v_pedido.status not in ('novo', 'confirmado') or v_pedido.status_pagamento not in ('pendente', 'cobrado') then
    return jsonb_build_object('calcular', false, 'motivo', 'pedido_fechado');
  end if;
  if v_pedido.frete is null or v_pedido.frete = 'vip' then
    return jsonb_build_object('calcular', false, 'motivo', 'frete_fixo');
  end if;

  v_cot := coalesce(v_pedido.frete_cotacao, '{}'::jsonb);
  v_unidades := public.unidades_para_frete(v_pedido.id);
  v_cep := regexp_replace(coalesce(v_pedido.endereco_entrega ->> 'cep', ''), '[^0-9]', '', 'g');
  v_mesma := v_cot ->> 'unidades' = v_unidades::text and v_cot ->> 'cep' = v_cep;

  if v_pedido.frete = 'cotado' then
    if v_cot ->> 'origem' is distinct from 'shopify' then
      return jsonb_build_object('calcular', false, 'motivo', 'frete_manual');
    end if;
    if v_mesma then
      return jsonb_build_object('calcular', false, 'motivo', 'em_dia');
    end if;
  end if;

  if v_unidades <= 0 then
    return jsonb_build_object('calcular', false, 'motivo', 'sem_itens');
  end if;
  if length(v_cep) <> 8 then
    return jsonb_build_object('calcular', false, 'motivo', 'sem_cep');
  end if;

  if not coalesce(p_forcar, false)
     and v_cot ->> 'situacao' = 'falhou' and v_mesma
     and (v_cot ->> 'tentado_em')::timestamptz > now() - interval '45 seconds' then
    return jsonb_build_object('calcular', false, 'motivo', 'tentativa_recente');
  end if;

  return jsonb_build_object(
    'calcular', true,
    'pedido_id', v_pedido.id,
    'numero', v_pedido.numero,
    'unidades', v_unidades,
    'cep', v_cep,
    'valor', greatest(v_pedido.subtotal - v_pedido.desconto, 0),
    'endereco', jsonb_build_object(
      'logradouro', v_pedido.endereco_entrega ->> 'logradouro',
      'numero', v_pedido.endereco_entrega ->> 'numero',
      'complemento', v_pedido.endereco_entrega ->> 'complemento',
      'bairro', v_pedido.endereco_entrega ->> 'bairro',
      'cidade', v_pedido.endereco_entrega ->> 'cidade',
      'uf', v_pedido.endereco_entrega ->> 'uf'
    )
  );
end;
$$;

-- Grava o resultado do cálculo (service role). Só vale se a caixa ainda tem as mesmas
-- unidades e o mesmo CEP usados na conta — senão devolve aplicado = false, motivo caixa_mudou.
--   p_resultado: {ok: true, valor, servico, peso_kg, opcoes: [{servico, valor}]}
--              | {ok: false, motivo, detalhe}
create or replace function public.aplicar_frete_calculado(
  p_pedido_id  uuid,
  p_unidades   integer,
  p_cep        text,
  p_resultado  jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido    public.pedidos;
  v_cot       jsonb;
  v_unidades  integer;
  v_cep       text;
  v_valor     numeric;
  v_servico   text;
  v_peso      numeric;
  v_motivo    text;
begin
  -- Trava o pedido: uma compra entrando agora ou outro cálculo esperam a vez.
  select * into v_pedido from public.pedidos where id = p_pedido_id for update;
  if not found then
    return jsonb_build_object('aplicado', false, 'motivo', 'pedido_nao_encontrado');
  end if;
  if v_pedido.status not in ('novo', 'confirmado') or v_pedido.status_pagamento not in ('pendente', 'cobrado') then
    return jsonb_build_object('aplicado', false, 'motivo', 'pedido_fechado');
  end if;
  if v_pedido.frete is null or v_pedido.frete = 'vip' then
    return jsonb_build_object('aplicado', false, 'motivo', 'frete_fixo');
  end if;

  v_cot := coalesce(v_pedido.frete_cotacao, '{}'::jsonb);
  if v_pedido.frete = 'cotado' and v_cot ->> 'origem' is distinct from 'shopify' then
    return jsonb_build_object('aplicado', false, 'motivo', 'frete_manual');
  end if;

  v_unidades := public.unidades_para_frete(v_pedido.id);
  v_cep := regexp_replace(coalesce(v_pedido.endereco_entrega ->> 'cep', ''), '[^0-9]', '', 'g');
  if v_unidades is distinct from p_unidades
     or v_cep is distinct from regexp_replace(coalesce(p_cep, ''), '[^0-9]', '', 'g') then
    return jsonb_build_object('aplicado', false, 'motivo', 'caixa_mudou');
  end if;

  -- Outro cálculo acabou de gravar o frete desta mesma caixa: nada a fazer.
  if v_pedido.frete = 'cotado' and v_cot ->> 'unidades' = v_unidades::text and v_cot ->> 'cep' = v_cep then
    return jsonb_build_object('aplicado', true, 'valor', v_pedido.taxa_entrega, 'servico', v_cot ->> 'servico', 'repetido', true);
  end if;

  if coalesce(p_resultado ->> 'ok', '') = 'true' then
    v_valor := round((p_resultado ->> 'valor')::numeric, 2);
    v_servico := left(coalesce(nullif(trim(p_resultado ->> 'servico'), ''), 'Olist Envios'), 120);
    v_peso := (p_resultado ->> 'peso_kg')::numeric;
    if v_valor is null or v_valor < 0 or v_valor > 5000 then
      raise exception 'Valor de frete inválido.' using errcode = 'P0001';
    end if;

    update public.pedidos
    set taxa_entrega = v_valor,
        frete = 'cotado',
        frete_cotacao = jsonb_build_object(
          'origem', 'shopify',
          'situacao', 'ok',
          'servico', v_servico,
          'valor', v_valor,
          'unidades', v_unidades,
          'peso_kg', v_peso,
          'cep', v_cep,
          'cotado_em', now(),
          'opcoes', coalesce(p_resultado -> 'opcoes', '[]'::jsonb)
        )
    where id = v_pedido.id;

    insert into public.atividades (cliente_id, pedido_id, tipo, descricao, dados, autor_id)
    values (
      v_pedido.cliente_id, v_pedido.id, 'frete_cotado',
      format('Frete do pedido #%s calculado sozinho: R$ %s · %s (%s un%s)', v_pedido.numero,
             replace(to_char(v_valor, 'FM999999990.00'), '.', ','), v_servico, v_unidades,
             coalesce(' · ' || replace(to_char(v_peso, 'FM999990.0'), '.', ',') || ' kg', '')),
      jsonb_build_object('valor', v_valor, 'servico', v_servico, 'unidades', v_unidades, 'peso_kg', v_peso, 'automatico', true),
      null
    );

    update public.integracao_shopify set cotacao_em = now(), ultimo_erro = null where id = 1;
    return jsonb_build_object('aplicado', true, 'valor', v_valor, 'servico', v_servico);
  end if;

  -- Não deu para calcular: o pedido fica "a cotar" (a equipe cota e avisa o cliente, como antes).
  v_motivo := left(coalesce(nullif(trim(p_resultado ->> 'motivo'), ''), 'falha'), 60);

  if not (v_cot ->> 'situacao' = 'falhou' and v_cot ->> 'motivo' = v_motivo
          and v_cot ->> 'unidades' = v_unidades::text and v_cot ->> 'cep' = v_cep) then
    insert into public.atividades (cliente_id, pedido_id, tipo, descricao, dados, autor_id)
    values (
      v_pedido.cliente_id, v_pedido.id, 'frete_a_cotar',
      format('Pedido #%s: o frete não pôde ser calculado sozinho (%s). Cote e avise o cliente.', v_pedido.numero,
             coalesce(nullif(trim(p_resultado ->> 'detalhe'), ''), v_motivo)),
      jsonb_build_object('motivo', v_motivo, 'unidades', v_unidades, 'cep', v_cep, 'automatico', true),
      null
    );
  end if;

  update public.pedidos
  set frete = 'a_cotar',
      taxa_entrega = 0,
      frete_cotacao = jsonb_build_object(
        'origem', 'shopify',
        'situacao', 'falhou',
        'motivo', v_motivo,
        'detalhe', left(coalesce(p_resultado ->> 'detalhe', ''), 300),
        'unidades', v_unidades,
        'cep', v_cep,
        'tentado_em', now()
      )
  where id = v_pedido.id;

  return jsonb_build_object('aplicado', false, 'motivo', 'cotacao_falhou');
end;
$$;

-- -----------------------------------------------------------------------------
-- Frete cotado à mão: deixa de ser automático (e o cálculo não mexe mais nele)
-- -----------------------------------------------------------------------------

create or replace function public.cotar_frete_pedido(p_pedido_id uuid, p_valor numeric)
returns public.pedidos
language plpgsql
set search_path = ''
as $$
declare
  v_pedido public.pedidos;
begin
  if p_valor is null or p_valor < 0 then
    raise exception 'Informe o valor do frete.' using errcode = 'P0001';
  end if;

  update public.pedidos
  set taxa_entrega = round(p_valor, 2),
      frete = 'cotado',
      frete_cotacao = null
  where id = p_pedido_id
  returning * into v_pedido;

  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;

  insert into public.atividades (cliente_id, pedido_id, tipo, descricao, dados)
  values (
    v_pedido.cliente_id, v_pedido.id, 'frete_cotado',
    format('Frete do pedido #%s: R$ %s', v_pedido.numero, replace(to_char(v_pedido.taxa_entrega, 'FM999999990.00'), '.', ',')),
    jsonb_build_object('valor', v_pedido.taxa_entrega)
  );

  return v_pedido;
end;
$$;

-- -----------------------------------------------------------------------------
-- Link público: cerveja nova na caixa → o frete calculado é refeito
-- (mesma função de 20261113004608_caixa_vip; mudou só o trecho do frete calculado)
-- -----------------------------------------------------------------------------

create or replace function public.registrar_pedido_pre_venda(
  p_slug                text,
  p_cliente             jsonb,
  p_itens               jsonb,
  p_atualizar_endereco  boolean default false,
  p_observacoes         text default null
)
returns public.pedidos
language plpgsql
set search_path = ''
as $$
declare
  v_pre_venda          public.pre_vendas;
  v_cliente            public.clientes;
  v_pedido             public.pedidos;
  v_caixa              public.pedidos;
  v_whatsapp           text := public.normalizar_whatsapp(p_cliente ->> 'whatsapp');
  v_gravar_endereco    boolean;
  v_cep                text;
  v_cep_caixa          text;
  v_frete_vip          boolean;
  v_valor_frete_vip    numeric;
  v_pago_pix           numeric;
  v_acrescimo          jsonb;
begin
  select * into v_pre_venda from public.pre_vendas where slug = p_slug;
  if not found
     or v_pre_venda.status <> 'ativa'
     or (v_pre_venda.encerra_em is not null and v_pre_venda.encerra_em <= now()) then
    raise exception 'Esta pré-venda não está mais disponível.' using errcode = 'P0001';
  end if;

  if v_whatsapp is null or length(v_whatsapp) < 12 or length(v_whatsapp) > 15 then
    raise exception 'Informe um número de WhatsApp válido, com DDD.' using errcode = 'P0001';
  end if;

  -- Trava o cliente: duas compras simultâneas do mesmo WhatsApp entram em ordem na mesma caixa.
  select * into v_cliente from public.clientes where whatsapp = v_whatsapp for update;
  v_gravar_endereco := not found or p_atualizar_endereco or v_cliente.logradouro is null;

  if v_gravar_endereco and (
       coalesce(trim(p_cliente ->> 'logradouro'), '') = ''
    or coalesce(trim(p_cliente ->> 'numero'), '') = ''
    or coalesce(trim(p_cliente ->> 'bairro'), '') = ''
    or coalesce(trim(p_cliente ->> 'cidade'), '') = ''
    or coalesce(trim(p_cliente ->> 'uf'), '') = ''
  ) then
    raise exception 'Informe o endereço de entrega completo.' using errcode = 'P0001';
  end if;

  if v_cliente.id is null then
    if coalesce(trim(p_cliente ->> 'nome'), '') = '' then
      raise exception 'Informe seu nome.' using errcode = 'P0001';
    end if;

    insert into public.clientes (
      nome, whatsapp, email, cep, logradouro, numero, complemento,
      bairro, cidade, uf, referencia, origem, vip
    )
    values (
      trim(p_cliente ->> 'nome'), v_whatsapp, nullif(trim(p_cliente ->> 'email'), ''),
      p_cliente ->> 'cep', p_cliente ->> 'logradouro', p_cliente ->> 'numero',
      nullif(trim(p_cliente ->> 'complemento'), ''), p_cliente ->> 'bairro',
      p_cliente ->> 'cidade', p_cliente ->> 'uf', nullif(trim(p_cliente ->> 'referencia'), ''),
      'pre_venda', v_pre_venda.canal = 'grupo_vip'
    )
    returning * into v_cliente;

    insert into public.atividades (cliente_id, tipo, descricao)
    values (v_cliente.id, 'cliente_criado',
            format('Cadastro feito pelo link da pré-venda "%s"', v_pre_venda.titulo));
  else
    if v_gravar_endereco then
      update public.clientes
      set cep = p_cliente ->> 'cep',
          logradouro = p_cliente ->> 'logradouro',
          numero = p_cliente ->> 'numero',
          complemento = nullif(trim(p_cliente ->> 'complemento'), ''),
          bairro = p_cliente ->> 'bairro',
          cidade = p_cliente ->> 'cidade',
          uf = p_cliente ->> 'uf',
          referencia = nullif(trim(p_cliente ->> 'referencia'), '')
      where id = v_cliente.id
      returning * into v_cliente;

      insert into public.atividades (cliente_id, tipo, descricao)
      values (v_cliente.id, 'endereco_atualizado', 'Endereço de entrega atualizado pelo link da pré-venda');
    end if;

    -- Quem compra pelo link do grupo VIP passa a ser VIP.
    if v_pre_venda.canal = 'grupo_vip' and not v_cliente.vip then
      update public.clientes set vip = true where id = v_cliente.id;
    end if;
  end if;

  -- Frete: CEP na lista VIP → valor fixo; fora da lista → a cotar (R$ 0 até a equipe cotar).
  v_cep := regexp_replace(coalesce(v_cliente.cep, ''), '[^0-9]', '', 'g');
  v_frete_vip := public.cep_tem_frete_vip(v_cep);
  select coalesce(c.frete_vip_valor, 0) into v_valor_frete_vip from public.configuracoes c where c.id = 1;

  select * into v_caixa from public.caixa_em_andamento(v_cliente.id);

  if v_caixa.id is not null then
    -- ---- Caixa em andamento: os itens entram nela, com o mesmo frete ----------------
    select * into v_caixa from public.pedidos where id = v_caixa.id for update;

    -- Caixa já paga: guarda o que foi pago fora do PIX automático (o PIX cobra só a diferença).
    if v_caixa.status_pagamento = 'pago' then
      select coalesce(sum(c.valor_pago), 0) into v_pago_pix
      from public.cobrancas_pix c where c.pedido_id = v_caixa.id and c.status = 'pago';
      update public.pedidos
      set pago_fora_pix = greatest(v_caixa.total - v_pago_pix, 0)
      where id = v_caixa.id;
    end if;

    v_acrescimo := public.adicionar_itens_pre_venda(v_caixa.id, v_pre_venda.id, p_itens);

    -- Frete calculado sozinho (Olist Envios) valia para o peso de antes: volta para "a cotar"
    -- e é calculado de novo, para a caixa inteira, quando o cliente vê ou fecha a caixa.
    if v_caixa.frete = 'cotado' and v_caixa.frete_cotacao ->> 'origem' = 'shopify' then
      update public.pedidos
      set frete = 'a_cotar',
          taxa_entrega = 0,
          frete_cotacao = frete_cotacao || jsonb_build_object('situacao', 'desatualizada')
      where id = v_caixa.id;
    end if;

    -- Endereço novo digitado agora: vale para a caixa; se o CEP mudou, o frete é refeito.
    if v_gravar_endereco then
      v_cep_caixa := regexp_replace(coalesce(v_caixa.endereco_entrega ->> 'cep', ''), '[^0-9]', '', 'g');
      update public.pedidos
      set endereco_entrega = public.endereco_do_cliente(v_cliente),
          frete = case when v_cep_caixa = v_cep then frete
                       else (case when v_frete_vip then 'vip' else 'a_cotar' end)::public.situacao_frete end,
          taxa_entrega = case when v_cep_caixa = v_cep then taxa_entrega
                              when v_frete_vip then coalesce(v_valor_frete_vip, 0) else 0 end,
          frete_cotacao = case when v_cep_caixa = v_cep then frete_cotacao else null end
      where id = v_caixa.id;
    end if;

    update public.pedidos
    set caixa = 'aberta',
        status_pagamento = case when status_pagamento = 'pago' then 'pendente'::public.status_pagamento else status_pagamento end,
        observacoes = nullif(concat_ws(E'\n', observacoes, nullif(trim(p_observacoes), '')), '')
    where id = v_caixa.id
    returning * into v_pedido;

    insert into public.atividades (cliente_id, pedido_id, tipo, descricao, dados)
    values (
      v_cliente.id, v_pedido.id, 'caixa_itens_adicionados',
      format('Caixa VIP #%s: +%s unidade(s) da pré-venda "%s" (R$ %s)%s', v_pedido.numero,
             v_acrescimo ->> 'unidades', v_pre_venda.titulo,
             replace(to_char((v_acrescimo ->> 'valor')::numeric, 'FM999999990.00'), '.', ','),
             case when v_caixa.status_pagamento = 'pago' then ' — a caixa já estava paga: falta a diferença'
                  when v_caixa.frete = 'cotado' and v_caixa.frete_cotacao ->> 'origem' = 'shopify'
                    then ' — o frete é calculado de novo para a caixa inteira'
                  when v_caixa.frete = 'cotado' then ' — frete cotado antes dos itens novos: confira'
                  else '' end),
      v_acrescimo || jsonb_build_object('pre_venda_id', v_pre_venda.id)
    );

    perform public.registrar_evento('pedido.itens_adicionados', 'pedido', v_pedido.id,
      public.pedido_json(v_pedido.id) || jsonb_build_object('acrescimo', v_acrescimo || jsonb_build_object(
        'pre_venda', jsonb_build_object('id', v_pre_venda.id, 'titulo', v_pre_venda.titulo, 'slug', v_pre_venda.slug))));

    return v_pedido;
  end if;

  -- ---- Primeira compra: abre a Caixa VIP ------------------------------------------
  v_pedido := public.criar_pedido(
    p_cliente_id   => v_cliente.id,
    p_itens        => p_itens,
    p_pre_venda_id => v_pre_venda.id,
    p_origem       => 'link',
    p_observacoes  => p_observacoes,
    p_taxa_entrega => case when v_frete_vip then coalesce(v_valor_frete_vip, 0) else 0 end
  );

  update public.pedidos
  set frete = (case when v_frete_vip then 'vip' else 'a_cotar' end)::public.situacao_frete,
      caixa = 'aberta'
  where id = v_pedido.id
  returning * into v_pedido;

  if not v_frete_vip then
    insert into public.atividades (cliente_id, pedido_id, tipo, descricao, dados)
    values (
      v_cliente.id, v_pedido.id, 'frete_a_cotar',
      format('Pedido #%s: frete a cotar (CEP %s fora da lista VIP)', v_pedido.numero,
             case when length(v_cep) = 8 then substr(v_cep, 1, 5) || '-' || substr(v_cep, 6) else 'não informado' end),
      jsonb_build_object('cep', v_cep)
    );
  end if;

  return v_pedido;
end;
$$;

-- -----------------------------------------------------------------------------
-- Caixa vista pelo cliente: diz se o frete foi calculado pelo peso (frete_calculado)
-- -----------------------------------------------------------------------------

create or replace function public.caixa_publica(p_pedido_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'pedido_id', pe.id,
    'numero', pe.numero,
    'caixa', pe.caixa,
    'status', pe.status,
    'status_pagamento', pe.status_pagamento,
    'frete', pe.frete,
    'frete_calculado', coalesce(pe.frete = 'cotado' and pe.frete_cotacao ->> 'origem' = 'shopify', false),
    'subtotal', pe.subtotal,
    'taxa_entrega', pe.taxa_entrega,
    'desconto', pe.desconto,
    'total', pe.total,
    'pago', s.pago,
    'devido', s.devido,
    'cliente', jsonb_build_object(
      'primeiro_nome', split_part(trim(c.nome), ' ', 1),
      'tem_email', coalesce(c.email, '') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$',
      'cidade', pe.endereco_entrega ->> 'cidade',
      'uf', pe.endereco_entrega ->> 'uf',
      'bairro', pe.endereco_entrega ->> 'bairro'
    ),
    'unidades', coalesce((select sum(i.quantidade) from public.pedido_itens i where i.pedido_id = pe.id), 0),
    'previsao_envio', (
      select max(pv.previsao_entrega)
      from public.pedido_itens i
      join public.pre_vendas pv on pv.id = i.pre_venda_id
      where i.pedido_id = pe.id
    ),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'descricao', i.descricao,
        'quantidade', i.quantidade,
        'total', i.total,
        'pre_venda_id', i.pre_venda_id,
        'pre_venda_titulo', pv.titulo,
        'previsao_entrega', pv.previsao_entrega,
        'imagem_url', pr.imagem_url
      ) order by pv.criado_em nulls last, i.descricao)
      from public.pedido_itens i
      left join public.pre_vendas pv on pv.id = i.pre_venda_id
      left join public.produtos pr on pr.id = i.produto_id
      where i.pedido_id = pe.id
    ), '[]'::jsonb)
  )
  from public.pedidos pe
  join public.clientes c on c.id = pe.cliente_id
  cross join lateral public.saldo_pix_pedido(pe) s
  where pe.id = p_pedido_id;
$$;

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------

revoke all on public.integracao_shopify from anon, authenticated;
grant all on public.integracao_shopify to service_role;

revoke execute on function
  public.gravar_segredo_shopify(text, text),
  public.salvar_conexao_shopify(text, text, text, text, text, text, timestamptz),
  public.desconectar_shopify(),
  public.credenciais_shopify(),
  public.gravar_token_shopify(text, timestamptz, text),
  public.status_shopify(),
  public.unidades_para_frete(uuid),
  public.frete_a_calcular(uuid, boolean),
  public.aplicar_frete_calculado(uuid, integer, text, jsonb)
from public, anon, authenticated;

grant execute on function
  public.salvar_conexao_shopify(text, text, text, text, text, text, timestamptz),
  public.desconectar_shopify(),
  public.status_shopify()
to authenticated;

grant execute on function
  public.status_shopify(),
  public.credenciais_shopify(),
  public.gravar_token_shopify(text, timestamptz, text),
  public.unidades_para_frete(uuid),
  public.frete_a_calcular(uuid, boolean),
  public.aplicar_frete_calculado(uuid, integer, text, jsonb)
to service_role;
