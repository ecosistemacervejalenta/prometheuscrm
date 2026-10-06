// =============================================================================
// Teste do banco SEM Docker: aplica todas as migrations + seed em um Postgres
// embutido (PGlite/WASM) com um "stub" mínimo do Supabase (auth, storage, roles)
// e verifica as regras de negócio e o RLS.
//   npm run db:test            (resumo)
//   VERBOSE=1 npm run db:test  (mostra os dados consultados)
// =============================================================================
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../supabase/', import.meta.url))
let falhas = 0
const db = new PGlite()

const stub = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create publication supabase_realtime;
`
await db.exec(stub)

const files = readdirSync(join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql')).sort()
for (const f of files) {
  try {
    await db.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8'))
    console.log('✓ migration', f)
  } catch (e) {
    console.error('✗ migration', f, '\n', e.message, e.position ? `pos ${e.position}` : '', e.where ?? '')
    process.exit(1)
  }
}

try {
  await db.exec(readFileSync(join(ROOT, 'seed.sql'), 'utf8'))
  console.log('✓ seed')
} catch (e) {
  console.error('✗ seed\n', e.message, e.where ?? '')
  process.exit(1)
}

const q = async (sql, params) => (await db.query(sql, params)).rows
const show = (label, v) => {
  if (process.env.VERBOSE) console.log(`\n— ${label}\n`, JSON.stringify(v, null, 2))
  else console.log(`• ${label}`)
}
const expectEq = (label, atual, esperado) => {
  const a = JSON.stringify(atual)
  const e = JSON.stringify(esperado)
  if (a === e) console.log(`✓ ${label}`)
  else {
    falhas++
    console.log(`✗ ${label}: esperado ${e}, veio ${a}`)
  }
}
const expectError = async (label, sql, params) => {
  try {
    await db.query(sql, params)
    falhas++
    console.log(`✗ ${label}: deveria ter falhado`)
  } catch (e) {
    console.log(`✓ ${label}: ${e.message}`)
  }
}

show('contagens', (await q(`select
  (select count(*) from clientes) clientes, (select count(*) from pedidos) pedidos,
  (select count(*) from contas_pagar) contas, (select count(*) from eventos_integracao) eventos,
  (select count(*) from atividades) atividades`))[0])

show('pedidos', await q(`select numero, cliente_nome, canal, status_pagamento, subtotal, taxa_entrega, total, unidades, pago_em is not null as tem_pago_em from vw_pedidos order by numero`))

show('identificar existente', (await q(`select identificar_cliente_pre_venda('(11) 98765-4321') r`))[0].r)
show('identificar novo', (await q(`select identificar_cliente_pre_venda('11 90000-0000') r`))[0].r)

// Cliente novo pelo link
const itens = await q(`select produto_id, nome from vw_pre_venda_itens where pre_venda_id = (select id from pre_vendas where slug='drop-outubro') order by ordem`)
const novo = await q(`select * from registrar_pedido_pre_venda('drop-outubro', $1::jsonb, $2::jsonb, false, 'Entregar após 18h')`, [
  JSON.stringify({ whatsapp: '(11) 91234-5678', nome: 'Pedro Novo', email: 'PEDRO@EMAIL.COM', cep: '01310-100', logradouro: 'Avenida Paulista', numero: '1000', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'sp' }),
  JSON.stringify([{ produto_id: itens[0].produto_id, quantidade: 2 }, { produto_id: itens[1].produto_id, quantidade: 1 }, { produto_id: itens[0].produto_id, quantidade: 1 }]),
])
show('pedido cliente novo', novo[0])
show('cliente criado', (await q(`select nome, whatsapp, email, cep, uf, vip, origem from clientes where whatsapp = '5511912345678'`))[0])

// Mesmo cliente, segunda compra só com o WhatsApp (sem endereço)
const segundo = await q(`select numero, total, endereco_entrega from registrar_pedido_pre_venda('drop-outubro', $1::jsonb, $2::jsonb)`, [
  JSON.stringify({ whatsapp: '11912345678' }),
  JSON.stringify([{ produto_id: itens[2].produto_id, quantidade: 1 }]),
])
show('segunda compra (dados puxados)', segundo[0])

await expectError('cliente novo sem endereço', `select registrar_pedido_pre_venda('drop-outubro', $1::jsonb, $2::jsonb)`, [
  JSON.stringify({ whatsapp: '11933334444', nome: 'Sem Endereço' }),
  JSON.stringify([{ produto_id: itens[0].produto_id, quantidade: 1 }]),
])
await expectError('limite por cliente (IPA 12)', `select registrar_pedido_pre_venda('drop-outubro', $1::jsonb, $2::jsonb)`, [
  JSON.stringify({ whatsapp: '11912345678' }),
  JSON.stringify([{ produto_id: itens[0].produto_id, quantidade: 10 }]),
])
await expectError('estoque (Stout 96)', `select registrar_pedido_pre_venda('drop-outubro', $1::jsonb, $2::jsonb)`, [
  JSON.stringify({ whatsapp: '11912345678' }),
  JSON.stringify([{ produto_id: itens[1].produto_id, quantidade: 200 }]),
])
await expectError('pré-venda inexistente', `select registrar_pedido_pre_venda('nao-existe', '{"whatsapp":"11912345678"}'::jsonb, '[]'::jsonb)`)
await expectError('whatsapp inválido', `select registrar_pedido_pre_venda('drop-outubro', '{"whatsapp":"123"}'::jsonb, $1::jsonb)`, [
  JSON.stringify([{ produto_id: itens[0].produto_id, quantidade: 1 }]),
])
await expectError('produto fora da pré-venda', `select registrar_pedido_pre_venda('drop-outubro', '{"whatsapp":"11912345678"}'::jsonb, $1::jsonb)`, [
  JSON.stringify([{ produto_id: (await q(`select id from produtos where sku='HH-LAGER-350'`))[0].id, quantidade: 1 }]),
])

// Frete do link: CEP na lista VIP → frete fixo; fora da lista → a cotar
expectEq('frete VIP padrão é R$ 15 e comprovantes vão para o 11 93709-9371',
  (await q(`select frete_vip_valor::float valor, whatsapp_comprovante from configuracoes`))[0], { valor: 15, whatsapp_comprovante: '5511937099371' })
expectEq('importa CEPs avulsos e faixas', (await q(`select substituir_ceps_frete_vip($1::jsonb, 'ceps-vip.xlsx') r`, [
  JSON.stringify([['01310100', '01310100'], ['04000000', '04999999'], ['05424000']]),
]))[0].r, { faixas: 1, ceps_avulsos: 2, ceps_cobertos: 1000002 })
expectEq('CEP avulso (com máscara) está na lista', (await q(`select cep_tem_frete_vip('01310-100') r`))[0].r, true)
expectEq('CEP dentro da faixa está na lista', (await q(`select cep_tem_frete_vip('04567890') r`))[0].r, true)
expectEq('CEP fora da lista', (await q(`select cep_tem_frete_vip('01310-101') r`))[0].r, false)
expectEq('CEP incompleto nunca está na lista', (await q(`select cep_tem_frete_vip('0131') r`))[0].r, false)
expectEq('nome do arquivo importado', (await q(`select frete_vip_arquivo from configuracoes`))[0].frete_vip_arquivo, 'ceps-vip.xlsx')

const enderecoLink = { logradouro: 'Rua Augusta', numero: '500', complemento: 'Apto 12', bairro: 'Consolação', cidade: 'São Paulo', uf: 'SP' }
const pedidoVip = (await q(`select * from registrar_pedido_pre_venda('drop-outubro', $1::jsonb, $2::jsonb, true)`, [
  JSON.stringify({ whatsapp: '(11) 95555-0001', nome: 'Ana Souza', cep: '04567-890', ...enderecoLink }),
  JSON.stringify([{ produto_id: itens[2].produto_id, quantidade: 1 }]),
]))[0]
expectEq('link com CEP VIP: frete fixo de R$ 15', { frete: pedidoVip.frete, taxa: Number(pedidoVip.taxa_entrega), total: Number(pedidoVip.total) },
  { frete: 'vip', taxa: 15, total: Number(pedidoVip.subtotal) + 15 })

const pedidoCotar = (await q(`select * from registrar_pedido_pre_venda('drop-outubro', $1::jsonb, $2::jsonb, true)`, [
  JSON.stringify({ whatsapp: '(11) 95555-0002', nome: 'Bruno Lima', cep: '13010-000', ...enderecoLink, cidade: 'Campinas' }),
  JSON.stringify([{ produto_id: itens[2].produto_id, quantidade: 1 }]),
]))[0]
expectEq('link com CEP fora da lista: frete a cotar (R$ 0)', { frete: pedidoCotar.frete, taxa: Number(pedidoCotar.taxa_entrega) }, { frete: 'a_cotar', taxa: 0 })
expectEq('linha do tempo avisa o frete a cotar', (await q(`select descricao from atividades where pedido_id = $1 and tipo = 'frete_a_cotar'`, [pedidoCotar.id]))[0]?.descricao,
  `Pedido #${pedidoCotar.numero}: frete a cotar (CEP 13010-000 fora da lista VIP)`)
const cotado = (await q(`select * from cotar_frete_pedido($1, 22.5)`, [pedidoCotar.id]))[0]
expectEq('equipe cota o frete', { frete: cotado.frete, taxa: Number(cotado.taxa_entrega), total: Number(cotado.total) },
  { frete: 'cotado', taxa: 22.5, total: Number(cotado.subtotal) + 22.5 })
await expectError('frete negativo', `select cotar_frete_pedido($1, -1)`, [pedidoCotar.id])
await expectError('CEP com formato inválido na lista', `select substituir_ceps_frete_vip('[["0131010","0131010"]]'::jsonb)`)
await expectError('faixa invertida', `select substituir_ceps_frete_vip('[["05000000","04000000"]]'::jsonb)`)
expectEq('lista continua intacta após importação recusada', (await q(`select resumo_ceps_frete_vip() r`))[0].r.ceps_cobertos, 1000002)

show('saldo dos itens', await q(`select nome, preco, quantidade_disponivel, vendido, restante from vw_pre_venda_itens order by ordem`))
show('resumo grupo vip', await q(`select descricao, estilo, quantidade, total, pedidos from resumo_produtos_vendidos(p_canal => 'grupo_vip')`))
show('vw_pre_vendas', await q(`select titulo, status_efetivo, pedidos, total_vendido, total_recebido, unidades from vw_pre_vendas`))
show('metricas', (await q(`select metricas_painel(now() - interval '30 days', now() + interval '1 day') m`))[0].m)
show('receita semanal', await q(`select * from receita_semanal(4)`))

// Contas fixas idempotentes
show('gerar fixas de novo (0 esperado)', (await q(`select gerar_contas_fixas(current_date) n`))[0].n)
show('gerar fixas mês que vem', (await q(`select gerar_contas_fixas((current_date + interval '1 month')::date) n`))[0].n)
show('contas do mês', await q(`select descricao, tipo, vencimento, valor, status, situacao from vw_contas_pagar where competencia = date_trunc('month', current_date)::date order by vencimento`))

// Eventos
show('eventos', await q(`select tipo, status, jsonb_array_length(coalesce(payload->'itens','[]')) as itens from eventos_integracao order by criado_em, tipo`))

// Cobrança + pagamento → linha do tempo e eventos
const pid = (await q(`select id from pedidos where status_pagamento = 'pendente' order by numero limit 1`))[0].id
await q(`select registrar_cobranca($1)`, [pid])
await q(`update pedidos set status_pagamento = 'pago' where id = $1`, [pid])
show('atividades do pedido', await q(`select tipo, descricao from atividades where pedido_id = $1 order by criado_em`, [pid]))
show('eventos do pedido', await q(`select tipo from eventos_integracao where entidade_id = $1 order by criado_em`, [pid]))

// Vendedor × empresas
const vend = (await q(`select id from vendedores where nome = 'Carlos Mendes'`))[0].id
await q(`select definir_empresas_do_vendedor($1, '{}'::uuid[], array['Nova Cervejaria X', 'hop hunters cervejaria'])`, [vend])
show('empresas do Carlos', await q(`select f.nome from fornecedor_vendedores fv join fornecedores f on f.id = fv.fornecedor_id where fv.vendedor_id = $1 order by 1`, [vend]))

// Shopify
const shop = {
  shopify_order_id: '5550001', status_pagamento: 'pago', taxa_entrega: 15, desconto: 5,
  cliente: { shopify_customer_id: 'c-77', nome: 'Mariana Costa', email: 'mariana.costa@email.com' },
  itens: [{ sku: 'HH-IPA-473', descricao: 'Hop Hunters IPA', quantidade: 3, preco_unitario: 24.9 }, { descricao: 'Copo', quantidade: 1, preco_unitario: 30 }],
}
const imp1 = (await q(`select importar_pedido_shopify($1::jsonb) id`, [JSON.stringify(shop)]))[0].id
const imp2 = (await q(`select importar_pedido_shopify($1::jsonb) id`, [JSON.stringify({ ...shop, status: 'entregue' })]))[0].id
show('shopify idempotente', { mesmo: imp1 === imp2, pedido: (await q(`select numero, canal, total, status, status_pagamento, (select shopify_customer_id from clientes where id = cliente_id) from pedidos where id = $1`, [imp1]))[0] })

// salvar_pre_venda
const pv2 = (await q(`select * from salvar_pre_venda($1::jsonb, $2::jsonb)`, [
  JSON.stringify({ titulo: 'Teste', canal: 'whatsapp', taxa_entrega: null, encerra_em: null }),
  JSON.stringify([{ produto_id: itens[0].produto_id, preco: 10 }, { produto_id: itens[1].produto_id, preco: 20, limite_por_cliente: 2 }]),
]))[0]
await q(`select salvar_pre_venda($2::jsonb, $3::jsonb, $1)`, [pv2.id,
  JSON.stringify({ titulo: 'Teste editado', slug: 'teste-editado' }),
  JSON.stringify([{ produto_id: itens[1].produto_id, preco: 25, limite_por_cliente: null }]),
])
show('salvar_pre_venda', await q(`select pv.titulo, pv.slug, pv.canal, i.preco, i.limite_por_cliente from pre_vendas pv join pre_venda_itens i on i.pre_venda_id = pv.id where pv.id = $1`, [pv2.id]))
await expectError('pré-venda sem itens', `select salvar_pre_venda('{"titulo":"x"}'::jsonb, '[]'::jsonb, $1)`, [pv2.id])
await expectError('slug inválido', `select salvar_pre_venda('{"titulo":"x","slug":"Com Espaço"}'::jsonb, $1::jsonb)`, [JSON.stringify([{ produto_id: itens[0].produto_id, preco: 1 }])])

// Financeiro --------------------------------------------------------------------
const um = async (sql, params) => (await q(sql, params))[0]

// Galeria de fotos e kit de cervejas ---------------------------------------------
expectEq('produto com imagem_url ganha fotos = [capa]', await um(`insert into produtos (nome, preco, imagem_url) values ('Foto antiga', 10, 'https://x/a.jpg') returning fotos, imagem_url`),
  { fotos: ['https://x/a.jpg'], imagem_url: 'https://x/a.jpg' })
const prodKit = await um(`insert into produtos (nome, preco, fotos, cervejas_do_kit) values ('Kit Duas Marcas', 99, array['https://x/1.jpg','https://x/2.jpg'],
  '[{"nome":"Golden Pulp","cervejaria":"Croma","quantidade":2},{"nome":"Stout","cervejaria":"Bodebrown","quantidade":1}]') returning id, imagem_url`)
expectEq('capa = 1ª foto da galeria', prodKit.imagem_url, 'https://x/1.jpg')
expectEq('reordenar as fotos troca a capa', (await um(`update produtos set fotos = array['https://x/2.jpg','https://x/1.jpg'] where id = $1 returning imagem_url`, [prodKit.id])).imagem_url, 'https://x/2.jpg')
expectEq('trocar a capa pelo cadastro de produtos mantém as outras fotos', (await um(`update produtos set imagem_url = 'https://x/3.jpg' where id = $1 returning fotos`, [prodKit.id])).fotos, ['https://x/3.jpg', 'https://x/1.jpg'])
expectEq('sem fotos, sem capa', (await um(`update produtos set fotos = '{}' where id = $1 returning imagem_url`, [prodKit.id])).imagem_url, null)
await expectError('cervejas do kit precisam ser uma lista', `update produtos set cervejas_do_kit = '{}'::jsonb where id = $1`, [prodKit.id])
await expectError('no máximo 10 fotos', `update produtos set fotos = array_fill('https://x/f.jpg'::text, array[11]) where id = $1`, [prodKit.id])
expectEq('vw_pre_venda_itens traz fotos e cervejas do kit', Object.keys(await um(`select * from vw_pre_venda_itens limit 1`)).filter((k) => ['fotos', 'cervejas_do_kit'].includes(k)), ['fotos', 'cervejas_do_kit'])
const mes = async (deslocamento) =>
  (await um(`select to_char(date_trunc('month', hoje_brasilia()) + make_interval(months => $1), 'YYYY-MM-DD') m`, [deslocamento])).m

// Categorias: iniciais, cadastro automático, grafia reaproveitada, sem duplicatas
const cats = await um(`select
  count(*) filter (where natureza = 'pagar') pagar, count(*) filter (where natureza = 'receber') receber,
  bool_and(nome <> '') ok from categorias_financeiras`)
expectEq('categorias iniciais (pagar ≥ 11, receber ≥ 6)', Number(cats.pagar) >= 11 && Number(cats.receber) >= 6, true)
const cpCat = await um(`insert into contas_pagar (descricao, categoria, competencia, vencimento, valor)
  values ('Teste categoria', '  mercadorias ', hoje_brasilia(), hoje_brasilia(), 10) returning id, categoria`)
expectEq('categoria reaproveita a grafia cadastrada', cpCat.categoria, 'Mercadorias')
const cpNova = await um(`insert into contas_pagar (descricao, categoria, competencia, vencimento, valor)
  values ('Teste categoria nova', 'Frete   Expresso', hoje_brasilia(), hoje_brasilia(), 10) returning categoria`)
expectEq('categoria nova é normalizada', cpNova.categoria, 'Frete Expresso')
await q(`insert into contas_fixas (descricao, categoria, valor, dia_vencimento) values ('Teste fixa categoria', 'FRETE EXPRESSO', 1, 1)`)
expectEq('categoria nova cadastrada uma única vez',
  Number((await um(`select count(*) n from categorias_financeiras where natureza = 'pagar' and lower(nome) = 'frete expresso'`)).n), 1)
expectEq('categoria vazia vira Outros',
  (await um(`insert into contas_pagar (descricao, categoria, competencia, vencimento, valor) values ('x', '   ', hoje_brasilia(), hoje_brasilia(), 1) returning categoria`)).categoria, 'Outros')
await expectError('categoria duplicada (maiúsculas)', `insert into categorias_financeiras (natureza, nome) values ('pagar', 'OUTROS')`)
await expectError('categoria com mais de 60 caracteres', `insert into categorias_financeiras (natureza, nome) values ('pagar', repeat('a', 61))`)
await q(`insert into categorias_financeiras (natureza, nome) values ('receber', 'Frete Expresso')`)
show('mesma categoria nas duas naturezas', await q(`select natureza, nome from categorias_financeiras where nome = 'Frete Expresso' order by natureza`))

// Contas a pagar: competência, data de pagamento e situação (fuso de Brasília)
const variavel = await um(`insert into contas_pagar (descricao, competencia, vencimento, valor)
  values ('Variável que muda de mês', hoje_brasilia(), hoje_brasilia(), 50) returning id`)
await q(`update contas_pagar set vencimento = (date_trunc('month', hoje_brasilia()) + interval '1 month 4 days')::date where id = $1`, [variavel.id])
expectEq('variável muda de mês junto com o vencimento',
  (await um(`select to_char(competencia, 'YYYY-MM-DD') c from contas_pagar where id = $1`, [variavel.id])).c, await mes(1))
await q(`update contas_pagar set status = 'paga' where id = $1`, [variavel.id])
expectEq('pagamento sem data usa hoje (Brasília) e o valor da conta',
  await um(`select pago_em = hoje_brasilia() as hoje, valor_pago::float as valor from contas_pagar where id = $1`, [variavel.id]), { hoje: true, valor: 50 })
await q(`update contas_pagar set status = 'pendente' where id = $1`, [variavel.id])
expectEq('reabrir limpa data e valor pagos',
  await um(`select pago_em, valor_pago from contas_pagar where id = $1`, [variavel.id]), { pago_em: null, valor_pago: null })
await q(`insert into contas_pagar (descricao, competencia, vencimento, valor) values
  ('Situação 1 ontem', hoje_brasilia(), hoje_brasilia() - 1, 1),
  ('Situação 2 hoje', hoje_brasilia(), hoje_brasilia(), 1),
  ('Situação 3 daqui 10 dias', hoje_brasilia(), hoje_brasilia() + 10, 1)`)
expectEq('vencida / vence logo / em dia',
  (await q(`select situacao from vw_contas_pagar where descricao like 'Situação %' order by descricao`)).map((r) => r.situacao),
  ['vencida', 'vence_logo', 'em_dia'])

// Contas fixas: geração, pausa, fim, aplicar ao pendente e exclusão
const fixa = await um(`insert into contas_fixas (descricao, categoria, valor, dia_vencimento, inicio_em)
  values ('Fixa de teste', 'Estrutura', 100, 31, date_trunc('month', hoje_brasilia()) - interval '2 months') returning id`)
for (const d of [0, 1, 2]) await q(`select gerar_contas_fixas($1::date)`, [await mes(d)])
const lancamentos = async () => (await q(`select to_char(competencia, 'YYYY-MM') m, status, valor::float valor, extract(day from vencimento)::int dia
  from contas_pagar where conta_fixa_id = $1 order by competencia`, [fixa.id]))
expectEq('fixa gerada no mês atual e nos 2 próximos', (await lancamentos()).length, 3)
expectEq('dia 31 vira o último dia do mês',
  (await um(`select vencimento = (date_trunc('month', hoje_brasilia()) + interval '1 month - 1 day')::date ok from contas_pagar where conta_fixa_id = $1 and competencia = date_trunc('month', hoje_brasilia())`, [fixa.id])).ok, true)
expectEq('gerar de novo não duplica', (await um(`select gerar_contas_fixas($1::date) n`, [await mes(1)])).n, 0)
await q(`update contas_fixas set ativa = false where id = $1`, [fixa.id])
expectEq('pausar remove só os pendentes dos próximos meses', (await lancamentos()).map((l) => l.m), [(await mes(0)).slice(0, 7)])
expectEq('pausada não é gerada', (await um(`select gerar_contas_fixas($1::date) n`, [await mes(1)])).n, 0)
await q(`update contas_fixas set ativa = true where id = $1`, [fixa.id])
for (const d of [1, 2]) await q(`select gerar_contas_fixas($1::date)`, [await mes(d)])
await q(`update contas_fixas set valor = 150, dia_vencimento = 10 where id = $1`, [fixa.id])
expectEq('aplicar modelo às pendentes', (await um(`select aplicar_conta_fixa_aos_pendentes($1) n`, [fixa.id])).n, 3)
expectEq('valor e dia atualizados', (await lancamentos()).map((l) => [l.valor, l.dia]), [[150, 10], [150, 10], [150, 10]])
await q(`update contas_pagar set status = 'paga' where conta_fixa_id = $1 and competencia = date_trunc('month', hoje_brasilia())`, [fixa.id])
expectEq('aplicar não mexe em conta paga', (await um(`select aplicar_conta_fixa_aos_pendentes($1) n`, [fixa.id])).n, 2)
await q(`update contas_fixas set fim_em = date_trunc('month', hoje_brasilia()) - interval '1 month' where id = $1`, [fixa.id])
expectEq('encerrar remove pendentes depois do fim e mantém a paga', (await lancamentos()).map((l) => l.status), ['paga'])
const fixa2 = await um(`insert into contas_fixas (descricao, valor, dia_vencimento) values ('Fixa excluída', 80, 5) returning id`)
for (const d of [0, 1]) await q(`select gerar_contas_fixas($1::date)`, [await mes(d)])
await q(`delete from contas_fixas where id = $1`, [fixa2.id])
expectEq('excluir modelo mantém o mês atual e remove os próximos',
  (await q(`select to_char(competencia, 'YYYY-MM') m, conta_fixa_id from contas_pagar where descricao = 'Fixa excluída' order by competencia`)),
  [{ m: (await mes(0)).slice(0, 7), conta_fixa_id: null }])
const fixaAdiada = await um(`update contas_pagar set vencimento = vencimento + 40 where descricao = 'Aluguel do galpão' and competencia = date_trunc('month', hoje_brasilia()) returning to_char(competencia, 'YYYY-MM-DD') c`)
expectEq('fixa com vencimento adiado continua no mês de origem', fixaAdiada.c, await mes(0))
expectEq('e não é gerada de novo', (await um(`select gerar_contas_fixas(hoje_brasilia()) n`)).n, 0)

// Contas a receber
const rec = await um(`insert into contas_receber (descricao, categoria, pagador, competencia, vencimento, valor)
  values ('Venda a prazo', 'vendas a PRAZO', '   ', hoje_brasilia(), (date_trunc('month', hoje_brasilia()) + interval '1 month 9 days')::date, 300)
  returning id, categoria, pagador, to_char(competencia, 'YYYY-MM-DD') competencia`)
expectEq('receber: categoria, pagador vazio e mês do vencimento', { ...rec, id: undefined },
  { categoria: 'Vendas a prazo', pagador: null, competencia: await mes(1) })
await q(`insert into contas_receber (descricao, categoria, competencia, vencimento, valor) values ('Patrocínio', 'Patrocínio', hoje_brasilia(), hoje_brasilia(), 1000)`)
expectEq('receber: categoria nova cadastrada como receber',
  (await q(`select natureza from categorias_financeiras where nome = 'Patrocínio'`)).map((r) => r.natureza), ['receber'])
await q(`update contas_receber set status = 'recebida' where id = $1`, [rec.id])
expectEq('receber: recebida sem data usa hoje e o valor',
  await um(`select recebido_em = hoje_brasilia() as hoje, valor_recebido::float as valor from contas_receber where id = $1`, [rec.id]), { hoje: true, valor: 300 })
await q(`update contas_receber set status = 'pendente' where id = $1`, [rec.id])
expectEq('receber: reabrir limpa o recebimento',
  await um(`select recebido_em, valor_recebido from contas_receber where id = $1`, [rec.id]), { recebido_em: null, valor_recebido: null })
await q(`update contas_receber set vencimento = hoje_brasilia() - 1 where id = $1`, [rec.id])
expectEq('receber: muda de mês e fica vencida',
  await um(`select to_char(competencia, 'YYYY-MM-DD') c, situacao from vw_contas_receber where id = $1`, [rec.id]),
  { c: (await um(`select to_char(date_trunc('month', hoje_brasilia() - 1), 'YYYY-MM-DD') m`)).m, situacao: 'vencida' })
await expectError('receber: valor negativo', `insert into contas_receber (descricao, competencia, vencimento, valor) values ('x', hoje_brasilia(), hoje_brasilia(), -1)`)
await expectError('receber: sem descrição', `insert into contas_receber (descricao, competencia, vencimento, valor) values ('  ', hoje_brasilia(), hoje_brasilia(), 1)`)
// Renomear e excluir categorias
const catFrete = await um(`select id from categorias_financeiras where natureza = 'pagar' and nome = 'Frete Expresso'`)
const contasFrete = (await um(`select count(*)::int n from contas_pagar where categoria = 'Frete Expresso'`)).n
await q(`select renomear_categoria_financeira($1, '  Frete   rápido ')`, [catFrete.id])
expectEq('renomear leva as contas e o modelo junto', await um(`select
  (select count(*)::int from contas_pagar where categoria = 'Frete rápido') contas,
  (select count(*)::int from contas_fixas where categoria = 'Frete rápido') fixas,
  (select count(*)::int from contas_pagar where categoria = 'Frete Expresso') antigas,
  (select count(*)::int from categorias_financeiras where natureza = 'receber' and nome = 'Frete Expresso') receber_intacta`),
  { contas: contasFrete, fixas: 1, antigas: 0, receber_intacta: 1 })
await q(`select renomear_categoria_financeira($1, 'FRETE RÁPIDO')`, [catFrete.id])
expectEq('renomear só mudando maiúsculas', (await um(`select nome from categorias_financeiras where id = $1`, [catFrete.id])).nome, 'FRETE RÁPIDO')
await expectError('renomear para nome existente', `select renomear_categoria_financeira($1, 'mercadorias')`, [catFrete.id])
await expectError('renomear para vazio', `select renomear_categoria_financeira($1, '   ')`, [catFrete.id])
await expectError('renomear Outros', `select renomear_categoria_financeira((select id from categorias_financeiras where natureza = 'pagar' and nome = 'Outros'), 'Diversos')`)
await expectError('excluir Outros', `select excluir_categoria_financeira((select id from categorias_financeiras where natureza = 'receber' and nome = 'Outros'))`)
await q(`select excluir_categoria_financeira($1)`, [catFrete.id])
expectEq('excluir manda as contas para Outros', await um(`select
  (select count(*)::int from contas_pagar where descricao = 'Teste categoria nova' and categoria = 'Outros') contas,
  (select count(*)::int from contas_fixas where descricao = 'Teste fixa categoria' and categoria = 'Outros') fixas,
  (select count(*)::int from categorias_financeiras where id = $1) categoria`, [catFrete.id]),
  { contas: 1, fixas: 1, categoria: 0 })

show('contas a receber (seed + testes)', await q(`select descricao, categoria, pagador, vencimento, valor, status, situacao from vw_contas_receber order by vencimento`))

// Olist ERP ---------------------------------------------------------------------
await q(`insert into pedidos_erp (id, numero, canal, ecommerce, situacao, data_pedido, valor) values
  (1, 101, 'mercado_livre', 'Mercado Livre', 1, '2026-09-10', 100.50),
  (2, 102, 'mercado_livre', 'Mercado Livre', 6, '2026-09-30', 49.50),
  (3, 103, 'mercado_livre', 'Mercado Livre', 2, '2026-09-15', 999.00),
  (4, 104, 'shopee', 'Shopee', 0, '2026-09-01', 80.00),
  (5, 105, 'shopify', 'Shopify', 9, '2026-09-20', 120.00),
  (6, 106, 'outro', 'API Tiny', 1, '2026-09-20', 70.00),
  (7, 107, 'shopee', 'Shopee', 1, '2026-10-01', 55.00),
  (8, 108, 'shopee', 'Shopee', 8, '2026-09-12', 33.00)`)
expectEq('regra do Olist: Aberta (0), Cancelada (2) e Dados incompletos (8) não contam',
  (await q(`select s, situacao_erp_conta_venda(s::smallint) conta from generate_series(0, 9) s order by s`)).filter((r) => !r.conta).map((r) => r.s),
  [0, 2, 8])
expectEq('vendas ERP por canal: regra do Olist e dentro do intervalo',
  (await q(`select canal, valor::float valor, pedidos from vendas_erp_por_canal('2026-09-01', '2026-09-30') order by canal`)),
  [{ canal: 'mercado_livre', valor: 150, pedidos: 2 }, { canal: 'outro', valor: 70, pedidos: 1 },
   { canal: 'shopify', valor: 120, pedidos: 1 }])
expectEq('vendas ERP por dia: mesma regra, um registro por dia e canal',
  (await q(`select to_char(dia, 'MM-DD') dia, canal, valor::float valor, pedidos from vendas_erp_por_dia('2026-09-01', '2026-09-30') order by dia, canal`)),
  [{ dia: '09-10', canal: 'mercado_livre', valor: 100.5, pedidos: 1 }, { dia: '09-20', canal: 'outro', valor: 70, pedidos: 1 },
   { dia: '09-20', canal: 'shopify', valor: 120, pedidos: 1 }, { dia: '09-30', canal: 'mercado_livre', valor: 49.5, pedidos: 1 }])
expectEq('séries batem com o total por canal',
  (await um(`select (select sum(valor) from vendas_erp_por_dia('2026-09-01', '2026-09-30'))::float dias,
                    (select sum(valor) from vendas_erp_por_canal('2026-09-01', '2026-09-30'))::float canais`)),
  { dias: 340, canais: 340 })
// Grupo VIP (CRM): o dia é o de Brasília
const vips = (await q(`select id from pedidos where canal = 'grupo_vip' and status <> 'cancelado' order by numero limit 2`)).map((r) => r.id)
await q(`update pedidos set criado_em = '2026-09-10 23:30:00-03' where id = $1`, [vips[0]])
await q(`update pedidos set criado_em = '2026-09-11 00:10:00-03' where id = $1`, [vips[1]])
expectEq('vendas CRM por dia: virada do dia no horário de Brasília',
  (await q(`select to_char(dia, 'MM-DD') dia, pedidos from vendas_crm_por_dia('grupo_vip', '2026-09-10', '2026-09-11') order by dia`)),
  [{ dia: '09-10', pedidos: 1 }, { dia: '09-11', pedidos: 1 }])
expectEq('vendas CRM por dia: intervalo de um dia não pega o dia seguinte',
  (await q(`select pedidos from vendas_crm_por_dia('grupo_vip', '2026-09-10', '2026-09-10')`)).map((r) => r.pedidos), [1])
await q(`update pedidos set status = 'cancelado' where id = $1`, [vips[1]])
expectEq('vendas CRM por dia: cancelado não conta',
  (await q(`select count(*)::int n from vendas_crm_por_dia('grupo_vip', '2026-09-11', '2026-09-11')`)), [{ n: 0 }])
expectEq('vendas ERP: intervalo de um dia (inclusivo)',
  (await q(`select canal, pedidos from vendas_erp_por_canal('2026-10-01', '2026-10-01')`)), [{ canal: 'shopee', pedidos: 1 }])
await q(`insert into integracao_olist (id, access_token, refresh_token, access_expira_em, refresh_expira_em, conectado_em, ultima_sincronizacao)
  values (1, 'segredo-access', 'segredo-refresh', now() + interval '4 hours', now() + interval '1 day', now(), now())`)
await expectError('só existe uma linha de conexão do Olist', `insert into integracao_olist (id) values (2)`)

// Banco de Leads ----------------------------------------------------------------
const pasta = await um(`insert into leads_pastas (nome, descricao) values ('  Central   da Cerveja ', 'Listas do WhatsApp') returning id, nome`)
expectEq('pasta: nome normalizado', pasta.nome, 'Central da Cerveja')
await expectError('pasta: nome repetido (maiúsculas)', `insert into leads_pastas (nome) values ('CENTRAL DA CERVEJA')`)
const lista = await um(`insert into leads_listas (pasta_id, nome, origem, arquivo_nome, colunas, coluna_nome, coluna_whatsapp)
  values ($1, 'Grupo VIP', 'WhatsApp', 'grupo-vip.xlsx', $2::jsonb, 'c0', 'c1') returning id, status`,
  [pasta.id, JSON.stringify([{ chave: 'c0', rotulo: 'Nome', tipo: 'nome' }, { chave: 'c1', rotulo: 'Telefone', tipo: 'telefone' }])])
expectEq('lista nasce "importando"', lista.status, 'importando')
const lote = [
  { linha: 1, nome: ' João   Silva ', whatsapp: '(11) 98765-4321', dados: { c0: 'João Silva', c1: '(11) 98765-4321' } },
  { linha: 2, nome: 'Maria', whatsapp: '11987654321', dados: { c0: 'Maria', c1: '11987654321' } },
  { linha: 3, nome: 'Sem número', whatsapp: '123', dados: { c0: 'Sem número', c1: '123' } },
  { linha: 4, nome: 'Gringo', whatsapp: '+351 912 345 678', dados: { c0: 'Gringo', c1: '+351 912 345 678' } },
  { linha: 5, nome: 'Ana', email: ' ANA@EXEMPLO.COM ', dados: { c0: 'Ana' } },
]
expectEq('importar: número repetido na lista é ignorado', (await um(`select importar_leads($1, $2::jsonb) n`, [lista.id, JSON.stringify(lote)])).n, 4)
expectEq('importar de novo o mesmo lote não duplica nada', (await um(`select importar_leads($1, $2::jsonb) n`, [lista.id, JSON.stringify(lote)])).n, 0)
expectEq('leads normalizados', await q(`select linha, nome, whatsapp, email from leads where lista_id = $1 order by linha`, [lista.id]), [
  { linha: 1, nome: 'João Silva', whatsapp: '5511987654321', email: null },
  { linha: 3, nome: 'Sem número', whatsapp: null, email: null },
  { linha: 4, nome: 'Gringo', whatsapp: '351912345678', email: null },
  { linha: 5, nome: 'Ana', whatsapp: null, email: 'ana@exemplo.com' },
])
await q(`select concluir_importacao_leads($1)`, [lista.id])
expectEq('concluir: totais e status', await um(`select status, total, com_whatsapp from leads_listas where id = $1`, [lista.id]), { status: 'pronta', total: 4, com_whatsapp: 2 })
expectEq('vw_leads marca quem já é cliente', await q(`select linha, ja_cliente from vw_leads where lista_id = $1 order by linha`, [lista.id]),
  [{ linha: 1, ja_cliente: true }, { linha: 3, ja_cliente: false }, { linha: 4, ja_cliente: false }, { linha: 5, ja_cliente: false }])
expectEq('busca encontra por qualquer coluna', (await q(`select linha from leads where lista_id = $1 and busca like '%912 345%' order by linha`, [lista.id])).map((r) => r.linha), [4])
expectEq('vw_leads_pastas soma listas e leads', await um(`select listas, leads, com_whatsapp from vw_leads_pastas where id = $1`, [pasta.id]), { listas: 1, leads: 4, com_whatsapp: 2 })
await expectError('não exclui pasta com listas', `delete from leads_pastas where id = $1`, [pasta.id])
await expectError('lista com nome repetido na mesma pasta', `insert into leads_listas (pasta_id, nome) values ($1, 'grupo vip')`, [pasta.id])
await expectError('lote acima de 5.000 é recusado', `select importar_leads($1, (select jsonb_agg(jsonb_build_object('linha', g)) from generate_series(1, 5001) g))`, [lista.id])
const listaTemp = await um(`insert into leads_listas (pasta_id, nome) values ($1, 'Temporária') returning id`, [pasta.id])
await q(`select importar_leads($1, '[{"linha":1,"nome":"x","whatsapp":"11911112222"}]'::jsonb)`, [listaTemp.id])
await q(`delete from leads_listas where id = $1`, [listaTemp.id])
expectEq('excluir lista apaga os leads dela', Number((await um(`select count(*) n from leads where lista_id = $1`, [listaTemp.id])).n), 0)

// RLS ---------------------------------------------------------------------------
const uid =(await q(`insert into auth.users (email, raw_user_meta_data) values ('ana@prometheus.beer', '{"nome":"Ana Ribeiro"}') returning id`))[0].id
const uid2 = (await q(`insert into auth.users (email) values ('joao@prometheus.beer') returning id`))[0].id
show('perfis', await q(`select nome, email, papel from perfis order by criado_em`))

await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
show('autenticado (membro) vê clientes', (await q(`select count(*) from clientes`))[0])
show('autenticado cria pedido manual', (await q(`select numero, total, criado_por is not null as tem_autor from criar_pedido((select id from clientes where nome='Bruno Ferreira'), $1::jsonb, null, 'loja')`, [JSON.stringify([{ produto_id: itens[0].produto_id, quantidade: 1 }])]))[0])
await expectError('autenticado não chama função do link público', `select identificar_cliente_pre_venda('11987654321')`)
expectEq('membro importa a lista de CEPs VIP', (await um(`select substituir_ceps_frete_vip('[["01310100","01310100"],["04000000","04999999"],["05424000","05424000"]]'::jsonb, 'ceps.csv') r`)).r.ceps_cobertos, 1000002)
expectEq('membro testa um CEP', (await um(`select cep_tem_frete_vip('04100-000') r`)).r, true)
expectEq('membro cota frete', (await um(`select frete from cotar_frete_pedido($1, 30)`, [pedidoCotar.id])).frete, 'cotado')
const pvExcluir = await um(`select id from salvar_pre_venda('{"titulo":"Pré-venda para excluir"}'::jsonb, $1::jsonb)`, [JSON.stringify([{ produto_id: itens[0].produto_id, preco: 10 }])])
const slugExcluir = (await um(`select slug from pre_vendas where id = $1`, [pvExcluir.id])).slug
await db.exec(`reset role;`)
const vendaTeste = await um(`select id, numero, total, cliente_id from registrar_pedido_pre_venda($1, $2::jsonb, $3::jsonb, true)`, [slugExcluir,
  JSON.stringify({ whatsapp: '11955550009', nome: 'Teste Exclusão', cep: '01310-100', logradouro: 'Rua A', numero: '1', bairro: 'B', cidade: 'São Paulo', uf: 'SP' }),
  JSON.stringify([{ produto_id: itens[0].produto_id, quantidade: 1 }])])
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
await expectError('pré-venda com pedidos não é excluída sem confirmar', `select excluir_pre_venda($1)`, [pvExcluir.id])
await q(`select excluir_pedido($1)`, [vendaTeste.id])
expectEq('admin exclui a venda (sai do faturamento)', Number((await um(`select count(*) n from pedidos where id = $1`, [vendaTeste.id])).n), 0)
expectEq('linha do tempo do cliente registra a exclusão', (await um(`select descricao from atividades where cliente_id = $1 and tipo = 'pedido_excluido'`, [vendaTeste.cliente_id]))?.descricao?.startsWith(`Pedido #${vendaTeste.numero} excluído`), true)
await db.exec(`reset role;`)
await q(`select registrar_pedido_pre_venda($1, $2::jsonb, $3::jsonb, true)`, [slugExcluir,
  JSON.stringify({ whatsapp: '11955550009', cep: '01310-100', logradouro: 'Rua A', numero: '1', bairro: 'B', cidade: 'São Paulo', uf: 'SP' }),
  JSON.stringify([{ produto_id: itens[0].produto_id, quantidade: 2 }])])
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
expectEq('admin exclui a pré-venda junto com os pedidos', (await um(`select excluir_pre_venda($1, true) n`, [pvExcluir.id])).n, 1)
expectEq('pré-venda e pedidos somem', await um(`select (select count(*)::int from pre_vendas where id = $1) pv, (select count(*)::int from pedidos where pre_venda_id = $1) pe`, [pvExcluir.id]), { pv: 0, pe: 0 })
const recMembro = await um(`insert into contas_receber (descricao, categoria, competencia, vencimento, valor)
  values ('Lançada pela equipe', 'Categoria da equipe', hoje_brasilia(), hoje_brasilia() + 5, 99.9) returning id`).catch((e) => ({ erro: e.message }))
expectEq('membro lança conta a receber com categoria nova', recMembro.erro ?? Boolean(recMembro.id), true)
expectEq('membro vê a categoria criada', Number((await um(`select count(*) n from categorias_financeiras where nome = 'Categoria da equipe'`)).n), 1)
await q(`select renomear_categoria_financeira((select id from categorias_financeiras where nome = 'Categoria da equipe'), 'Categoria renomeada')`)
expectEq('membro renomeia categoria', (await um(`select categoria from contas_receber where id = $1`, [recMembro.id])).categoria, 'Categoria renomeada')
await q(`update contas_receber set status = 'recebida' where id = $1`, [recMembro.id])
expectEq('membro lê vw_contas_receber', (await um(`select situacao from vw_contas_receber where id = $1`, [recMembro.id])).situacao, 'recebida')
expectEq('membro lê vw_contas_pagar (hoje_brasilia liberada)', Number((await um(`select count(*) n from vw_contas_pagar`)).n) > 0, true)
const fixaMembro = await um(`insert into contas_fixas (descricao, valor, dia_vencimento) values ('Fixa da equipe', 10, 1) returning id`)
await q(`select gerar_contas_fixas(hoje_brasilia())`)
await q(`update contas_fixas set valor = 12 where id = $1`, [fixaMembro.id])
expectEq('membro aplica modelo às pendentes', (await um(`select aplicar_conta_fixa_aos_pendentes($1) n`, [fixaMembro.id])).n, 1)
await q(`update contas_fixas set ativa = false where id = $1`, [fixaMembro.id])
await q(`delete from contas_fixas where id = $1`, [fixaMembro.id])
expectEq('membro lê pedidos do ERP', Number((await um(`select count(*) n from pedidos_erp`)).n), 8)
expectEq('membro soma vendas do ERP', (await q(`select canal from vendas_erp_por_canal('2026-09-01', '2026-09-30') order by canal`)).length, 3)
expectEq('membro consulta séries por dia (ERP e CRM)', await um(`select
  (select count(*)::int from vendas_erp_por_dia('2026-09-01', '2026-09-30')) erp,
  (select count(*)::int from vendas_crm_por_dia('grupo_vip', '2026-09-10', '2026-09-10')) crm`), { erp: 4, crm: 1 })
await expectError('membro não grava pedidos do ERP', `insert into pedidos_erp (id, canal, data_pedido) values (99, 'shopee', current_date)`)
await expectError('membro não altera pedidos do ERP', `update pedidos_erp set valor = 0 where id = 1 returning id`)
await expectError('membro não lê os tokens do Olist', `select access_token from integracao_olist`)
const pastaMembro = await um(`insert into leads_pastas (nome) values ('Pasta da equipe') returning id, criado_por`)
expectEq('membro cria pasta (autor registrado)', pastaMembro.criado_por, uid)
const listaMembro = await um(`insert into leads_listas (pasta_id, nome) values ($1, 'Lista da equipe') returning id`, [pastaMembro.id])
expectEq('membro importa leads', (await um(`select importar_leads($1, '[{"linha":1,"nome":"Lead","whatsapp":"21999998888"}]'::jsonb) n`, [listaMembro.id])).n, 1)
await q(`select concluir_importacao_leads($1)`, [listaMembro.id])
expectEq('membro vê a lista pronta e o lead', await um(`select (select status from leads_listas where id = $1) status, (select count(*)::int from vw_leads where lista_id = $1) leads`, [listaMembro.id]), { status: 'pronta', leads: 1 })
const statusOlist = (await um(`select status_integracao_olist() s`)).s
expectEq('status do Olist sem expor tokens', { conectado: statusOlist.conectado, expirada: statusOlist.expirada, temToken: JSON.stringify(statusOlist).includes('segredo') }, { conectado: true, expirada: false, temToken: false })
await db.exec(`reset role;`)

await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid2}', false);`)
show('autenticado inativo (novo usuário) vê clientes (0)', (await q(`select count(*) from clientes`))[0])
expectEq('inativo não vê contas a receber', Number((await um(`select count(*) n from contas_receber`)).n), 0)
expectEq('inativo não vê categorias', Number((await um(`select count(*) n from categorias_financeiras`)).n), 0)
expectEq('inativo não vê pedidos do ERP', Number((await um(`select count(*) n from pedidos_erp`)).n), 0)
expectEq('inativo não vê leads nem pastas', await um(`select (select count(*)::int from leads) leads, (select count(*)::int from leads_pastas) pastas`), { leads: 0, pastas: 0 })
await expectError('inativo não cria pasta de leads', `insert into leads_pastas (nome) values ('Invasor')`)
expectEq('inativo não vê vendas do CRM por dia', (await q(`select * from vendas_crm_por_dia('grupo_vip', '2026-01-01', '2026-12-31')`)).length, 0)
expectEq('inativo não vê o status do Olist', (await um(`select status_integracao_olist() s`)).s, null)
await expectError('inativo não lança conta a receber', `insert into contas_receber (descricao, competencia, vencimento, valor) values ('x', current_date, current_date, 1)`)
await expectError('inativo não troca a lista de CEPs VIP', `select substituir_ceps_frete_vip('[["01000000","01000000"]]'::jsonb)`)
expectEq('inativo não enxerga a lista de CEPs VIP', (await um(`select cep_tem_frete_vip('01310100') r`)).r, false)
await expectError('inativo não cota frete', `select cotar_frete_pedido($1, 1)`, [pedidoCotar.id])
await db.exec(`reset role; update perfis set ativo = true where id = '${uid2}'; set role authenticated; select set_config('request.jwt.claim.sub', '${uid2}', false);`)
await q(`update perfis set nome = 'João Silva' where id = $1`, [uid2])
await expectError('equipe tenta virar admin', `update perfis set papel = 'admin' where id = $1`, [uid2])
await expectError('equipe não exclui venda', `select excluir_pedido($1)`, [pedidoCotar.id])
await expectError('equipe não exclui pré-venda', `select excluir_pre_venda((select id from pre_vendas limit 1), true)`)
// Senha temporária: ao criar a própria senha, o membro desliga só a própria trava (RLS ignora a dos outros).
await db.exec(`reset role; update perfis set trocar_senha = true where id in ('${uid}', '${uid2}'); set role authenticated; select set_config('request.jwt.claim.sub', '${uid2}', false);`)
await q(`update perfis set trocar_senha = false where id = $1`, [uid2])
await q(`update perfis set trocar_senha = false where id = $1`, [uid])
await db.exec(`reset role;`)
expectEq('senha temporária: membro libera só a própria trava', await um(`select (select trocar_senha from perfis where id = $1) eu, (select trocar_senha from perfis where id = $2) outro`, [uid2, uid]), { eu: false, outro: true })
await db.exec(`update perfis set trocar_senha = false where id = '${uid}'; set role authenticated; select set_config('request.jwt.claim.sub', '${uid2}', false);`)
await expectError('equipe (não admin) não desconecta o Olist', `select desconectar_olist()`)
await expectError('equipe (não admin) não conecta o Olist', `select salvar_conexao_olist('a', 'b', now(), now())`)
await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false);`)
await q(`update perfis set cargo = 'Atendimento' where id = $1`, [uid2])
await q(`select desconectar_olist()`)
expectEq('admin desconecta o Olist', (await um(`select status_integracao_olist() s`)).s.conectado, false)
await q(`select salvar_conexao_olist('novo-access', 'novo-refresh', now() + interval '4 hours', now() + interval '1 day')`)
expectEq('admin reconecta o Olist', (await um(`select status_integracao_olist() s`)).s.conectado, true)
await db.exec(`reset role;`)
expectEq('reconexão grava tokens e quem conectou', await um(`select access_token, conectado_por = $1 as autor from integracao_olist`, [uid]), { access_token: 'novo-access', autor: true })
await q(`select set_config('request.jwt.claim.sub', $1, false)`, [uid])
await db.exec(`set role authenticated;`)
await q(`select desconectar_olist()`)
await db.exec(`reset role;`)
expectEq('desconectar apaga os tokens e mantém os pedidos', await um(`select
  (select access_token is null and refresh_token is null from integracao_olist) sem_tokens,
  (select count(*)::int from pedidos_erp) pedidos`), { sem_tokens: true, pedidos: 8 })
show('perfil do João', (await q(`select nome, cargo, papel, ativo from perfis where id = $1`, [uid2]))[0])

await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`)
await expectError('anon lê clientes', `select * from clientes`)
await expectError('anon chama função', `select identificar_cliente_pre_venda('11987654321')`)
await expectError('anon lê contas a receber', `select * from contas_receber`)
await expectError('anon lê categorias', `select * from categorias_financeiras`)
await expectError('anon lê vw_contas_receber', `select * from vw_contas_receber`)
await expectError('anon chama aplicar_conta_fixa_aos_pendentes', `select aplicar_conta_fixa_aos_pendentes(gen_random_uuid())`)
await expectError('anon lê pedidos do ERP', `select * from pedidos_erp`)
await expectError('anon lê tokens do Olist', `select * from integracao_olist`)
await expectError('anon consulta status do Olist', `select status_integracao_olist()`)
await expectError('anon lê leads', `select * from leads`)
await expectError('anon lê vw_leads', `select * from vw_leads`)
await expectError('anon importa leads', `select importar_leads(gen_random_uuid(), '[]'::jsonb)`)
await expectError('anon consulta séries do ERP', `select * from vendas_erp_por_dia('2026-09-01', '2026-09-30')`)
await expectError('anon consulta séries do CRM', `select * from vendas_crm_por_dia('grupo_vip', '2026-09-01', '2026-09-30')`)
await db.exec(`reset role;`)

// Atendimento WhatsApp ----------------------------------------------------------
{
  let seq = 0
  const base = Date.now()
  const msg = (chatid, extra = {}) => {
    seq++
    return {
      wa_id: `5511991866186:M${seq}`, wa_messageid: `M${seq}`, chatid, whatsapp: chatid.split('@')[0],
      nome_whatsapp: 'Ju', direcao: 'entrada', tipo: 'texto', texto: `mensagem ${seq}`,
      enviada_em: new Date(base + seq * 1000).toISOString(), ...extra,
    }
  }
  const reg = async (m) => (await um(`select registrar_mensagem_whatsapp($1::jsonb) r`, [JSON.stringify(m)])).r
  const atend = (id) => um(`select numero, status, nao_lidas, responsavel_id, ultima_mensagem_previa, ultima_mensagem_direcao from atendimentos where id = $1`, [id])
  const JU = '553187001122@s.whatsapp.net' // Juliana (cliente do seed) — o WhatsApp manda sem o 9

  await db.exec(`set role service_role;`)
  const r1 = await reg(msg(JU))
  expectEq('webhook: contato novo abre atendimento na fila', { novo: r1.contato_novo, aberto: r1.atendimento_aberto }, { novo: true, aberto: true })
  expectEq('contato: número ganha o 9º dígito e casa com o cliente', await um(`select whatsapp, contato_nome, cliente_nome from vw_atendimentos where id = $1`, [r1.atendimento_id]),
    { whatsapp: '5531987001122', contato_nome: 'Juliana Alves', cliente_nome: 'Juliana Alves' })
  const repetida = msg(JU)
  await reg(repetida)
  expectEq('webhook repetido não duplica', (await reg(repetida)).duplicada, true)
  expectEq('fila com 2 não lidas', await atend(r1.atendimento_id), { numero: 1, status: 'fila', nao_lidas: 2, responsavel_id: null, ultima_mensagem_previa: `mensagem ${seq}`, ultima_mensagem_direcao: 'entrada' })
  expectEq('lead automático na pasta "Clientes WhatsApp" › lista "WhatsApp"', await um(`select l.nome, l.whatsapp, ll.nome lista, p.nome pasta, ll.total
    from whatsapp_contatos c join leads l on l.id = c.lead_id join leads_listas ll on ll.id = l.lista_id join leads_pastas p on p.id = ll.pasta_id where c.id = $1`, [r1.contato_id]),
    { nome: 'Juliana Alves', whatsapp: '5531987001122', lista: 'WhatsApp', pasta: 'Clientes WhatsApp', total: 1 })
  const foto = await reg(msg(JU, { tipo: 'imagem', texto: 'olha essa', midia_mime: 'image/jpeg' }))
  expectEq('mídia fica pendente de download', await um(`select midia_status, tipo from whatsapp_mensagens where id = $1`, [foto.mensagem_id]), { midia_status: 'pendente', tipo: 'imagem' })
  expectEq('prévia da foto', (await atend(r1.atendimento_id)).ultima_mensagem_previa, '📷 olha essa')
  await expectError('grupo/sem chatid é recusado', `select registrar_mensagem_whatsapp('{"wa_id":"x","direcao":"entrada"}'::jsonb)`)

  // A equipe responde pelo CRM
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
  const envio = await um(`select preparar_envio_whatsapp($1, '*Ana:* Temos sim!') r`, [r1.atendimento_id])
  expectEq('responder da fila assume o atendimento', await atend(r1.atendimento_id).then((a) => ({ status: a.status, eu: a.responsavel_id === uid, nao_lidas: a.nao_lidas })),
    { status: 'em_atendimento', eu: true, nao_lidas: 0 })
  expectEq('envio devolve o chatid de destino', envio.r.chatid, JU)
  await db.exec(`reset role; set role service_role;`)
  const eco = await reg(msg(JU, { direcao: 'saida', texto: '*Ana:* Temos sim!', status: 'enviada', track_id: envio.r.mensagem_id }))
  expectEq('eco do envio (track_id) não duplica', { duplicada: eco.duplicada, mesma: eco.mensagem_id === envio.r.mensagem_id }, { duplicada: true, mesma: true })
  expectEq('eco grava o id e o status', await um(`select wa_id is not null tem_id, status, enviada_por = $2 autor from whatsapp_mensagens where id = $1`, [envio.r.mensagem_id, uid]),
    { tem_id: true, status: 'enviada', autor: true })
  const mid = (await um(`select wa_messageid from whatsapp_mensagens where id = $1`, [envio.r.mensagem_id])).wa_messageid
  expectEq('recibo de leitura', (await um(`select atualizar_status_whatsapp(array[$1], 'lida') n`, [mid])).n, 1)
  await q(`select atualizar_status_whatsapp(array[$1], 'entregue')`, [mid])
  expectEq('recibo atrasado não regride o status', (await um(`select status from whatsapp_mensagens where id = $1`, [envio.r.mensagem_id])).status, 'lida')
  const celular = await reg(msg(JU, { direcao: 'saida', texto: 'respondi pelo celular' }))
  expectEq('resposta pelo celular entra no atendimento sem autor', await um(`select atendimento_id = $2 mesmo, enviada_por from whatsapp_mensagens where id = $1`, [celular.mensagem_id, r1.atendimento_id]),
    { mesmo: true, enviada_por: null })

  // Status
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
  await q(`select alterar_status_atendimento($1, 'aguardando_cliente')`, [r1.atendimento_id])
  await db.exec(`reset role; set role service_role;`)
  await reg(msg(JU))
  expectEq('cliente responde: "aguardando" volta para "em atendimento"', (await atend(r1.atendimento_id)).status, 'em_atendimento')
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${uid2}', false);`)
  await expectError('outro membro não "assume" atendimento de alguém', `select assumir_atendimento($1)`, [r1.atendimento_id])
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false);`)
  await q(`select transferir_atendimento($1, $2)`, [r1.atendimento_id, uid2])
  expectEq('transferência troca o responsável', (await atend(r1.atendimento_id)).responsavel_id, uid2)
  await q(`insert into atendimento_eventos (atendimento_id, tipo, texto) values ($1, 'nota', 'Gosta de IPA e Stout')`, [r1.atendimento_id])
  await q(`select alterar_status_atendimento($1, 'resolvido')`, [r1.atendimento_id])
  await expectError('não envia em atendimento resolvido', `select preparar_envio_whatsapp($1, 'oi')`, [r1.atendimento_id])
  expectEq('linha do tempo registrada', (await q(`select tipo, autor_id is null automatico from atendimento_eventos where atendimento_id = $1 order by criado_em`, [r1.atendimento_id])).map((e) => `${e.tipo}${e.automatico ? '*' : ''}`),
    ['aberto*', 'assumido', 'status', 'status*', 'transferido', 'nota', 'resolvido'])

  // Cliente volta depois de resolvido
  await db.exec(`reset role; set role service_role;`)
  const volta = await reg(msg(JU))
  expectEq('depois de resolvido, novo atendimento na fila', { novo: volta.atendimento_id !== r1.atendimento_id, aberto: volta.atendimento_aberto, contato: volta.contato_id === r1.contato_id }, { novo: true, aberto: true, contato: true })
  expectEq('novo atendimento #2 sem responsável', await atend(volta.atendimento_id).then((a) => ({ numero: a.numero, status: a.status, resp: a.responsavel_id })), { numero: 2, status: 'fila', resp: null })
  expectEq('histórico do contato inteiro continua disponível', Number((await um(`select count(*) n from whatsapp_mensagens where contato_id = $1`, [r1.contato_id])).n), 7)
  expectEq('lead não é duplicado', Number((await um(`select count(*) n from leads where whatsapp = '5531987001122'`)).n), 1)
  const antiga = await reg(msg(JU, { enviada_em: new Date(base - 2 * 86400000).toISOString() }))
  expectEq('mensagem antiga (sincronização) só entra no histórico', { atendimento: antiga.atendimento_id, aberto: antiga.atendimento_aberto }, { atendimento: null, aberto: false })
  expectEq('…e não mexe nas não lidas', (await atend(volta.atendimento_id)).nao_lidas, 1)

  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
  await expectError('reabrir com outro atendimento aberto', `select alterar_status_atendimento($1, 'em_atendimento')`, [r1.atendimento_id])
  await db.exec(`reset role; set role service_role;`)
  const lid = await reg(msg('99887766554433@lid', { whatsapp: null }))
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
  expectEq('contato sem número (@lid) entra, mas sem lead', await um(`select whatsapp, lead_id from whatsapp_contatos where id = $1`, [lid.contato_id]), { whatsapp: null, lead_id: null })
  await expectError('salvar como lead sem número', `select salvar_lead_whatsapp($1)`, [lid.contato_id])
  expectEq('membro vê a caixa de entrada', Number((await um(`select count(*) n from vw_atendimentos where status <> 'resolvido'`)).n), 2)
  await db.exec(`reset role;`)

  // Envio de mídia (arquivo já no bucket, em <contato>/envios/)
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
  await expectError('mídia de outra conversa é recusada', `select preparar_envio_whatsapp($1, null, $2::jsonb)`,
    [volta.atendimento_id, JSON.stringify({ tipo: 'imagem', path: `${lid.contato_id}/envios/x.jpg`, mime: 'image/jpeg' })])
  await expectError('tipo de mídia desconhecido é recusado', `select preparar_envio_whatsapp($1, null, $2::jsonb)`,
    [volta.atendimento_id, JSON.stringify({ tipo: 'figurinha', path: `${r1.contato_id}/envios/x.webp` })])
  const foto2 = await um(`select preparar_envio_whatsapp($1, 'segue o cardápio', $2::jsonb) r`,
    [volta.atendimento_id, JSON.stringify({ tipo: 'imagem', path: `${r1.contato_id}/envios/print.png`, mime: 'image/png' })])
  expectEq('foto enviada pelo CRM já nasce com a mídia pronta', await um(`select tipo, texto, midia_status, midia_mime, status, direcao from whatsapp_mensagens where id = $1`, [foto2.r.mensagem_id]),
    { tipo: 'imagem', texto: 'segue o cardápio', midia_status: 'pronta', midia_mime: 'image/png', status: 'enviando', direcao: 'saida' })
  const voz = await um(`select preparar_envio_whatsapp($1, null, $2::jsonb) r`,
    [volta.atendimento_id, JSON.stringify({ tipo: 'audio', path: `${r1.contato_id}/envios/voz.webm`, mime: 'audio/webm', segundos: 7 })])
  expectEq('mensagem de voz: sem nome de arquivo, com duração', await um(`select midia_nome, midia_segundos from whatsapp_mensagens where id = $1`, [voz.r.mensagem_id]),
    { midia_nome: null, midia_segundos: 7 })
  expectEq('prévia da última mensagem (voz)', (await atend(volta.atendimento_id)).ultima_mensagem_previa, '🎤 Áudio')
  expectEq('"assumido" fica antes da mensagem na linha do tempo', Boolean((await um(`select
    (select criado_em from atendimento_eventos where atendimento_id = $1 and tipo = 'assumido') <= (select min(enviada_em) from whatsapp_mensagens where atendimento_id = $1 and direcao = 'saida') ok`, [volta.atendimento_id])).ok), true)

  // Etiquetas
  expectEq('etiquetas iniciais', (await q(`select nome, cor from etiquetas_atendimento order by nome`)).map((e) => `${e.nome}:${e.cor}`),
    ['Aguardando entrega:amarelo', 'Produto quebrado:vermelho', 'Verificando com a transportadora:azul'])
  const troca = await um(`insert into etiquetas_atendimento (nome, cor) values ('  Troca   de produto ', 'roxo') returning id, nome, criado_por`)
  expectEq('etiqueta nova: nome normalizado e autor', { nome: troca.nome, autor: troca.criado_por === uid }, { nome: 'Troca de produto', autor: true })
  await expectError('etiqueta com nome repetido (outra grafia)', `insert into etiquetas_atendimento (nome) values ('PRODUTO QUEBRADO')`)
  await expectError('etiqueta com cor fora da paleta', `insert into etiquetas_atendimento (nome, cor) values ('Outra', 'dourado')`)
  const quebrado = (await um(`select id from etiquetas_atendimento where nome = 'Produto quebrado'`)).id
  await q(`select marcar_etiqueta_atendimento($1, $2, true)`, [volta.atendimento_id, quebrado])
  await q(`select marcar_etiqueta_atendimento($1, $2, true)`, [volta.atendimento_id, quebrado])
  await q(`select marcar_etiqueta_atendimento($1, $2, true)`, [volta.atendimento_id, troca.id])
  const etiquetasDe = async (id) => (await um(`select etiquetas from vw_atendimentos where id = $1`, [id])).etiquetas.map((e) => `${e.nome}:${e.cor}`)
  expectEq('caixa de entrada mostra as etiquetas na ordem em que entraram', await etiquetasDe(volta.atendimento_id), ['Produto quebrado:vermelho', 'Troca de produto:roxo'])
  expectEq('atendimento sem etiqueta vem com lista vazia', await etiquetasDe(lid.atendimento_id), [])
  expectEq('busca encontra o atendimento pela etiqueta', (await q(`select id from vw_atendimentos where busca like '%quebrado%'`)).map((a) => a.id === volta.atendimento_id), [true])
  await q(`select marcar_etiqueta_atendimento($1, $2, false)`, [volta.atendimento_id, troca.id])
  await q(`select marcar_etiqueta_atendimento($1, $2, false)`, [volta.atendimento_id, troca.id])
  expectEq('linha do tempo registra quem colocou e tirou (sem repetir)', (await q(`select tipo, texto, autor_id = $2 eu from atendimento_eventos
    where atendimento_id = $1 and tipo like 'etiqueta%' order by criado_em`, [volta.atendimento_id, uid])).map((e) => `${e.tipo}:${e.texto}:${e.eu}`),
    ['etiqueta_adicionada:Produto quebrado:true', 'etiqueta_adicionada:Troca de produto:true', 'etiqueta_removida:Troca de produto:true'])
  await q(`delete from etiquetas_atendimento where id = $1`, [quebrado])
  expectEq('excluir a etiqueta tira ela de todos os atendimentos', await etiquetasDe(volta.atendimento_id), [])
  await expectError('etiqueta excluída não pode ser colocada', `select marcar_etiqueta_atendimento($1, $2, true)`, [volta.atendimento_id, quebrado])
  await db.exec(`reset role;`)

  const intruso = (await q(`insert into auth.users (email) values ('intruso@prometheus.beer') returning id`))[0].id
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${intruso}', false);`)
  expectEq('inativo não vê atendimentos nem mensagens', await um(`select (select count(*)::int from vw_atendimentos) a, (select count(*)::int from whatsapp_mensagens) m`), { a: 0, m: 0 })
  await expectError('inativo não envia mensagem', `select preparar_envio_whatsapp($1, 'oi')`, [volta.atendimento_id])
  expectEq('inativo não vê etiquetas', (await um(`select count(*)::int n from etiquetas_atendimento`)).n, 0)
  await expectError('inativo não coloca etiqueta', `select marcar_etiqueta_atendimento($1, $2, true)`, [volta.atendimento_id, troca.id])
  await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);`)
  await expectError('anon não registra mensagem', `select registrar_mensagem_whatsapp('{}'::jsonb)`)
  await expectError('anon não lê atendimentos', `select * from vw_atendimentos`)
  await expectError('anon não lê etiquetas', `select * from etiquetas_atendimento`)
  await db.exec(`reset role;`)
}

await db.exec(`set role service_role;`)
show('service_role identifica cliente', (await q(`select identificar_cliente_pre_venda('11987654321') r`))[0].r)
await db.exec(`reset role;`)

if (falhas > 0) {
  console.error(`\n✗ ${falhas} verificação(ões) falharam`)
  process.exit(1)
}
console.log('\n✓ Banco OK — migrations, seed, regras de negócio e RLS verificados')
