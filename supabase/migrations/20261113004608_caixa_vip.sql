-- =============================================================================
-- PROMETHEUS CRM · CAIXA VIP (várias pré-vendas, um pedido, um frete, um pagamento)
--
-- O cliente vai montando a "Caixa VIP" dele ao longo da semana: cada compra no link de
-- qualquer pré-venda entra no MESMO pedido enquanto ele ainda não foi separado/enviado.
-- O WhatsApp identifica o cliente; o frete é cobrado uma vez; ele paga quando quiser
-- (ou na hora) e a caixa sai inteira para entrega.
--
--   • pedidos.caixa: null = pedido comum (manual, Shopify, links antigos);
--       'aberta'  = o cliente ainda está montando (aceita itens e não foi cobrado);
--       'fechada' = o cliente pediu para pagar, pagou ou a equipe fechou para cobrar.
--     Compras novas entram na caixa mais recente do cliente enquanto o pedido estiver
--     "novo" ou "confirmado" (mesmo já pago: aí ele paga só a diferença, sem frete novo).
--   • pedido_itens.pre_venda_id: de qual pré-venda veio cada item. Estoque, limite por
--     cliente e os números de cada pré-venda passam a contar pelos ITENS.
--   • pedidos.pago_fora_pix: valor já pago fora do PIX automático (baixa manual) quando a
--     caixa paga recebe itens novos — o PIX cobra só o que falta.
-- =============================================================================

create type public.situacao_caixa as enum ('aberta', 'fechada');

alter table public.pedidos
  add column caixa             public.situacao_caixa,
  add column caixa_fechada_em  timestamptz,
  add column pago_fora_pix     numeric(12, 2) not null default 0 check (pago_fora_pix >= 0);

comment on column public.pedidos.caixa is 'Caixa VIP do link: aberta (cliente montando) ou fechada (para pagar/pago). Nulo nos pedidos comuns.';
comment on column public.pedidos.pago_fora_pix is 'Valor já pago fora do PIX automático, registrado quando uma caixa paga recebe itens novos.';

-- No máximo uma caixa aberta por cliente.
create unique index pedidos_caixa_aberta_unica on public.pedidos (cliente_id) where caixa = 'aberta';
create index pedidos_caixa_em_andamento_idx on public.pedidos (cliente_id, criado_em desc)
  where caixa is not null and status in ('novo', 'confirmado');

alter table public.pedido_itens add column pre_venda_id uuid references public.pre_vendas (id) on delete set null;
comment on column public.pedido_itens.pre_venda_id is 'Pré-venda de origem do item (uma Caixa VIP junta itens de várias pré-vendas).';

update public.pedido_itens i
set pre_venda_id = pe.pre_venda_id
from public.pedidos pe
where pe.id = i.pedido_id and pe.pre_venda_id is not null and i.pre_venda_id is null;

create index pedido_itens_pre_venda_idx on public.pedido_itens (pre_venda_id, produto_id);

-- Item sem pré-venda informada herda a do pedido (pedido manual, API, Shopify).
create or replace function public.definir_pre_venda_do_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.pre_venda_id is null then
    select pe.pre_venda_id into new.pre_venda_id from public.pedidos pe where pe.id = new.pedido_id;
  end if;
  return new;
end;
$$;

create trigger pedido_itens_definir_pre_venda
  before insert on public.pedido_itens
  for each row execute function public.definir_pre_venda_do_item();

-- Caixa fecha sozinha quando é paga, separada, entregue ou cancelada.
create or replace function public.normalizar_caixa_pedido()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.caixa = 'aberta' and (
       new.status in ('separado', 'entregue', 'cancelado')
       or (new.status_pagamento = 'pago' and old.status_pagamento is distinct from 'pago')
     ) then
    new.caixa := 'fechada';
  end if;

  if new.caixa = 'fechada' and old.caixa is distinct from 'fechada' then
    new.caixa_fechada_em := now();
  elsif new.caixa = 'aberta' then
    new.caixa_fechada_em := null;
  end if;
  return new;
end;
$$;

create trigger pedidos_normalizar_caixa
  before update on public.pedidos
  for each row execute function public.normalizar_caixa_pedido();

-- -----------------------------------------------------------------------------
-- Itens de pré-venda (estoque e limite contados pelos itens)
-- -----------------------------------------------------------------------------

-- Acrescenta itens de uma pré-venda a um pedido, com o preço da pré-venda, respeitando
-- limite por cliente e estoque. Mesmo produto/pré-venda/preço soma na linha existente.
--   p_itens: [{"produto_id": "uuid", "quantidade": 2}, ...]
create or replace function public.adicionar_itens_pre_venda(p_pedido_id uuid, p_pre_venda_id uuid, p_itens jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_pedido       public.pedidos;
  v_item         record;
  v_produto      record;
  v_ja_comprado  integer;
  v_vendido      integer;
  v_unidades     integer := 0;
  v_valor        numeric := 0;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Selecione pelo menos um produto.' using errcode = 'P0001';
  end if;

  select * into v_pedido from public.pedidos where id = p_pedido_id;
  if not found then
    raise exception 'Pedido não encontrado.' using errcode = 'P0001';
  end if;

  for v_item in
    select (elem ->> 'produto_id')::uuid as produto_id,
           sum((elem ->> 'quantidade')::integer)::integer as quantidade
    from jsonb_array_elements(p_itens) as elem
    group by 1
  loop
    continue when v_item.quantidade is null or v_item.quantidade <= 0;

    -- Trava a linha do item para evitar vender além do estoque em pedidos simultâneos.
    select pvi.preco, pvi.limite_por_cliente, pvi.quantidade_disponivel,
           p.id, p.nome, p.volume_ml
      into v_produto
    from public.pre_venda_itens pvi
    join public.produtos p on p.id = pvi.produto_id
    where pvi.pre_venda_id = p_pre_venda_id
      and pvi.produto_id = v_item.produto_id
    for update of pvi;

    if not found then
      raise exception 'Um dos produtos não faz parte desta pré-venda.' using errcode = 'P0001';
    end if;

    if v_produto.limite_por_cliente is not null then
      select coalesce(sum(pi.quantidade), 0) into v_ja_comprado
      from public.pedido_itens pi
      join public.pedidos pe on pe.id = pi.pedido_id
      where pi.pre_venda_id = p_pre_venda_id
        and pi.produto_id = v_item.produto_id
        and pe.cliente_id = v_pedido.cliente_id
        and pe.status <> 'cancelado';

      if v_ja_comprado + v_item.quantidade > v_produto.limite_por_cliente then
        raise exception 'Limite de % unidade(s) por cliente para %.',
          v_produto.limite_por_cliente, v_produto.nome using errcode = 'P0001';
      end if;
    end if;

    if v_produto.quantidade_disponivel is not null then
      select coalesce(sum(pi.quantidade), 0) into v_vendido
      from public.pedido_itens pi
      join public.pedidos pe on pe.id = pi.pedido_id
      where pi.pre_venda_id = p_pre_venda_id
        and pi.produto_id = v_item.produto_id
        and pe.status <> 'cancelado';

      if v_vendido + v_item.quantidade > v_produto.quantidade_disponivel then
        raise exception '% esgotou: restam % unidade(s).',
          v_produto.nome, greatest(v_produto.quantidade_disponivel - v_vendido, 0) using errcode = 'P0001';
      end if;
    end if;

    update public.pedido_itens
    set quantidade = quantidade + v_item.quantidade
    where pedido_id = p_pedido_id
      and pre_venda_id = p_pre_venda_id
      and produto_id = v_produto.id
      and preco_unitario = v_produto.preco;

    if not found then
      insert into public.pedido_itens (pedido_id, pre_venda_id, produto_id, descricao, preco_unitario, quantidade)
      values (
        p_pedido_id,
        p_pre_venda_id,
        v_produto.id,
        v_produto.nome || coalesce(' · ' || v_produto.volume_ml || ' ml', ''),
        v_produto.preco,
        v_item.quantidade
      );
    end if;

    v_unidades := v_unidades + v_item.quantidade;
    v_valor := v_valor + v_produto.preco * v_item.quantidade;
  end loop;

  if v_unidades = 0 then
    raise exception 'Selecione pelo menos um produto.' using errcode = 'P0001';
  end if;

  return jsonb_build_object('unidades', v_unidades, 'valor', v_valor);
end;
$$;

-- Cria um pedido completo (mesmas regras de antes; itens de pré-venda pela função acima).
create or replace function public.criar_pedido(
  p_cliente_id    uuid,
  p_itens         jsonb,
  p_pre_venda_id  uuid default null,
  p_canal         public.canal_venda default null,
  p_origem        public.origem_pedido default 'manual',
  p_observacoes   text default null,
  p_endereco      jsonb default null,
  p_taxa_entrega  numeric default null,
  p_desconto      numeric default 0
)
returns public.pedidos
language plpgsql
set search_path = ''
as $$
declare
  v_cliente      public.clientes;
  v_pre_venda    public.pre_vendas;
  v_pedido       public.pedidos;
  v_item         record;
  v_produto      record;
  v_qtd_itens    integer := 0;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Selecione pelo menos um produto.' using errcode = 'P0001';
  end if;

  select * into v_cliente from public.clientes where id = p_cliente_id;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0001';
  end if;

  if p_pre_venda_id is not null then
    select * into v_pre_venda from public.pre_vendas where id = p_pre_venda_id;
    if not found then
      raise exception 'Pré-venda não encontrada.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.pedidos (
    cliente_id, pre_venda_id, canal, origem, taxa_entrega, desconto,
    observacoes, endereco_entrega, criado_por
  )
  values (
    v_cliente.id,
    v_pre_venda.id,
    coalesce(p_canal, v_pre_venda.canal, 'whatsapp'),
    coalesce(p_origem, 'manual'),
    coalesce(p_taxa_entrega, v_pre_venda.taxa_entrega, 0),
    coalesce(p_desconto, 0),
    nullif(trim(p_observacoes), ''),
    coalesce(p_endereco, public.endereco_do_cliente(v_cliente)),
    (select auth.uid())
  )
  returning * into v_pedido;

  if v_pre_venda.id is not null then
    perform public.adicionar_itens_pre_venda(v_pedido.id, v_pre_venda.id, p_itens);
  else
    for v_item in
      select (elem ->> 'produto_id')::uuid as produto_id,
             sum((elem ->> 'quantidade')::integer)::integer as quantidade
      from jsonb_array_elements(p_itens) as elem
      group by 1
    loop
      continue when v_item.quantidade is null or v_item.quantidade <= 0;

      select p.preco, p.id, p.nome, p.volume_ml
        into v_produto
      from public.produtos p
      where p.id = v_item.produto_id and p.ativo;

      if not found then
        raise exception 'Produto não encontrado ou inativo.' using errcode = 'P0001';
      end if;

      insert into public.pedido_itens (pedido_id, produto_id, descricao, preco_unitario, quantidade)
      values (
        v_pedido.id,
        v_produto.id,
        v_produto.nome || coalesce(' · ' || v_produto.volume_ml || ' ml', ''),
        v_produto.preco,
        v_item.quantidade
      );
      v_qtd_itens := v_qtd_itens + 1;
    end loop;

    if v_qtd_itens = 0 then
      raise exception 'Selecione pelo menos um produto.' using errcode = 'P0001';
    end if;
  end if;

  select * into v_pedido from public.pedidos where id = v_pedido.id;

  insert into public.atividades (cliente_id, pedido_id, tipo, descricao, dados)
  values (
    v_cliente.id, v_pedido.id, 'pedido_criado',
    format('Pedido #%s criado%s', v_pedido.numero,
           coalesce(' na pré-venda "' || v_pre_venda.titulo || '"', '')),
    jsonb_build_object('total', v_pedido.total, 'origem', v_pedido.origem, 'canal', v_pedido.canal)
  );

  return v_pedido;
end;
$$;

-- -----------------------------------------------------------------------------
-- Link público: compra entra na Caixa VIP do cliente
-- -----------------------------------------------------------------------------

-- Caixa em andamento do cliente: a mais recente ainda não separada/enviada.
create or replace function public.caixa_em_andamento(p_cliente_id uuid)
returns public.pedidos
language sql
stable
set search_path = ''
as $$
  select pe.*
  from public.pedidos pe
  where pe.cliente_id = p_cliente_id
    and pe.caixa is not null
    and pe.status in ('novo', 'confirmado')
    and pe.status_pagamento <> 'estornado'
  order by pe.criado_em desc
  limit 1;
$$;

-- Pedido pelo link público. Mesmas regras de antes; a novidade é a Caixa VIP:
-- se o cliente já tem uma caixa em andamento, os itens entram nela (frete único).
--   p_cliente: {whatsapp, nome, email, cep, logradouro, numero, complemento,
--               bairro, cidade, uf, referencia}
--   p_atualizar_endereco: o cliente digitou o endereço agora (grava no cadastro e na caixa).
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

    -- Endereço novo digitado agora: vale para a caixa; se o CEP mudou, o frete é refeito.
    if v_gravar_endereco then
      v_cep_caixa := regexp_replace(coalesce(v_caixa.endereco_entrega ->> 'cep', ''), '[^0-9]', '', 'g');
      update public.pedidos
      set endereco_entrega = public.endereco_do_cliente(v_cliente),
          frete = case when v_cep_caixa = v_cep then frete
                       else (case when v_frete_vip then 'vip' else 'a_cotar' end)::public.situacao_frete end,
          taxa_entrega = case when v_cep_caixa = v_cep then taxa_entrega
                              when v_frete_vip then coalesce(v_valor_frete_vip, 0) else 0 end
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
-- Pagamento: o que foi pago fora do PIX também conta
-- -----------------------------------------------------------------------------

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
    select coalesce(sum(c.valor_pago), 0)::numeric + coalesce(p_pedido.pago_fora_pix, 0) as pago
    from public.cobrancas_pix c
    where c.pedido_id = p_pedido.id and c.status = 'pago'
  ) v;
$$;

-- -----------------------------------------------------------------------------
-- Caixa vista pelo cliente (link e /pagar) — só o necessário, sem endereço completo
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

-- Link: o cliente digitou o WhatsApp → tem caixa em andamento? (service role)
create or replace function public.caixa_do_whatsapp(p_whatsapp text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cliente public.clientes;
  v_caixa   public.pedidos;
begin
  select * into v_cliente from public.clientes where whatsapp = public.normalizar_whatsapp(p_whatsapp);
  if not found then
    return jsonb_build_object('cliente', false);
  end if;

  select * into v_caixa from public.caixa_em_andamento(v_cliente.id);
  return jsonb_build_object(
    'cliente', true,
    'tem_endereco', v_cliente.logradouro is not null,
    'caixa', case when v_caixa.id is null then null else public.caixa_publica(v_caixa.id) end
  );
end;
$$;

-- O cliente escolheu "fechar a caixa e pagar agora" (service role).
create or replace function public.fechar_caixa(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pedidos set caixa = 'fechada' where id = p_pedido_id and caixa = 'aberta';
end;
$$;

-- -----------------------------------------------------------------------------
-- Números de cada pré-venda contados pelos itens
-- -----------------------------------------------------------------------------

create or replace view public.vw_pre_vendas
with (security_invoker = true)
as
select
  pv.*,
  case
    when pv.status = 'ativa' and pv.encerra_em is not null and pv.encerra_em <= now()
      then 'encerrada'::public.status_pre_venda
    else pv.status
  end as status_efetivo,
  coalesce(r.pedidos, 0)    as pedidos,
  coalesce(r.total, 0)      as total_vendido,
  coalesce(r.recebido, 0)   as total_recebido,
  coalesce(r.unidades, 0)   as unidades
from public.pre_vendas pv
left join lateral (
  select
    count(distinct pe.id)::integer as pedidos,
    sum(i.total) as total,
    sum(i.total) filter (where pe.status_pagamento = 'pago') as recebido,
    sum(i.quantidade)::integer as unidades
  from public.pedido_itens i
  join public.pedidos pe on pe.id = i.pedido_id
  where i.pre_venda_id = pv.id and pe.status <> 'cancelado'
) r on true;

create or replace view public.vw_pre_venda_itens
with (security_invoker = true)
as
select
  pvi.*,
  p.nome,
  p.estilo,
  p.cervejaria,
  p.volume_ml,
  p.teor_alcoolico,
  p.descricao,
  p.imagem_url,
  coalesce(v.vendido, 0) as vendido,
  case
    when pvi.quantidade_disponivel is null then null
    else greatest(pvi.quantidade_disponivel - coalesce(v.vendido, 0), 0)
  end as restante,
  p.fotos,
  p.cervejas_do_kit
from public.pre_venda_itens pvi
join public.produtos p on p.id = pvi.produto_id
left join lateral (
  select sum(i.quantidade)::integer as vendido
  from public.pedido_itens i
  join public.pedidos pe on pe.id = i.pedido_id
  where i.pre_venda_id = pvi.pre_venda_id
    and i.produto_id = pvi.produto_id
    and pe.status <> 'cancelado'
) v on true;

create or replace function public.resumo_produtos_vendidos(
  p_canal             public.canal_venda default null,
  p_pre_venda_id      uuid default null,
  p_inicio            timestamptz default null,
  p_fim               timestamptz default null,
  p_status_pagamento  public.status_pagamento default null
)
returns table (
  produto_id  uuid,
  descricao   text,
  estilo      text,
  quantidade  integer,
  total       numeric,
  pedidos     integer
)
language sql
stable
set search_path = ''
as $$
  select
    pi.produto_id,
    min(pi.descricao) as descricao,
    min(pr.estilo) as estilo,
    sum(pi.quantidade)::integer as quantidade,
    sum(pi.total) as total,
    count(distinct pi.pedido_id)::integer as pedidos
  from public.pedido_itens pi
  join public.pedidos pe on pe.id = pi.pedido_id
  left join public.produtos pr on pr.id = pi.produto_id
  where pe.status <> 'cancelado'
    and (p_canal is null or pe.canal = p_canal)
    and (p_pre_venda_id is null or pi.pre_venda_id = p_pre_venda_id)
    and (p_inicio is null or pe.criado_em >= p_inicio)
    and (p_fim is null or pe.criado_em < p_fim)
    and (p_status_pagamento is null or pe.status_pagamento = p_status_pagamento)
  group by pi.produto_id, case when pi.produto_id is null then pi.descricao end
  order by quantidade desc, descricao;
$$;

-- Excluir pré-venda com pedidos: sai só o que é DELA. Caixas com itens de outras
-- pré-vendas continuam (sem esses itens); pedidos que ficam vazios são excluídos.
create or replace function public.excluir_pre_venda(p_pre_venda_id uuid, p_com_pedidos boolean default false)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_titulo   text;
  v_pedidos  integer := 0;
  v_ids      uuid[];
begin
  if not public.eh_admin() then
    raise exception 'Só administradores podem excluir pré-vendas.' using errcode = 'P0001';
  end if;

  select titulo into v_titulo from public.pre_vendas where id = p_pre_venda_id;
  if not found then
    raise exception 'Pré-venda não encontrada.' using errcode = 'P0001';
  end if;

  select array_agg(distinct pe.id) into v_ids
  from public.pedidos pe
  where pe.pre_venda_id = p_pre_venda_id
     or exists (select 1 from public.pedido_itens i where i.pedido_id = pe.id and i.pre_venda_id = p_pre_venda_id);

  if v_ids is not null and not p_com_pedidos then
    raise exception 'Esta pré-venda tem pedidos. Confirme a exclusão junto com os pedidos.' using errcode = 'P0001';
  end if;

  if v_ids is not null then
    delete from public.pedido_itens where pre_venda_id = p_pre_venda_id and pedido_id = any (v_ids);

    with apagados as (
      delete from public.pedidos pe
      where pe.id = any (v_ids)
        and not exists (select 1 from public.pedido_itens i where i.pedido_id = pe.id)
      returning cliente_id, numero, total
    )
    insert into public.atividades (cliente_id, tipo, descricao, dados)
    select cliente_id, 'pedido_excluido',
           format('Pedido #%s excluído junto com a pré-venda "%s"', numero, v_titulo),
           jsonb_build_object('numero', numero, 'total', total)
    from apagados;
    get diagnostics v_pedidos = row_count;

    insert into public.atividades (cliente_id, pedido_id, tipo, descricao)
    select pe.cliente_id, pe.id, 'caixa_itens_removidos',
           format('Itens da pré-venda "%s" removidos da caixa #%s (pré-venda excluída)', v_titulo, pe.numero)
    from public.pedidos pe
    where pe.id = any (v_ids);
  end if;

  delete from public.pre_vendas where id = p_pre_venda_id;
  return v_pedidos;
end;
$$;

-- -----------------------------------------------------------------------------
-- n8n: o payload do pedido traz a caixa e a pré-venda de cada item
-- -----------------------------------------------------------------------------

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
    'caixa',             pe.caixa,
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
        'total', i.total,
        'pre_venda_id', i.pre_venda_id
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

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------

revoke execute on function
  public.definir_pre_venda_do_item(),
  public.normalizar_caixa_pedido(),
  public.adicionar_itens_pre_venda(uuid, uuid, jsonb),
  public.caixa_em_andamento(uuid),
  public.caixa_publica(uuid),
  public.caixa_do_whatsapp(text),
  public.fechar_caixa(uuid)
from public, anon;

revoke execute on function
  public.caixa_publica(uuid),
  public.caixa_do_whatsapp(text),
  public.fechar_caixa(uuid)
from authenticated;

grant execute on function
  public.adicionar_itens_pre_venda(uuid, uuid, jsonb),
  public.caixa_em_andamento(uuid)
to authenticated, service_role;

grant execute on function
  public.caixa_publica(uuid),
  public.caixa_do_whatsapp(text),
  public.fechar_caixa(uuid)
to service_role;
