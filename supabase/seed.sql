-- =============================================================================
-- PROMETHEUS CRM · DADOS DE DEMONSTRAÇÃO
-- Executado automaticamente em `supabase db reset` (ambiente local).
-- Em produção, rode manualmente no SQL Editor apenas se quiser dados de exemplo.
-- =============================================================================

do $$
declare
  v_hop          uuid;
  v_serra        uuid;
  v_distribui    uuid;
  v_vend_carlos  uuid;
  v_vend_paula   uuid;
  v_pv           uuid;
  v_mariana      uuid;
  v_camila       uuid;
  v_rafael       uuid;
  v_juliana      uuid;
  v_bruno        uuid;
  v_ipa          uuid;
  v_lager        uuid;
  v_stout        uuid;
  v_weiss        uuid;
  v_sour         uuid;
  v_apa          uuid;
  v_pedido       public.pedidos;
begin
  -- Configurações da loja ------------------------------------------------------
  update public.configuracoes
  set nome_loja = 'Prometheus Beer Club',
      whatsapp_loja = '5511999990000',
      chave_pix = 'financeiro@prometheus.beer',
      nome_recebedor_pix = 'Prometheus Bebidas LTDA'
  where id = 1;

  -- Fornecedores e vendedores --------------------------------------------------
  insert into public.fornecedores (nome, razao_social, cnpj, telefone, email, cidade, uf)
  values ('Hop Hunters Cervejaria', 'Hop Hunters Cervejaria Artesanal LTDA', '12345678000190', '11 3333-1000', 'comercial@hophunters.com.br', 'São Paulo', 'SP')
  returning id into v_hop;

  insert into public.fornecedores (nome, razao_social, cnpj, telefone, email, cidade, uf)
  values ('Serra Alta Brewing', 'Serra Alta Bebidas LTDA', '98765432000155', '35 3222-4000', 'vendas@serraalta.com.br', 'Poços de Caldas', 'MG')
  returning id into v_serra;

  insert into public.fornecedores (nome, razao_social, cnpj, cidade, uf)
  values ('Distribuidora Malte Sul', 'Malte Sul Distribuição LTDA', '45678912000133', 'Curitiba', 'PR')
  returning id into v_distribui;

  insert into public.vendedores (nome, whatsapp, email)
  values ('Carlos Mendes', '11987650001', 'carlos@representacoes.com.br')
  returning id into v_vend_carlos;

  insert into public.vendedores (nome, whatsapp, email)
  values ('Paula Siqueira', '41998760002', 'paula@maltesul.com.br')
  returning id into v_vend_paula;

  perform public.definir_empresas_do_vendedor(v_vend_carlos, array[v_hop, v_serra]);
  perform public.definir_empresas_do_vendedor(v_vend_paula, array[v_distribui]);

  -- Produtos -------------------------------------------------------------------
  insert into public.produtos (nome, estilo, cervejaria, fornecedor_id, volume_ml, teor_alcoolico, preco, sku, descricao)
  values ('Hop Hunters IPA', 'American IPA', 'Hop Hunters', v_hop, 473, 6.5, 24.90, 'HH-IPA-473', 'Cítrica, resinosa e com amargor marcante.')
  returning id into v_ipa;

  insert into public.produtos (nome, estilo, cervejaria, fornecedor_id, volume_ml, teor_alcoolico, preco, sku, descricao)
  values ('Volt Lager', 'Premium Lager', 'Hop Hunters', v_hop, 350, 4.8, 12.90, 'HH-LAGER-350', 'Leve, limpa e refrescante.')
  returning id into v_lager;

  insert into public.produtos (nome, estilo, cervejaria, fornecedor_id, volume_ml, teor_alcoolico, preco, sku, descricao)
  values ('Serra Imperial Stout', 'Russian Imperial Stout', 'Serra Alta', v_serra, 473, 10.5, 34.90, 'SA-RIS-473', 'Café, chocolate amargo e final licoroso.')
  returning id into v_stout;

  insert into public.produtos (nome, estilo, cervejaria, fornecedor_id, volume_ml, teor_alcoolico, preco, sku, descricao)
  values ('Serra Weiss', 'Weissbier', 'Serra Alta', v_serra, 500, 5.2, 19.90, 'SA-WEISS-500', 'Banana, cravo e corpo macio.')
  returning id into v_weiss;

  insert into public.produtos (nome, estilo, cervejaria, fornecedor_id, volume_ml, teor_alcoolico, preco, sku, descricao)
  values ('Catharina Sour de Maracujá', 'Catharina Sour', 'Malte Sul', v_distribui, 473, 4.5, 26.90, 'MS-SOUR-473', 'Ácida, frutada e muito refrescante.')
  returning id into v_sour;

  insert into public.produtos (nome, estilo, cervejaria, fornecedor_id, volume_ml, teor_alcoolico, preco, sku, descricao)
  values ('Pale Ale da Casa', 'American Pale Ale', 'Malte Sul', v_distribui, 473, 5.4, 21.90, 'MS-APA-473', 'Equilibrada, floral e fácil de beber.')
  returning id into v_apa;

  -- Clientes -------------------------------------------------------------------
  insert into public.clientes (nome, whatsapp, email, cep, logradouro, numero, bairro, cidade, uf, vip, tags)
  values ('Mariana Costa', '11987654321', 'mariana.costa@email.com', '05422000', 'Rua dos Pinheiros', '1200', 'Pinheiros', 'São Paulo', 'SP', true, '{IPA,Stout}')
  returning id into v_mariana;

  insert into public.clientes (nome, whatsapp, email, cep, logradouro, numero, complemento, bairro, cidade, uf, vip)
  values ('Camila Rocha', '11976543210', 'camila.rocha@email.com', '04538132', 'Avenida Brigadeiro Faria Lima', '3477', 'Apto 82', 'Itaim Bibi', 'São Paulo', 'SP', true)
  returning id into v_camila;

  insert into public.clientes (nome, whatsapp, email, cep, logradouro, numero, bairro, cidade, uf, vip)
  values ('Rafael Lima', '21998877665', 'rafael.lima@email.com', '22071000', 'Avenida Atlântica', '1702', 'Copacabana', 'Rio de Janeiro', 'RJ', true)
  returning id into v_rafael;

  insert into public.clientes (nome, whatsapp, email, cep, logradouro, numero, bairro, cidade, uf)
  values ('Juliana Alves', '31987001122', 'ju.alves@email.com', '30130010', 'Avenida Afonso Pena', '1500', 'Centro', 'Belo Horizonte', 'MG')
  returning id into v_juliana;

  insert into public.clientes (nome, whatsapp, email)
  values ('Bruno Ferreira', '11955554444', 'bruno.f@email.com')
  returning id into v_bruno;

  -- Pré-venda do Grupo VIP -----------------------------------------------------
  insert into public.pre_vendas (titulo, descricao, slug, canal, encerra_em, previsao_entrega, taxa_entrega)
  values (
    'Drop de Outubro',
    'Lote limitado de lançamentos para o Grupo VIP. Entrega na semana seguinte ao encerramento.',
    'drop-outubro',
    'grupo_vip',
    now() + interval '10 days',
    (current_date + 14),
    9.90
  )
  returning id into v_pv;

  insert into public.pre_venda_itens (pre_venda_id, produto_id, preco, limite_por_cliente, quantidade_disponivel, ordem)
  values
    (v_pv, v_ipa,   21.90, 12,   240, 1),
    (v_pv, v_stout, 29.90, 6,    96,  2),
    (v_pv, v_sour,  23.90, null, 120, 3),
    (v_pv, v_weiss, 17.90, null, null, 4);

  -- Pedidos de exemplo ---------------------------------------------------------
  v_pedido := public.criar_pedido(v_mariana, jsonb_build_array(
    jsonb_build_object('produto_id', v_ipa, 'quantidade', 6),
    jsonb_build_object('produto_id', v_stout, 'quantidade', 4)
  ), v_pv, null, 'link');
  update public.pedidos set status_pagamento = 'pago', forma_pagamento = 'PIX' where id = v_pedido.id;

  v_pedido := public.criar_pedido(v_camila, jsonb_build_array(
    jsonb_build_object('produto_id', v_sour, 'quantidade', 6),
    jsonb_build_object('produto_id', v_weiss, 'quantidade', 3)
  ), v_pv, null, 'link');
  perform public.registrar_cobranca(v_pedido.id);

  v_pedido := public.criar_pedido(v_rafael, jsonb_build_array(
    jsonb_build_object('produto_id', v_ipa, 'quantidade', 12)
  ), v_pv, null, 'link');

  v_pedido := public.criar_pedido(v_juliana, jsonb_build_array(
    jsonb_build_object('produto_id', v_lager, 'quantidade', 12),
    jsonb_build_object('produto_id', v_apa, 'quantidade', 6)
  ), null, 'whatsapp', 'manual');
  update public.pedidos set status_pagamento = 'pago', status = 'entregue', forma_pagamento = 'Cartão' where id = v_pedido.id;

  -- Contas a pagar ---------------------------------------------------------------
  insert into public.contas_fixas (descricao, categoria, valor, dia_vencimento, inicio_em)
  values
    ('Aluguel do galpão', 'Estrutura', 3800.00, 5, date_trunc('month', current_date - interval '2 months')),
    ('Internet fibra', 'Estrutura', 199.90, 10, date_trunc('month', current_date - interval '2 months')),
    ('Contabilidade', 'Serviços', 650.00, 15, date_trunc('month', current_date - interval '2 months')),
    ('Plano Shopify', 'Software', 180.00, 20, date_trunc('month', current_date - interval '2 months'));

  perform public.gerar_contas_fixas((date_trunc('month', current_date - interval '1 month'))::date);
  perform public.gerar_contas_fixas((date_trunc('month', current_date))::date);

  update public.contas_pagar set status = 'paga'
  where competencia < (date_trunc('month', current_date))::date;

  insert into public.contas_pagar (descricao, categoria, tipo, fornecedor_id, competencia, vencimento, valor)
  values
    ('Lote Hop Hunters IPA (240 latas)', 'Mercadorias', 'variavel', v_hop,
      (date_trunc('month', current_date))::date, current_date + 7, 3120.00),
    ('Frete Serra Alta', 'Logística', 'variavel', v_serra,
      (date_trunc('month', current_date))::date, current_date + 3, 420.00);
end;
$$;
