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
create schema vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text, secret text not null);
create view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
  returns uuid language sql as $$ insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id $$;
create function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null)
  returns void language sql as $$ update vault.secrets set secret = coalesce(new_secret, secret) where id = secret_id $$;
-- pg_cron não existe no PGlite: as rotinas agendadas só são registradas.
create schema cron;
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$ select 1::bigint $$;
`
await db.exec(stub)

const files = readdirSync(join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql')).sort()
for (const f of files) {
  try {
    const sql = readFileSync(join(ROOT, 'migrations', f), 'utf8').replace(/create extension if not exists pg_cron[^;]*;/gi, '')
    await db.exec(sql)
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
expectEq('lista e pasta contam quem está sem WhatsApp e com e-mail', await um(`select (select sem_whatsapp_com_email from leads_listas where id = $1) lista, (select sem_whatsapp_com_email from vw_leads_pastas where id = $2) pasta`, [lista.id, pasta.id]), { lista: 1, pasta: 1 })
await expectError('não exclui pasta com listas', `delete from leads_pastas where id = $1`, [pasta.id])
await expectError('lista com nome repetido na mesma pasta', `insert into leads_listas (pasta_id, nome) values ($1, 'grupo vip')`, [pasta.id])
await expectError('lote acima de 5.000 é recusado', `select importar_leads($1, (select jsonb_agg(jsonb_build_object('linha', g)) from generate_series(1, 5001) g))`, [lista.id])
const listaTemp = await um(`insert into leads_listas (pasta_id, nome) values ($1, 'Temporária') returning id`, [pasta.id])
await q(`select importar_leads($1, '[{"linha":1,"nome":"x","whatsapp":"11911112222"}]'::jsonb)`, [listaTemp.id])
await q(`delete from leads_listas where id = $1`, [listaTemp.id])
expectEq('excluir lista apaga os leads dela', Number((await um(`select count(*) n from leads where lista_id = $1`, [listaTemp.id])).n), 0)
expectEq('pasta guarda WhatsApp sem repetir', await um(`select whatsapp_unicos, whatsapp_validos from leads_pastas where id = $1`, [pasta.id]), { whatsapp_unicos: 2, whatsapp_validos: 1 })
const pasta2 = await um(`insert into leads_pastas (nome) values ('Outra pasta') returning id`)
const lista2 = await um(`insert into leads_listas (pasta_id, nome) values ($1, 'Repetidos') returning id`, [pasta2.id])
await q(`select importar_leads($1, '[{"linha":1,"whatsapp":"11987654321"},{"linha":2,"whatsapp":"21999998888"}]'::jsonb)`, [lista2.id])
await q(`select concluir_importacao_leads($1)`, [lista2.id])
expectEq('banco conta o número repetido em duas pastas uma vez só', await um(`select whatsapp_unicos, ddds from leads_resumo`), { whatsapp_unicos: 3, ddds: { 11: 1, 21: 1 } })
await q(`update leads_listas set pasta_id = $1 where id = $2`, [pasta.id, lista2.id])
expectEq('mover lista recalcula as duas pastas', await q(`select whatsapp_unicos, whatsapp_validos from leads_pastas where id in ($1, $2) order by nome`, [pasta.id, pasta2.id]),
  [{ whatsapp_unicos: 3, whatsapp_validos: 2 }, { whatsapp_unicos: 0, whatsapp_validos: 0 }])
await q(`delete from leads_listas where id = $1`, [lista2.id])
expectEq('excluir lista recalcula a pasta e o banco', await um(`select p.whatsapp_unicos, r.whatsapp_unicos as banco from leads_pastas p, leads_resumo r where p.id = $1`, [pasta.id]), { whatsapp_unicos: 2, banco: 2 })
await q(`delete from leads_pastas where id = $1`, [pasta2.id])

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
await q(`select excluir_pedido($1)`, [vendaTeste.id])
expectEq('admin exclui a venda (sai do faturamento)', Number((await um(`select count(*) n from pedidos where id = $1`, [vendaTeste.id])).n), 0)
expectEq('linha do tempo do cliente registra a exclusão', (await um(`select descricao from atividades where cliente_id = $1 and tipo = 'pedido_excluido'`, [vendaTeste.cliente_id]))?.descricao?.startsWith(`Pedido #${vendaTeste.numero} excluído`), true)
await db.exec(`reset role;`)
const vendaFica = await um(`select id from registrar_pedido_pre_venda($1, $2::jsonb, $3::jsonb, true)`, [slugExcluir,
  JSON.stringify({ whatsapp: '11955550009', cep: '01310-100', logradouro: 'Rua A', numero: '1', bairro: 'B', cidade: 'São Paulo', uf: 'SP' }),
  JSON.stringify([{ produto_id: itens[0].produto_id, quantidade: 2 }])])
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
// Desde 2026-11-19 excluir a pré-venda NÃO apaga os pedidos (histórico do cliente para sempre).
expectEq('admin exclui a pré-venda e os pedidos ficam no histórico', (await um(`select excluir_pre_venda($1) n`, [pvExcluir.id])).n, 1)
expectEq('a pré-venda some e o pedido fica', await um(`select (select count(*)::int from pre_vendas where id = $1) pv, (select count(*)::int from pedidos where id = $2) pe`, [pvExcluir.id, vendaFica.id]), { pv: 0, pe: 1 })
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
expectEq('importação do membro atualiza o resumo do banco', (await um(`select whatsapp_unicos from leads_resumo`)).whatsapp_unicos, 3)
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

// Campanhas no WhatsApp oficial ---------------------------------------------------
{
  const comoAdmin = `reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`
  await db.exec(`reset role; update perfis set ativo = true, papel = 'admin', trocar_senha = false where id = '${uid}';`)
  await db.exec(comoAdmin)
  expectEq('sem conexão o WhatsApp oficial não está configurado', (await um(`select status_whatsapp_oficial() s`)).s.configurado, false)
  await expectError('a primeira conexão exige o token', `select salvar_whatsapp_oficial('1', '2', '3', '', 'segredo')`)
  await q(`select salvar_whatsapp_oficial('111', '222', '333', ' token-123 ', 'segredo')`)
  const conexao = (await um(`select status_whatsapp_oficial() s`)).s
  expectEq('conexão salva; o admin vê a senha do webhook', [conexao.configurado, conexao.tem_app_secret, conexao.token_verificacao?.length], [true, true, 64])
  expectEq('status traz o preço por mensagem (nulo até a 1ª medição)', [conexao.preco_marketing, conexao.preco_moeda, 'preco_marketing_dia' in conexao], [null, null, true])
  await expectError('a equipe não lê as credenciais', `select * from credenciais_whatsapp_oficial()`)
  await expectError('a equipe não lê a tabela da conexão', `select * from whatsapp_oficial`)
  await q(`select salvar_whatsapp_oficial('111', '222', '444', '', '')`)
  await db.exec(`reset role; set role service_role;`)
  expectEq('o servidor lê o token do Vault (vazio mantém o salvo)', await um(`select waba_id, token, app_secret from credenciais_whatsapp_oficial()`),
    { waba_id: '444', token: 'token-123', app_secret: 'segredo' })
  await db.exec(comoAdmin)

  const campanha = await um(`insert into campanhas (nome, texto, origem) values ('Drop', 'Olá, {nome}! Chegou.', 'colar') returning id`)
  expectEq('adiciona só números válidos, sem repetir', (await um(`select adicionar_contatos_campanha($1, $2::jsonb) n`, [campanha.id, JSON.stringify([
    { whatsapp: '(31) 8765-4321', nome: ' Maria   Silva ' }, { whatsapp: '553187654321', nome: 'Repetida' },
    { whatsapp: '123', nome: 'Inválido' }, { whatsapp: '11912345678', nome: null },
  ])])).n, 2)
  expectEq('número canônico (9º dígito) e nome limpo', await q(`select whatsapp, nome from campanha_envios where campanha_id = $1 order by whatsapp`, [campanha.id]),
    [{ whatsapp: '5511912345678', nome: null }, { whatsapp: '5531987654321', nome: 'Maria Silva' }])
  const daLista = await um(`insert into campanhas (nome, texto, origem, lista_id) values ('Da lista', 'Oi, {nome}!', 'leads', $1) returning id`, [lista.id])
  const pagina = (await um(`select adicionar_lista_campanha($1, $2) r`, [daLista.id, lista.id])).r
  expectEq('lista do Banco de Leads entra em páginas (números com WhatsApp)', pagina.inseridos, 2)
  const seguinte = (await um(`select adicionar_lista_campanha($1, $2, $3) r`, [daLista.id, lista.id, pagina.ultimo])).r
  expectEq('a página seguinte vem vazia', [seguinte.inseridos, seguinte.ultimo], [0, null])
  const soDdd = await um(`insert into campanhas (nome, texto, origem, lista_id) values ('Só DDD 11', 'Oi, {nome}!', 'leads', $1) returning id`, [lista.id])
  expectEq('só alguns DDDs: entra só quem é do DDD (o número estrangeiro fica de fora)', [
    (await um(`select adicionar_lista_campanha($1, $2, null, '21') r`, [soDdd.id, lista.id])).r,
    (await um(`select adicionar_lista_campanha($1, $2, null, '11') r`, [soDdd.id, lista.id])).r,
    (await um(`select contatos_lidos from campanhas where id = $1`, [soDdd.id])).contatos_lidos,
  ], [{ lidos: 0, ultimo: null, inseridos: 0 }, { lidos: 1, ultimo: '5511987654321', inseridos: 1 }, 1])
  expectEq('prévia do público com e sem filtro de DDD', [
    (await um(`select publico_listas_campanha(array[$1]::uuid[]) r`, [lista.id])).r,
    (await um(`select publico_listas_campanha(array[$1]::uuid[], array['11']) r`, [lista.id])).r,
    (await um(`select publico_listas_campanha(array[$1]::uuid[], array['21']) r`, [lista.id])).r,
    (await um(`select publico_listas_campanha(array[$1]::uuid[], '{}') r`, [lista.id])).r,
  ], [{ soma: 2, unicos: 2 }, { soma: 1, unicos: 1 }, { soma: 0, unicos: 0 }, { soma: 2, unicos: 2 }])
  await q(`delete from campanhas where id = $1`, [soDdd.id])

  await q(`insert into whatsapp_descadastros (whatsapp, origem) values ('5531987654321', 'botao')`)
  expectEq('confirmar tira quem pediu para não receber', (await um(`select confirmar_campanha($1) r`, [campanha.id])).r, { total: 2, ignorados: 1 })
  await expectError('não aceita contatos depois de confirmar', `select adicionar_contatos_campanha($1, '[{"whatsapp":"11955556666"}]'::jsonb)`, [campanha.id])
  await expectError('não confirma duas vezes', `select confirmar_campanha($1)`, [campanha.id])
  await expectError('a equipe não reserva envios', `select * from reservar_envios_campanha($1, 10)`, [campanha.id])

  await db.exec(`reset role; set role service_role;`)
  expectEq('uma rotina de envio por vez', [(await um(`select travar_campanha($1) t`, [campanha.id])).t, (await um(`select travar_campanha($1) t`, [campanha.id])).t], [true, false])
  const lote = await q(`select * from reservar_envios_campanha($1, 10)`, [campanha.id])
  expectEq('reserva só os pendentes', lote.map((l) => l.whatsapp), ['5511912345678'])
  expectEq('o que foi reservado não sai de novo', (await q(`select * from reservar_envios_campanha($1, 10)`, [campanha.id])).length, 0)
  await q(`update campanha_envios set status = 'enviada', wamid = 'wamid.A', enviada_em = now() where id = $1`, [lote[0].id])
  expectEq('limite diário conta contatos das últimas 24 h', (await um(`select contatos_campanha_24h() n`)).n, 1)
  await q(`select atualizar_status_envios_campanha($1::jsonb)`, [JSON.stringify([
    { wamid: 'wamid.A', status: 'read', quando: '2026-10-07T12:02:00Z' },
    { wamid: 'wamid.A', status: 'delivered', quando: '2026-10-07T12:01:00Z' },
    { wamid: 'wamid.inexistente', status: 'delivered', quando: '2026-10-07T12:01:00Z' },
  ])])
  await q(`select atualizar_status_envios_campanha($1::jsonb)`, [JSON.stringify([{ wamid: 'wamid.A', status: 'delivered', quando: '2026-10-07T12:05:00Z' }])])
  expectEq('status em lote somados e nunca voltam (lida continua lida)', await um(`select status, entregue_em = '2026-10-07T12:01:00Z' entregue from campanha_envios where wamid = 'wamid.A'`), { status: 'lida', entregue: true })
  await q(`select registrar_resposta_campanha('5511912345678', 'Não quero receber', now(), true, 'wamid.A')`)
  expectEq('botão "Não quero receber" registra a saída', await um(`select (select saiu_em is not null from campanha_envios where wamid = 'wamid.A') saiu,
    (select origem from whatsapp_descadastros where whatsapp = '5511912345678') origem`), { saiu: true, origem: 'botao' })
  await q(`select registrar_resposta_campanha('5521999998888', 'pare', now(), true)`)
  await q(`select registrar_resposta_campanha('', 'sair', now(), true)`)
  expectEq('resposta sem número (ID da Meta) não cria descadastro vazio', (await um(`select count(*)::int n from whatsapp_descadastros where whatsapp = ''`)).n, 0)
  expectEq('"pare" de quem não está em campanha também descadastra', (await um(`select origem from whatsapp_descadastros where whatsapp = '5521999998888'`)).origem, 'mensagem')
  expectEq('vw_campanhas soma os números', await um(`select total, enviadas, entregues, lidas, respostas, ignoradas, sairam, pendentes from vw_campanhas where id = $1`, [campanha.id]),
    { total: 2, enviadas: 1, entregues: 1, lidas: 1, respostas: 1, ignoradas: 1, sairam: 1, pendentes: 0 })
  await db.exec(`reset role; set role service_role;`)
  await q(`update campanhas set custo_meta = 0.64, custo_meta_em = now() where id = $1`, [campanha.id])
  await db.exec(comoAdmin)
  expectEq('vw_campanhas traz o custo informado pela Meta', Number((await um(`select custo_meta from vw_campanhas where id = $1`, [campanha.id])).custo_meta), 0.64)

  // Fila: descadastro depois da confirmação, espera entre tentativas e reserva interrompida.
  await db.exec(comoAdmin)
  const fila = await um(`insert into campanhas (nome, texto, origem) values ('Fila', 'Oi, {nome}!', 'colar') returning id`)
  await q(`select adicionar_contatos_campanha($1, '[{"whatsapp":"11955550001"},{"whatsapp":"11955550002"},{"whatsapp":"11955550003"}]'::jsonb)`, [fila.id])
  await q(`select confirmar_campanha($1)`, [fila.id])
  await db.exec(`reset role; set role service_role;`)
  await q(`insert into whatsapp_descadastros (whatsapp, origem) values ('5511955550001', 'mensagem')`)
  await q(`update campanha_envios set proxima_tentativa_em = now() + interval '1 hour' where whatsapp = '5511955550002'`)
  expectEq('reserva pula quem saiu depois da confirmação e quem está esperando nova tentativa',
    (await q(`select * from reservar_envios_campanha($1, 10)`, [fila.id])).map((l) => l.whatsapp), ['5511955550003'])
  expectEq('quem saiu depois da confirmação fica de fora', (await um(`select status from campanha_envios where whatsapp = '5511955550001'`)).status, 'ignorada')
  await q(`update campanha_envios set proxima_tentativa_em = now() - interval '1 minute' where whatsapp = '5511955550002'`)
  await q(`update campanha_envios set reservado_em = now() - interval '11 minutes' where whatsapp = '5511955550003'`)
  expectEq('passada a espera, o contato volta à fila', (await q(`select * from reservar_envios_campanha($1, 10)`, [fila.id])).map((l) => l.whatsapp), ['5511955550002'])
  expectEq('reserva interrompida não é reenviada (pode ter saído)', (await um(`select status from campanha_envios where whatsapp = '5511955550003'`)).status, 'falhou')

  await db.exec(comoAdmin)
  await q(`select desconectar_whatsapp_oficial()`)
  expectEq('desconectar apaga o token', (await um(`select status_whatsapp_oficial() s`)).s.configurado, false)
  await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);`)
  await expectError('anon não lê campanhas', `select * from vw_campanhas`)
  await expectError('anon não vê a conexão', `select status_whatsapp_oficial()`)
  await db.exec(`reset role;`)
}

// Tarefas internas ----------------------------------------------------------------
{
  // Os testes do Atendimento já geraram avisos de WhatsApp; aqui só contam os das tarefas.
  await db.exec(`reset role; update perfis set ativo = true, trocar_senha = false where id in ('${uid}', '${uid2}'); delete from notificacoes where atendimento_id is not null;`)
  const como = (id) => `reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`
  const avisos = async () => (await q(`select tipo from notificacoes order by criado_em, tipo`)).map((n) => n.tipo)

  await db.exec(como(uid))
  await expectError('tarefa sem responsável é recusada', `select criar_tarefa('{"titulo":"Sem dono"}'::jsonb, '{}'::uuid[])`)
  await expectError('tarefa sem título é recusada', `select criar_tarefa('{"titulo":"   "}'::jsonb, array[$1]::uuid[])`, [uid])
  const t = (await um(`select criar_tarefa($1::jsonb, array[$2, $3, $3]::uuid[]) r`, [
    JSON.stringify({ titulo: '  Comprar   lúpulo ', descricao: ' ', prioridade: 'alta', prazo: '2026-10-20T18:00:00-03:00' }), uid, uid2,
  ])).r
  expectEq('tarefa criada com título limpo e quem criou', await um(`select titulo, descricao, status, prioridade, criado_por = $2 minha from tarefas where id = $1`, [t.id, uid]),
    { titulo: 'Comprar lúpulo', descricao: null, status: 'a_fazer', prioridade: 'alta', minha: true })
  expectEq('quadro traz os responsáveis (sem repetir)', (await um(`select cardinality(responsaveis_ids) n, atrasada from vw_tarefas where id = $1`, [t.id])), { n: 2, atrasada: false })
  expectEq('quem criou não recebe aviso da própria ação', await avisos(), [])

  await db.exec(como(uid2))
  expectEq('responsável marcado recebe o aviso no login', await um(`select tipo, titulo, autor_id = $1 da_ana from notificacoes`, [uid]),
    { tipo: 'tarefa_atribuida', titulo: `Ana Ribeiro marcou você na tarefa #${t.numero}`, da_ana: true })
  await q(`update tarefas set status = 'fazendo' where id = $1`, [t.id])
  await q(`update tarefas set impedimento = '  Fornecedor sem estoque ' where id = $1`, [t.id])
  expectEq('impedimento guarda motivo, quem e quando', await um(`select impedimento, impedida_por = $2 meu, impedida_em is not null quando from tarefas where id = $1`, [t.id, uid2]),
    { impedimento: 'Fornecedor sem estoque', meu: true, quando: true })
  await q(`insert into tarefa_eventos (tarefa_id, tipo, texto) values ($1, 'comentario', 'Liguei para o fornecedor')`, [t.id])
  await expectError('equipe não grava registro automático na mão', `insert into tarefa_eventos (tarefa_id, tipo) values ($1, 'status')`, [t.id])
  await expectError('comentário não sai em nome de outro', `insert into tarefa_eventos (tarefa_id, tipo, texto, autor_id) values ($1, 'comentario', 'Fui eu', $2)`, [t.id, uid])
  await expectError('membro não cria aviso para outro', `insert into notificacoes (perfil_id, tipo, titulo) values ($1, 'tarefa_comentario', 'x')`, [uid])
  expectEq('membro não vê os avisos dos outros', (await um(`select count(*)::int n from notificacoes where perfil_id <> $1`, [uid2])).n, 0)
  await q(`update notificacoes set lida_em = now()`)
  expectEq('membro marca os avisos como lidos', (await um(`select count(*)::int n from notificacoes where lida_em is null`)).n, 0)
  await expectError('aviso não pode ser reescrito', `update notificacoes set titulo = 'outro'`)
  await q(`delete from tarefas where id = $1`, [t.id])
  expectEq('só quem criou (ou admin) exclui a tarefa', (await um(`select count(*)::int n from tarefas where id = $1`, [t.id])).n, 1)

  await db.exec(como(uid))
  expectEq('quem criou é avisado do impedimento e do comentário', (await avisos()).sort(), ['tarefa_comentario', 'tarefa_impedida'])
  await q(`update tarefas set impedimento = null where id = $1`, [t.id])
  await q(`update tarefas set prazo = '2026-10-22T09:30:00-03:00' where id = $1`, [t.id])
  await expectError('anexo fora da pasta da tarefa', `insert into tarefa_anexos (tarefa_id, path, nome, mime, tamanho) values ($1, 'outra/print.png', 'print.png', 'image/png', 10)`, [t.id])
  await expectError('anexo só aceita imagem', `insert into tarefa_anexos (tarefa_id, path, nome, mime, tamanho) values ($1, $2, 'a.pdf', 'application/pdf', 10)`, [t.id, `${t.id}/a.pdf`])
  await q(`insert into tarefa_anexos (tarefa_id, path, nome, mime, tamanho) values ($1, $2, 'print.png', 'image/png', 2048)`, [t.id, `${t.id}/print.png`])
  await q(`update tarefas set impedimento = 'Esperando o frete' where id = $1`, [t.id])
  await q(`update tarefas set status = 'concluida' where id = $1`, [t.id])
  expectEq('concluir marca a data e tira o impedimento', await um(`select concluida_em is not null concluida, impedimento, impedida_em from tarefas where id = $1`, [t.id]),
    { concluida: true, impedimento: null, impedida_em: null })
  await q(`delete from tarefa_responsaveis where tarefa_id = $1 and perfil_id = $2`, [t.id, uid2])
  expectEq('histórico registra cada mudança, na ordem', (await q(`select tipo from tarefa_eventos where tarefa_id = $1 order by criado_em`, [t.id])).map((e) => e.tipo), [
    'criada', 'responsavel_adicionado', 'responsavel_adicionado', 'status', 'impedimento', 'comentario',
    'impedimento_resolvido', 'prazo', 'anexo_adicionado', 'impedimento', 'status', 'responsavel_removido',
  ])
  expectEq('resolver guarda o motivo antigo', (await um(`select dados->>'motivo' m from tarefa_eventos where tarefa_id = $1 and tipo = 'impedimento_resolvido'`, [t.id])).m, 'Fornecedor sem estoque')
  expectEq('vw_tarefas conta anexos e comentários', await um(`select anexos, comentarios, cardinality(responsaveis_ids) resp from vw_tarefas where id = $1`, [t.id]), { anexos: 1, comentarios: 1, resp: 1 })

  await db.exec(`reset role;`)
  expectEq('responsável é avisado de impedimento resolvido, prazo e conclusão',
    (await q(`select tipo, texto from notificacoes where perfil_id = $1 and lida_em is null order by criado_em`, [uid2])).map((n) => `${n.tipo}${n.texto ? `: ${n.texto}` : ''}`),
    ['tarefa_desimpedida', 'tarefa_prazo: Novo prazo: 22/10/2026 às 09:30', 'tarefa_impedida: Esperando o frete', 'tarefa_concluida'])
  const fantasma = (await q(`insert into auth.users (email) values ('fantasma@prometheus.beer') returning id`))[0].id
  await db.exec(como(uid))
  await expectError('membro sem acesso não vira responsável', `insert into tarefa_responsaveis (tarefa_id, perfil_id) values ($1, $2)`, [t.id, fantasma])
  await db.exec(`reset role; update perfis set participa_tarefas = false where id = '${uid2}';`)
  await db.exec(como(uid))
  await expectError('quem não participa do quadro não vira responsável', `insert into tarefa_responsaveis (tarefa_id, perfil_id) values ($1, $2)`, [t.id, uid2])
  await expectError('nem na criação da tarefa', `select criar_tarefa('{"titulo":"x"}'::jsonb, array[$1]::uuid[])`, [uid2])
  await db.exec(como(uid2))
  expectEq('fora do quadro continua vendo as tarefas', (await um(`select count(*)::int n from vw_tarefas where id = $1`, [t.id])).n, 1)
  await db.exec(`reset role; update perfis set participa_tarefas = true where id = '${uid2}';`)
  await db.exec(como(uid))
  await db.exec(como(fantasma))
  expectEq('inativo não vê tarefas', (await um(`select count(*)::int n from vw_tarefas`)).n, 0)
  await expectError('inativo não cria tarefa', `select criar_tarefa('{"titulo":"x"}'::jsonb, array[$1]::uuid[])`, [fantasma])
  await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);`)
  await expectError('anon não lê tarefas', `select * from vw_tarefas`)
  await expectError('anon não lê avisos', `select * from notificacoes`)
  await db.exec(como(uid))
  await q(`delete from tarefas where id = $1`, [t.id])
  await db.exec(`reset role;`)
  expectEq('excluir a tarefa leva histórico, anexos e avisos junto', await um(`select
    (select count(*)::int from tarefa_eventos where tarefa_id = $1) e, (select count(*)::int from tarefa_anexos where tarefa_id = $1) a,
    (select count(*)::int from notificacoes where tarefa_id = $1) n`, [t.id]), { e: 0, a: 0, n: 0 })
}

// Frase do dia ---------------------------------------------------------------------
{
  const como = (id) => `reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`
  await db.exec(como(uid))
  await q(`insert into frase_do_dia_vistas (perfil_id, dia, ip) values ($1, '2026-10-22', '200.1.1.1')`, [uid])
  await expectError('mesmo login, IP e dia não registra duas vezes', `insert into frase_do_dia_vistas (perfil_id, dia, ip) values ($1, '2026-10-22', '200.1.1.1')`, [uid])
  await q(`insert into frase_do_dia_vistas (perfil_id, dia, ip) values ($1, '2026-10-22', '189.2.2.2')`, [uid])
  await expectError('membro não registra em nome de outro', `insert into frase_do_dia_vistas (perfil_id, dia, ip) values ($1, '2026-10-22', '200.1.1.1')`, [uid2])
  await db.exec(como(uid2))
  expectEq('membro não vê o que os outros viram', (await um(`select count(*)::int n from frase_do_dia_vistas`)).n, 0)
  await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);`)
  await expectError('anon não lê a frase do dia', `select * from frase_do_dia_vistas`)
  await db.exec(`reset role;`)
}

// Atendimento WhatsApp: rodízio da fila e avisos de mensagem -------------------------
{
  const como = (id) => `reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`
  const novoMembro = async (email, nome) =>
    (await um(`insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('nome', $2::text)) returning id`, [email, nome])).id
  const [a, b, c] = [
    await novoMembro('a.rodizio@prometheus.beer', 'Atendente A'),
    await novoMembro('b.rodizio@prometheus.beer', 'Atendente B'),
    await novoMembro('c.rodizio@prometheus.beer', 'Atendente C'),
  ]
  await q(`update perfis set ativo = true where id = any ($1::uuid[])`, [[a, b, c]])
  await q(`update perfis set whatsapp = '553199998888' where id = $1`, [a])
  expectEq('WhatsApp da equipe fica canônico (com o 9)', (await um(`select whatsapp from perfis where id = $1`, [a])).whatsapp, '5531999998888')
  await q(`update configuracoes set whatsapp_leads_automatico = false, whatsapp_rodizio = true, whatsapp_rodizio_participantes = $1::uuid[]`, [[a, b, c]])

  let seq = 0
  const mensagem = async (numero, { direcao = 'entrada', texto = 'Oi, tem IPA?', enviada_em = new Date().toISOString(), papel = 'service_role' } = {}) => {
    seq++
    await db.exec(papel === 'service_role' ? `reset role; set role service_role;` : como(papel))
    const r = await um(`select registrar_mensagem_whatsapp($1::jsonb) r`, [JSON.stringify({
      wa_id: `teste:${seq}`, chatid: `55119000000${numero}@s.whatsapp.net`, whatsapp: `55119000000${numero}`,
      nome_whatsapp: `Cliente ${numero}`, direcao, tipo: 'texto', texto, enviada_em,
    })])
    await db.exec(`reset role;`)
    return r.r
  }
  const responsavel = async (atendimentoId) => (await um(`select responsavel_id, status from atendimentos where id = $1`, [atendimentoId]))

  const r1 = await mensagem('01')
  const r2 = await mensagem('02')
  const r3 = await mensagem('03')
  const r4 = await mensagem('04')
  expectEq('rodízio distribui A → B → C → A', [
    (await responsavel(r1.atendimento_id)).responsavel_id, (await responsavel(r2.atendimento_id)).responsavel_id,
    (await responsavel(r3.atendimento_id)).responsavel_id, (await responsavel(r4.atendimento_id)).responsavel_id,
  ], [a, b, c, a])
  expectEq('atendimento do rodízio já entra em atendimento', (await responsavel(r1.atendimento_id)).status, 'em_atendimento')
  expectEq('linha do tempo registra o rodízio', await um(`select autor_id, para_id, texto from atendimento_eventos where atendimento_id = $1 and tipo = 'transferido'`, [r1.atendimento_id]),
    { autor_id: null, para_id: a, texto: 'rodizio' })

  const aviso = await um(`select tipo, titulo, texto, quantidade, lida_em from notificacoes where perfil_id = $1 and atendimento_id = $2`, [a, r1.atendimento_id])
  expectEq('aviso no sino de quem recebeu', { tipo: aviso.tipo, titulo: aviso.titulo, quantidade: aviso.quantidade },
    { tipo: 'whatsapp_mensagem', titulo: 'Novo cliente para você: Cliente 01', quantidade: 1 })
  expectEq('aviso traz a hora da mensagem', /^Mensagem às \d\d:\d\d · Oi, tem IPA\?$/.test(aviso.texto), true)
  expectEq('só o responsável é avisado', (await um(`select count(*)::int n from notificacoes where atendimento_id = $1`, [r1.atendimento_id])).n, 1)

  await mensagem('01', { texto: 'Pode ser a de 500 ml' })
  expectEq('mensagens seguidas agrupam no mesmo aviso', await um(`select count(*)::int n, max(quantidade) q, max(texto) like '%500 ml' ultima from notificacoes where atendimento_id = $1`, [r1.atendimento_id]),
    { n: 1, q: 2, ultima: true })
  expectEq('n8n recebe um evento por conversa com mensagem nova', await um(`select count(*)::int n, max(payload #>> '{responsavel,nome}') resp, max(payload #>> '{atendimento,motivo}') motivo
    from eventos_integracao where tipo = 'whatsapp.mensagem_recebida' and entidade_id = $1`, [r1.atendimento_id]), { n: 1, resp: 'Atendente A', motivo: 'rodizio' })
  expectEq('evento leva o WhatsApp pessoal do responsável', (await um(`select payload #>> '{responsavel,whatsapp}' w from eventos_integracao where tipo = 'whatsapp.mensagem_recebida' and entidade_id = $1`, [r1.atendimento_id])).w, '5531999998888')

  await mensagem('01', { direcao: 'saida', texto: 'Tem sim!' })
  expectEq('resposta da equipe marca o aviso como lido', (await um(`select lida_em is not null lido from notificacoes where atendimento_id = $1`, [r1.atendimento_id])).lido, true)
  await mensagem('01', { texto: 'Obrigado' })
  expectEq('mensagem depois da resposta abre aviso novo', (await um(`select count(*)::int n from notificacoes where atendimento_id = $1 and lida_em is null`, [r1.atendimento_id])).n, 1)

  await mensagem('02', { texto: 'mensagem antiga', enviada_em: new Date(Date.now() - 3600_000).toISOString() })
  expectEq('mensagem antiga (histórico) não avisa', (await um(`select max(quantidade) q from notificacoes where atendimento_id = $1`, [r2.atendimento_id])).q, 1)

  // Cliente que volta: vai para quem atendeu, sem gastar a vez dessa pessoa.
  await q(`update atendimentos set status = 'resolvido' where id = $1`, [r1.atendimento_id])
  const volta = await mensagem('01', { texto: 'Voltei!' })
  expectEq('cliente que volta vai para quem atendeu', (await responsavel(volta.atendimento_id)).responsavel_id, a)
  expectEq('retorno avisa com o título certo', (await um(`select titulo from notificacoes where atendimento_id = $1`, [volta.atendimento_id])).titulo, 'Cliente 01 voltou a chamar você')
  const r5 = await mensagem('05')
  expectEq('retorno não conta como a vez (próximo é B)', (await responsavel(r5.atendimento_id)).responsavel_id, b)

  // Pausa: quem sai da lista é pulado; quem atendeu antes e saiu da lista não recebe o retorno.
  await q(`update configuracoes set whatsapp_rodizio_participantes = $1::uuid[]`, [[a, c]])
  const r6 = await mensagem('06')
  expectEq('quem saiu do rodízio é pulado', (await responsavel(r6.atendimento_id)).responsavel_id, c)
  await q(`update atendimentos set status = 'resolvido' where id = $1`, [r5.atendimento_id])
  const volta5 = await mensagem('05', { texto: 'Oi de novo' })
  expectEq('retorno de quem saiu do rodízio segue a vez', (await responsavel(volta5.atendimento_id)).responsavel_id, a)
  await q(`update perfis set ativo = false where id = $1`, [c])
  const r7 = await mensagem('07')
  expectEq('membro sem acesso é pulado', (await responsavel(r7.atendimento_id)).responsavel_id, a)
  await q(`update perfis set ativo = true where id = $1`, [c])

  // Sincronização pela tela (usuário logado) também distribui.
  const r8 = await mensagem('08', { papel: a })
  expectEq('mensagem trazida pela sincronização entra no rodízio', (await responsavel(r8.atendimento_id)).responsavel_id, c)
  await db.exec(como(a))
  await expectError('membro não chama a função do rodízio', `select distribuir_atendimento()`)
  await db.exec(`reset role;`)

  // Transferência manual: aviso para quem recebeu e evento para o n8n.
  await db.exec(como(a))
  await q(`select transferir_atendimento($1, $2)`, [r4.atendimento_id, b])
  await db.exec(`reset role;`)
  expectEq('transferência avisa quem recebeu', await um(`select tipo, titulo, autor_id from notificacoes where perfil_id = $1 and atendimento_id = $2 and tipo = 'atendimento_transferido'`, [b, r4.atendimento_id]),
    { tipo: 'atendimento_transferido', titulo: 'Atendente A transferiu Cliente 04 para você', autor_id: a })
  expectEq('transferência vira evento atendimento.transferido', (await um(`select payload #>> '{responsavel,nome}' n from eventos_integracao where tipo = 'atendimento.transferido' and entidade_id = $1`, [r4.atendimento_id])).n, 'Atendente B')

  // Rodízio desligado: fila como antes, todos os participantes avisados.
  await q(`update configuracoes set whatsapp_rodizio = false, whatsapp_rodizio_participantes = $1::uuid[]`, [[a, b, c]])
  const r9 = await mensagem('09')
  expectEq('rodízio desligado deixa na fila', await responsavel(r9.atendimento_id), { responsavel_id: null, status: 'fila' })
  expectEq('fila avisa todos os participantes', await um(`select count(*)::int n, max(titulo) t from notificacoes where atendimento_id = $1`, [r9.atendimento_id]),
    { n: 3, t: 'Cliente 09 está esperando na fila' })

  await db.exec(como(b))
  expectEq('cada um vê só os próprios avisos', (await um(`select count(*)::int n from notificacoes where atendimento_id = $1`, [r9.atendimento_id])).n, 1)
  await db.exec(`reset role;`)
}

await db.exec(`set role service_role;`)
show('service_role identifica cliente', (await q(`select identificar_cliente_pre_venda('11987654321') r`))[0].r)
await db.exec(`reset role;`)

// -----------------------------------------------------------------------------
// PIX pelo Mercado Pago: cobrança, baixa automática, frete a cotar e estorno
// -----------------------------------------------------------------------------
{
  const como = (id) => `reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`
  await db.exec(`reset role; update perfis set ativo = true, papel = 'admin' where id = '${uid}';`)

  // Conexão: só admin salva; o token vai para o Vault e só a service role lê.
  await db.exec(`reset role; update perfis set papel = 'equipe', ativo = true where id = '${uid2}';`)
  await db.exec(como(uid2))
  await expectError('equipe não conecta o Mercado Pago', `select salvar_conexao_mercado_pago('APP_USR-x', '{"id":"1"}'::jsonb, null)`)
  await expectError('equipe não lê as credenciais', `select * from credenciais_mercado_pago()`)
  await expectError('equipe não gera PIX direto', `select preparar_cobranca_pix(gen_random_uuid())`)
  await db.exec(como(uid))
  expectEq('Mercado Pago começa desconectado', (await um(`select status_mercado_pago() s`)).s.conectado, false)
  await q(`select salvar_conexao_mercado_pago('APP_USR-123', '{"id":"987","nome":"CERVEJALENTA","email":"loja@x.com"}'::jsonb, 'assinatura')`)
  const st = (await um(`select status_mercado_pago() s`)).s
  expectEq('admin conecta o Mercado Pago', { c: st.conectado, n: st.conta_nome, a: st.assinatura_webhook }, { c: true, n: 'CERVEJALENTA', a: true })
  await db.exec(`reset role; set role service_role;`)
  expectEq('servidor lê o token do Vault', await um(`select access_token, segredo_webhook from credenciais_mercado_pago()`), { access_token: 'APP_USR-123', segredo_webhook: 'assinatura' })
  await db.exec(`reset role;`)

  const itensPix = await q(`select produto_id from vw_pre_venda_itens where pre_venda_id = (select id from pre_vendas where slug='drop-outubro') order by ordem`)
  const novoPedido = async (whatsapp) => um(`select * from registrar_pedido_pre_venda('drop-outubro', $1::jsonb, $2::jsonb, true)`, [
    JSON.stringify({ whatsapp, nome: 'Cliente Pix', cep: '13010-000', logradouro: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Campinas', uf: 'SP' }),
    JSON.stringify([{ produto_id: itensPix[2].produto_id, quantidade: 1 }]),
  ])
  const ped = await novoPedido('(11) 95555-7001')
  const sub = Number(ped.subtotal)

  await db.exec(`set role service_role;`)
  const p1 = (await um(`select preparar_cobranca_pix($1) r`, [ped.id])).r
  expectEq('frete a cotar: 1º PIX cobra só as cervejas', { s: p1.situacao, v: Number(p1.cobranca.valor) }, { s: 'criar', v: sub })
  const p2 = (await um(`select preparar_cobranca_pix($1) r`, [ped.id])).r
  expectEq('dois cliques não criam dois PIX', p2.cobranca.id, p1.cobranca.id)
  await q(`select concluir_cobranca_pix($1, $2::jsonb)`, [p1.cobranca.id, JSON.stringify({ mp_pagamento_id: '111', copia_e_cola: '000201...', qr_code_base64: 'iVBOR', link_mp: 'https://mp' })])
  const p3 = (await um(`select preparar_cobranca_pix($1) r`, [ped.id])).r
  expectEq('PIX válido é reaproveitado', { s: p3.situacao, id: p3.cobranca.id, cc: p3.cobranca.copia_e_cola }, { s: 'pendente', id: p1.cobranca.id, cc: '000201...' })

  const r1 = (await um(`select registrar_status_pix(null, '111', 'approved', $1, now(), 'accredited') r`, [sub])).r
  expectEq('PIX das cervejas pago, mas pedido espera o frete', { s: r1.status, q: r1.quitou }, { s: 'pago', q: false })
  await q(`select registrar_status_pix($1, '111', 'approved', $2, now(), 'accredited')`, [p1.cobranca.id, sub])
  expectEq('aviso repetido não duplica a linha do tempo', (await um(`select count(*)::int n from atividades where pedido_id = $1 and tipo = 'pix_recebido'`, [ped.id])).n, 1)
  expectEq('admin recebe o aviso de PIX no sino', (await um(`select count(*)::int n, max(titulo) t from notificacoes where pedido_id = $1 and tipo = 'pix_recebido'`, [ped.id])),
    { n: 1, t: `PIX recebido · #PRM-${ped.numero}` })
  expectEq('nada a cobrar até cotar o frete', (await um(`select preparar_cobranca_pix($1) r`, [ped.id])).r.situacao, 'aguardando_frete')
  await db.exec(`reset role;`)

  await q(`select cotar_frete_pedido($1, 20)`, [ped.id])
  await db.exec(`set role service_role;`)
  const p4 = (await um(`select preparar_cobranca_pix($1) r`, [ped.id])).r
  expectEq('depois da cotação, o PIX cobra só o frete', { s: p4.situacao, v: Number(p4.cobranca.valor), novo: p4.cobranca.id !== p1.cobranca.id }, { s: 'criar', v: 20, novo: true })
  await q(`select concluir_cobranca_pix($1, $2::jsonb)`, [p4.cobranca.id, JSON.stringify({ mp_pagamento_id: '222', copia_e_cola: 'x' })])
  const r2 = (await um(`select registrar_status_pix(null, '222', 'approved', 20, now(), null) r`)).r
  expectEq('frete pago dá baixa no pedido', r2.quitou, true)
  await q(`select registrar_status_pix(null, '222', 'pending', null, null, null)`)
  expectEq('aviso fora de ordem não desfaz o pagamento', (await um(`select status from cobrancas_pix where mp_pagamento_id = '222'`)).status, 'pago')
  await db.exec(`reset role;`)
  expectEq('pedido pago pelo Mercado Pago', await um(`select status_pagamento, forma_pagamento, pago_em is not null tem from pedidos where id = $1`, [ped.id]),
    { status_pagamento: 'pago', forma_pagamento: 'PIX · Mercado Pago', tem: true })
  expectEq('baixa vira evento pedido.pago (n8n)', (await um(`select count(*)::int n from eventos_integracao where tipo = 'pedido.pago' and entidade_id = $1`, [ped.id])).n, 1)

  await db.exec(`set role service_role;`)
  expectEq('pedido pago não gera PIX', (await um(`select preparar_cobranca_pix($1) r`, [ped.id])).r.situacao, 'pago')
  await q(`select registrar_status_pix(null, '111', 'refunded', null, null, null)`)
  await db.exec(`reset role;`)
  expectEq('estorno marca o pedido como estornado', (await um(`select status_pagamento from pedidos where id = $1`, [ped.id])).status_pagamento, 'estornado')

  // Frete cotado em R$ 0 depois do PIX das cervejas: a baixa sai sozinha.
  const ped2 = await novoPedido('(11) 95555-7002')
  await db.exec(`set role service_role;`)
  const c2 = (await um(`select preparar_cobranca_pix($1) r`, [ped2.id])).r.cobranca
  await q(`select concluir_cobranca_pix($1, '{"mp_pagamento_id":"333"}'::jsonb)`, [c2.id])
  await q(`select registrar_status_pix(null, '333', 'approved', $1, now(), null)`, [Number(ped2.subtotal)])
  await db.exec(`reset role;`)
  await q(`select cotar_frete_pedido($1, 0)`, [ped2.id])
  expectEq('frete grátis depois do PIX quita o pedido', (await um(`select status_pagamento from pedidos where id = $1`, [ped2.id])).status_pagamento, 'pago')

  await db.exec(`set role service_role;`)
  expectEq('pagamento de outra origem é ignorado', (await um(`select registrar_status_pix(null, '999', 'approved', 10, now(), null) r`)).r, null)
  await db.exec(`reset role;`)

  // ---------------------------------------------------------------------------
  // Caixa VIP: compras de várias pré-vendas entram no mesmo pedido, com um frete só
  // ---------------------------------------------------------------------------
  const produtos = await q(`select id from produtos order by criado_em limit 2`)
  const pv2 = await um(`insert into pre_vendas (titulo, slug, canal, previsao_entrega) values ('Drop Dezembro', 'drop-dezembro', 'grupo_vip', '2026-12-20') returning id`)
  await q(`insert into pre_venda_itens (pre_venda_id, produto_id, preco, limite_por_cliente, quantidade_disponivel) values ($1, $2, 30, 3, 5), ($1, $3, 20, null, null)`,
    [pv2.id, produtos[0].id, produtos[1].id])
  await q(`select substituir_ceps_frete_vip('[["04500000","04599999"]]'::jsonb)`)
  const enderecoVip = { cep: '04567-890', logradouro: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP' }
  const comprar = async (slug, whatsapp, itensCompra, cliente = enderecoVip, atualizar = true) =>
    um(`select * from registrar_pedido_pre_venda($1, $2::jsonb, $3::jsonb, $4)`, [slug,
      JSON.stringify({ whatsapp, nome: 'Carla Caixa', email: 'carla@x.com', ...cliente }), JSON.stringify(itensCompra), atualizar])
  const ipaOutubro = itensPix[2].produto_id

  await db.exec(`set role service_role;`)
  const cx1 = await comprar('drop-outubro', '(11) 95555-8001', [{ produto_id: ipaOutubro, quantidade: 1 }])
  expectEq('1ª compra abre a Caixa VIP com frete VIP', { caixa: cx1.caixa, frete: cx1.frete, taxa: Number(cx1.taxa_entrega) }, { caixa: 'aberta', frete: 'vip', taxa: 15 })
  const achou = (await um(`select caixa_do_whatsapp('11955558001') r`)).r
  expectEq('WhatsApp encontra a caixa aberta', { cliente: achou.cliente, numero: achou.caixa?.numero, nome: achou.caixa?.cliente?.primeiro_nome, email: achou.caixa?.cliente?.tem_email },
    { cliente: true, numero: cx1.numero, nome: 'Carla', email: true })

  // 2ª compra, OUTRA pré-venda, de outro aparelho (sem endereço): entra na mesma caixa.
  const cx2 = await comprar('drop-dezembro', '11955558001', [{ produto_id: produtos[0].id, quantidade: 2 }], {}, false)
  expectEq('compra em outra pré-venda entra na mesma caixa', cx2.id, cx1.id)
  expectEq('caixa soma os itens com um frete só', { subtotal: Number(cx2.subtotal), taxa: Number(cx2.taxa_entrega), total: Number(cx2.total) },
    { subtotal: Number(cx1.subtotal) + 60, taxa: 15, total: Number(cx1.subtotal) + 60 + 15 })
  expectEq('cada item guarda a pré-venda de origem', (await q(`select pv.slug, sum(i.quantidade)::int q from pedido_itens i join pre_vendas pv on pv.id = i.pre_venda_id where i.pedido_id = $1 group by 1 order by 1`, [cx1.id])),
    [{ slug: 'drop-dezembro', q: 2 }, { slug: 'drop-outubro', q: 1 }])
  await comprar('drop-dezembro', '11955558001', [{ produto_id: produtos[0].id, quantidade: 1 }], {}, false)
  expectEq('mesmo item de novo soma na mesma linha', (await um(`select count(*)::int linhas, sum(quantidade)::int q from pedido_itens where pedido_id = $1 and pre_venda_id = $2`, [cx1.id, pv2.id])), { linhas: 1, q: 3 })
  await expectError('limite por cliente vale na caixa inteira', `select registrar_pedido_pre_venda('drop-dezembro', '{"whatsapp":"11955558001"}'::jsonb, $1::jsonb)`,
    [JSON.stringify([{ produto_id: produtos[0].id, quantidade: 1 }])])
  const caixaPub = (await um(`select caixa_publica($1) r`, [cx1.id])).r
  expectEq('caixa pública: itens por pré-venda, previsão de envio e saldo',
    { itens: caixaPub.itens.length, envio: caixaPub.previsao_envio, devido: Number(caixaPub.devido), unidades: Number(caixaPub.unidades) },
    { itens: 2, envio: '2026-12-20', devido: Number(caixaPub.total), unidades: 4 })
  expectEq('linha do tempo registra os itens somados', (await um(`select count(*)::int n from atividades where pedido_id = $1 and tipo = 'caixa_itens_adicionados'`, [cx1.id])).n, 2)
  expectEq('itens somados viram evento para o n8n', (await um(`select count(*)::int n from eventos_integracao where tipo = 'pedido.itens_adicionados' and entidade_id = $1`, [cx1.id])).n, 2)
  await db.exec(`reset role;`)

  // Estoque da pré-venda contado pelos itens (outra cliente esgota o que sobrou).
  expectEq('estoque conta itens dentro de caixas', (await um(`select vendido, restante from vw_pre_venda_itens where pre_venda_id = $1 and produto_id = $2`, [pv2.id, produtos[0].id])), { vendido: 3, restante: 2 })
  await db.exec(`set role service_role;`)
  await expectError('estoque esgotado barra a compra', `select registrar_pedido_pre_venda('drop-dezembro', $1::jsonb, $2::jsonb, true)`,
    [JSON.stringify({ whatsapp: '11955558002', nome: 'Davi', ...enderecoVip }), JSON.stringify([{ produto_id: produtos[0].id, quantidade: 3 }])])
  await db.exec(`reset role;`)
  expectEq('números da pré-venda contam só os itens dela', (await um(`select pedidos, unidades, total_vendido from vw_pre_vendas where id = $1`, [pv2.id])),
    { pedidos: 1, unidades: 3, total_vendido: '90.00' })

  // Cliente fecha a caixa para pagar; PIX paga; nova compra reabre e cobra só a diferença.
  await db.exec(`set role service_role;`)
  await q(`select fechar_caixa($1)`, [cx1.id])
  expectEq('cliente fecha a caixa para pagar', (await um(`select caixa, caixa_fechada_em is not null f from pedidos where id = $1`, [cx1.id])), { caixa: 'fechada', f: true })
  const pcx = (await um(`select preparar_cobranca_pix($1) r`, [cx1.id])).r
  await q(`select concluir_cobranca_pix($1, '{"mp_pagamento_id":"ORDCAIXA1"}'::jsonb)`, [pcx.cobranca.id])
  await q(`select registrar_status_pix(null, 'ORDCAIXA1', 'approved', $1, now(), null)`, [Number(pcx.cobranca.valor)])
  expectEq('PIX quita a caixa inteira', (await um(`select status_pagamento, caixa from pedidos where id = $1`, [cx1.id])), { status_pagamento: 'pago', caixa: 'fechada' })
  const cx3 = await comprar('drop-dezembro', '11955558001', [{ produto_id: produtos[1].id, quantidade: 2 }], {}, false)
  expectEq('caixa paga e não enviada recebe a compra nova', { id: cx3.id, caixa: cx3.caixa, pag: cx3.status_pagamento, taxa: Number(cx3.taxa_entrega) }, { id: cx1.id, caixa: 'aberta', pag: 'pendente', taxa: 15 })
  const pc2x = (await um(`select preparar_cobranca_pix($1) r`, [cx1.id])).r
  expectEq('PIX cobra só a diferença (sem frete novo)', Number(pc2x.cobranca.valor), 40)

  // Caixa separada: a próxima compra abre outra caixa.
  await db.exec(`reset role;`)
  await q(`update pedidos set status = 'separado' where id = $1`, [cx1.id])
  expectEq('caixa separada fecha sozinha', (await um(`select caixa from pedidos where id = $1`, [cx1.id])).caixa, 'fechada')
  await db.exec(`set role service_role;`)
  const cx4 = await comprar('drop-outubro', '11955558001', [{ produto_id: ipaOutubro, quantidade: 1 }], {}, false)
  expectEq('depois de separada, a próxima compra abre outra caixa', { nova: cx4.id !== cx1.id, caixa: cx4.caixa, taxa: Number(cx4.taxa_entrega) }, { nova: true, caixa: 'aberta', taxa: 15 })
  await db.exec(`reset role;`)
  await expectError('só uma caixa aberta por cliente', `update pedidos set status = 'novo', caixa = 'aberta' where id = $1`, [cx1.id])

  // Excluir uma pré-venda tira só os itens dela da caixa.
  const pv3 = await um(`insert into pre_vendas (titulo, slug, canal) values ('Drop Teste', 'drop-teste', 'grupo_vip') returning id`)
  await q(`insert into pre_venda_itens (pre_venda_id, produto_id, preco) values ($1, $2, 10)`, [pv3.id, produtos[1].id])
  await db.exec(`set role service_role;`)
  await comprar('drop-teste', '11955558001', [{ produto_id: produtos[1].id, quantidade: 1 }], {}, false)
  await db.exec(`reset role;`)
  await db.exec(como(uid))
  const excluidos = (await um(`select excluir_pre_venda($1, true) n`, [pv3.id])).n
  await db.exec(`reset role;`)
  expectEq('excluir pré-venda mantém a caixa com os outros itens', { excluidos, existe: (await um(`select count(*)::int n from pedido_itens where pedido_id = $1`, [cx4.id])).n },
    { excluidos: 0, existe: 1 })

  await db.exec(como(uid2))
  expectEq('equipe vê as cobranças PIX', (await um(`select count(*)::int n from cobrancas_pix where pedido_id = $1`, [ped.id])).n, 2)
  await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);`)
  await expectError('visitante não vê as cobranças', `select count(*) from cobrancas_pix`)
  await db.exec(`reset role;`)
}

// -----------------------------------------------------------------------------
// Estoque da Olist: a pré-venda vende o que tem lá; cada compra baixa, cancelamento devolve
// -----------------------------------------------------------------------------
{
  const como = (id) => `reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`
  const um = async (sql, params) => (await q(sql, params))[0]
  const lata = await um(`insert into produtos (nome, preco, olist_id) values ('Lata Olist', 20, 9001) returning id`)
  const kit = await um(`insert into produtos (nome, preco, olist_id, olist_kit) values ('Kit Olist', 50, 9100, '[{"id":9001,"quantidade":2},{"id":9002,"quantidade":1}]') returning id`)
  await q(`insert into estoque_olist (id, nome, disponivel, lido_em) values (9001, 'Lata', 5, now()), (9002, 'Garrafa', 10, now())`)
  const pvo = await um(`insert into pre_vendas (titulo, slug, canal) values ('Drop Olist', 'drop-olist', 'grupo_vip') returning id`)
  await q(`insert into pre_venda_itens (pre_venda_id, produto_id, preco) values ($1, $2, 20), ($1, $3, 50)`, [pvo.id, lata.id, kit.id])
  const restantes = async () => Object.fromEntries((await q(`select nome, restante from vw_pre_venda_itens where pre_venda_id = $1 order by nome`, [pvo.id])).map((r) => [r.nome, r.restante]))
  const efetivo = async (id) => Number((await um(`select estoque_olist_efetivo($1) n`, [id])).n)
  const endereco = { cep: '04567-890', logradouro: 'Rua B', numero: '2', bairro: 'Centro', cidade: 'São Paulo', uf: 'SP' }
  const comprar = (whatsapp, itensCompra) =>
    um(`select * from registrar_pedido_pre_venda('drop-olist', $1::jsonb, $2::jsonb, true)`, [
      JSON.stringify({ whatsapp, nome: 'Olívia Olist', email: 'olivia@x.com', ...endereco }), JSON.stringify(itensCompra)])

  expectEq('link mostra o estoque da Olist (kit = quantos kits os componentes montam)', await restantes(), { 'Kit Olist': 2, 'Lata Olist': 5 })

  await db.exec(`set role service_role;`)
  const c1 = await comprar('11966660001', [{ produto_id: lata.id, quantidade: 2 }])
  await comprar('11966660001', [{ produto_id: kit.id, quantidade: 1 }])
  await db.exec(`reset role;`)
  expectEq('cada compra vira saída na fila (kit baixa cada componente)',
    await q(`select olist_produto_id::int id, tipo, quantidade, status::text from movimentos_estoque_olist where pedido_id = $1 order by id, quantidade`, [c1.id]),
    [{ id: 9001, tipo: 'S', quantidade: 2, status: 'pendente' }, { id: 9001, tipo: 'S', quantidade: 2, status: 'pendente' }, { id: 9002, tipo: 'S', quantidade: 1, status: 'pendente' }])
  expectEq('o CRM já desconta antes de a Olist confirmar', await restantes(), { 'Kit Olist': 0, 'Lata Olist': 1 })

  await db.exec(`set role service_role;`)
  await expectError('última unidade: não vende o que a Olist não tem', `select registrar_pedido_pre_venda('drop-olist', $1::jsonb, $2::jsonb)`,
    [JSON.stringify({ whatsapp: '11966660002', nome: 'Beto', ...endereco }), JSON.stringify([{ produto_id: lata.id, quantidade: 2 }])])
  const lote = await q(`select id, olist_produto_id::int p from reservar_movimentos_olist(50)`)
  await db.exec(`reset role;`)
  expectEq('servidor reserva a fila para enviar', { n: lote.length, status: (await um(`select count(*)::int n from movimentos_estoque_olist where status = 'enviando'`)).n }, { n: 3, status: 3 })

  // Envio confirmado só da lata; a garrafa voltou para a fila. Depois a leitura da Olist já traz a baixa.
  await q(`update movimentos_estoque_olist set status = 'enviado', enviado_em = now() where olist_produto_id = 9001 and status = 'enviando'`)
  await q(`update movimentos_estoque_olist set status = 'pendente' where status = 'enviando'`)
  expectEq('enviado e ainda não lido continua descontado', await efetivo(9001), 1)
  await q(`update estoque_olist set disponivel = 1, lido_em = now() + interval '1 second' where id = 9001`)
  expectEq('leitura nova da Olist já inclui a baixa (sem descontar duas vezes)', await efetivo(9001), 1)

  // Cancelou: o que chegou à Olist volta (entrada); o que ainda estava na fila é anulado.
  await q(`update pedidos set status = 'cancelado' where id = $1`, [c1.id])
  expectEq('cancelamento devolve o que saiu e anula o que nem foi enviado',
    await q(`select olist_produto_id::int id, tipo, quantidade, status::text, motivo from movimentos_estoque_olist where pedido_id = $1 and (tipo = 'E' or status = 'cancelado') order by id, tipo`, [c1.id]),
    [{ id: 9001, tipo: 'E', quantidade: 2, status: 'pendente', motivo: 'cancelamento' }, { id: 9001, tipo: 'E', quantidade: 2, status: 'pendente', motivo: 'cancelamento' },
      { id: 9002, tipo: 'S', quantidade: 1, status: 'cancelado', motivo: 'venda' }])
  expectEq('estoque volta para o link', { lata: await efetivo(9001), garrafa: await efetivo(9002), link: await restantes() }, { lata: 5, garrafa: 10, link: { 'Kit Olist': 2, 'Lata Olist': 5 } })
  await q(`update pedidos set status = 'novo' where id = $1`, [c1.id])
  expectEq('reabrir baixa de novo', await efetivo(9001), 1)
  await q(`update pedidos set status = 'cancelado' where id = $1`, [c1.id])

  // Caixa sem pagamento vence (prazo padrão 7 dias) e devolve o estoque.
  await db.exec(`set role service_role;`)
  const c2 = await comprar('11966660003', [{ produto_id: lata.id, quantidade: 3 }])
  await db.exec(`reset role;`)
  expectEq('prazo padrão para pagar a caixa é 7 dias', (await um(`select caixa_prazo_pagamento_dias n from configuracoes`)).n, 7)
  await db.exec(`set role service_role;`)
  expectEq('caixa recente não vence', (await um(`select vencer_caixas_vip() n`)).n, 0)
  await db.exec(`reset role;`)
  await q(`update pedidos set criado_em = now() - interval '8 days' where id = $1`, [c2.id])
  await q(`update atividades set criado_em = now() - interval '8 days' where pedido_id = $1`, [c2.id])
  await db.exec(`set role service_role;`)
  expectEq('caixa sem pagamento há 8 dias vence', (await um(`select vencer_caixas_vip() n`)).n, 1)
  await db.exec(`reset role;`)
  expectEq('caixa vencida: cancelada, estoque devolvido, aviso no sino',
    { status: (await um(`select status::text s from pedidos where id = $1`, [c2.id])).s,
      lata: await efetivo(9001),
      motivo: (await um(`select string_agg(distinct motivo, ',') m from movimentos_estoque_olist where pedido_id = $1 and status <> 'cancelado' and tipo = 'E'`, [c2.id])).m,
      aviso: (await um(`select count(*)::int n from notificacoes where tipo = 'caixa_vencida' and pedido_id = $1`, [c2.id])).n > 0 },
    { status: 'cancelado', lata: 5, motivo: null, aviso: true })

  // Excluir o pedido também devolve (aqui a baixa nem tinha sido enviada: é anulada).
  await db.exec(`set role service_role;`)
  const c3 = await comprar('11966660004', [{ produto_id: lata.id, quantidade: 1 }])
  await db.exec(`reset role;`)
  await db.exec(como(uid))
  await q(`select excluir_pedido($1)`, [c3.id])
  await db.exec(`reset role;`)
  expectEq('pedido excluído não deixa baixa na fila', await efetivo(9001), 5)

  // Pedido manual da equipe numa pré-venda também baixa (e respeita o estoque da Olist).
  const cliente = await um(`select id from clientes where whatsapp = '5511966660004'`)
  await db.exec(como(uid2))
  const manual = await um(`select id from criar_pedido($1, $2::jsonb, $3)`, [cliente.id, JSON.stringify([{ produto_id: lata.id, quantidade: 2 }]), pvo.id])
  await expectError('pedido manual além do estoque da Olist', `select criar_pedido($1, $2::jsonb, $3)`, [cliente.id, JSON.stringify([{ produto_id: lata.id, quantidade: 4 }]), pvo.id])
  await db.exec(`reset role;`)
  expectEq('pedido manual da equipe baixa o estoque', { fila: (await um(`select count(*)::int n from movimentos_estoque_olist where pedido_id = $1 and tipo = 'S'`, [manual.id])).n, lata: await efetivo(9001) }, { fila: 1, lata: 3 })

  await db.exec(como(uid2))
  expectEq('equipe vê o estoque da Olist e a fila', (await um(`select (select count(*)::int from estoque_olist) e, (select count(*)::int from movimentos_estoque_olist) m`)).e, 2)
  await expectError('equipe não grava na fila', `insert into movimentos_estoque_olist (olist_produto_id, tipo, quantidade, motivo) values (1, 'S', 1, 'x')`)
  await expectError('equipe não reserva a fila', `select reservar_movimentos_olist(10)`)
  await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);`)
  await expectError('visitante não vê o estoque', `select count(*) from estoque_olist`)
  await db.exec(`reset role;`)
}

// -----------------------------------------------------------------------------
// Lotes e validades: cadastro pelo SKU (só leitura da Olist), lotes e RLS
// -----------------------------------------------------------------------------
{
  const como = (id) => `reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`
  await db.exec(`reset role; update perfis set ativo = true where id in ('${uid}', '${uid2}');`)
  const fila = async () => (await um(`select count(*)::int n from movimentos_estoque_olist`)).n
  const filaAntes = await fila()

  await db.exec(como(uid2))
  const cerveja = await um(`insert into lotes_cervejas (sku, olist_id, nome, estoque_olist, estoque_lido_em) values ('IPA-473', 7001, 'IPA Lata 473 ml', 48, now()) returning id, criado_por`)
  expectEq('equipe cadastra a cerveja no controle de lotes', cerveja.criado_por, uid2)
  await expectError('mesmo SKU não entra duas vezes (maiúsculas ou não)', `insert into lotes_cervejas (sku, olist_id, nome) values ('ipa-473', 7002, 'Outra')`)
  await expectError('mesmo produto da Olist não entra duas vezes', `insert into lotes_cervejas (sku, olist_id, nome) values ('IPA-OUTRO', 7001, 'Outra')`)
  await expectError('SKU com espaço nas pontas é recusado', `insert into lotes_cervejas (sku, olist_id, nome) values (' X ', 7003, 'Outra')`)

  await q(`insert into lotes (cerveja_id, lote, quantidade, validade) values ($1, 'L2411A', 24, current_date + 20), ($1, 'L2409B', 6, current_date - 3)`, [cerveja.id])
  await expectError('lote repetido na mesma cerveja', `insert into lotes (cerveja_id, lote, quantidade, validade) values ($1, 'l2411a', 1, current_date + 90)`, [cerveja.id])
  await expectError('quantidade negativa é recusada', `insert into lotes (cerveja_id, lote, quantidade, validade) values ($1, 'L9999', -1, current_date + 90)`, [cerveja.id])
  expectEq('soma das unidades dos lotes da cerveja', (await um(`select sum(quantidade)::int n from lotes where cerveja_id = $1`, [cerveja.id])).n, 30)
  await expectError('lote sem validade é recusado', `insert into lotes (cerveja_id, lote) values ($1, 'L0001')`, [cerveja.id])
  await q(`update lotes set validade = current_date + 200 where cerveja_id = $1 and lote = 'L2411A'`, [cerveja.id])
  expectEq('equipe edita a validade do lote', (await um(`select (validade - current_date) dias from lotes where cerveja_id = $1 and lote = 'L2411A'`, [cerveja.id])).dias, 200)
  await db.exec(`reset role;`)
  expectEq('lotes e validades não geram lançamento para a Olist', await fila(), filaAntes)

  await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);`)
  await expectError('visitante não vê as cervejas dos lotes', `select count(*) from lotes_cervejas`)
  await expectError('visitante não vê os lotes', `select count(*) from lotes`)
  await db.exec(`reset role; update perfis set ativo = false where id = '${uid2}';`)
  await db.exec(como(uid2))
  expectEq('quem saiu da equipe não vê os lotes', (await um(`select count(*)::int n from lotes`)).n, 0)
  await db.exec(`reset role; update perfis set ativo = true where id = '${uid2}';`)

  // Baixa automática pelo lote que vence primeiro ------------------------------------------
  await db.exec(como(uid2))
  const ipa = await um(`insert into lotes_cervejas (sku, olist_id, nome, estoque_olist, estoque_lido_em) values ('BAIXA-1', 7101, 'Pils Baixa', 30, now()) returning id`)
  await q(`insert into lotes (cerveja_id, lote, quantidade, validade) values ($1, 'NOVO', 10, current_date + 90), ($1, 'VELHO', 20, current_date + 10)`, [ipa.id])
  expectEq('cadastro do lote fica no histórico com o autor',
    await q(`select lote, tipo, quantidade, autor_id = $2 autor from lote_movimentos where cerveja_id = $1 and tipo = 'cadastro' order by lote`, [ipa.id, uid2]),
    [{ lote: 'NOVO', tipo: 'cadastro', quantidade: 10, autor: true }, { lote: 'VELHO', tipo: 'cadastro', quantidade: 20, autor: true }])
  await db.exec(`reset role; set role service_role;`)
  const qtds = async () => Object.fromEntries((await q(`select lote, quantidade from lotes where cerveja_id = $1`, [ipa.id])).map((l) => [l.lote, l.quantidade]))
  await q(`update lotes_cervejas set estoque_olist = 26 where id = $1`, [ipa.id])
  expectEq('estoque caiu 30 → 26: sai do lote que vence primeiro', await qtds(), { NOVO: 10, VELHO: 16 })
  expectEq('a leitura fica no histórico (mudança direta no banco é identificada)',
    await um(`select tipo, quantidade, estoque_antes::int a, estoque_depois::int d, origem, papel, (detalhes->>'soma_dos_lotes_antes')::int soma, (detalhes->>'sem_lote_depois')::int sem_lote
              from lote_movimentos where cerveja_id = $1 and tipo = 'leitura_olist'`, [ipa.id]),
    { tipo: 'leitura_olist', quantidade: -4, a: 30, d: 26, origem: 'alteracao_direta', papel: 'service_role', soma: 30, sem_lote: 0 })
  expectEq('baixa registrada com as duas leituras',
    await um(`select tipo, quantidade, saldo, estoque_antes::int a, estoque_depois::int d from lote_movimentos where cerveja_id = $1 and tipo = 'baixa_olist'`, [ipa.id]),
    { tipo: 'baixa_olist', quantidade: -4, saldo: 16, a: 30, d: 26 })
  await q(`update lotes_cervejas set estoque_olist = 5, estoque_lido_em = now(), estoque_origem = 'rotina' where id = $1`, [ipa.id])
  expectEq('queda maior que o lote: zera o mais velho e continua no seguinte', await qtds(), { NOVO: 5, VELHO: 0 })
  expectEq('leitura da rotina: origem gravada, e as baixas que ela causou levam a mesma origem',
    await q(`select tipo, lote, quantidade, origem from lote_movimentos where cerveja_id = $1 and origem = 'rotina' order by id`, [ipa.id]),
    [{ tipo: 'leitura_olist', lote: null, quantidade: -21, origem: 'rotina' },
      { tipo: 'baixa_olist', lote: 'VELHO', quantidade: -16, origem: 'rotina' },
      { tipo: 'baixa_olist', lote: 'NOVO', quantidade: -5, origem: 'rotina' }])
  await q(`update lotes_cervejas set estoque_lido_em = now(), estoque_origem = 'rotina' where id = $1`, [ipa.id])
  expectEq('leitura sem mudança no estoque não gera linha', (await um(`select count(*)::int n from lote_movimentos where cerveja_id = $1 and tipo = 'leitura_olist'`, [ipa.id])).n, 2)
  await q(`update lotes_cervejas set estoque_olist = 5, nome = 'Pils Baixa' where id = $1`, [ipa.id])
  expectEq('mesma leitura de novo não mexe em nada', (await um(`select count(*)::int n from lote_movimentos where cerveja_id = $1 and tipo = 'baixa_olist'`, [ipa.id])).n, 3)
  await q(`update lotes_cervejas set estoque_olist = -2 where id = $1`, [ipa.id])
  expectEq('estoque negativo na Olist conta como zero', await qtds(), { NOVO: 0, VELHO: 0 })
  await q(`update lotes_cervejas set estoque_olist = 3 where id = $1`, [ipa.id])
  await q(`update lotes_cervejas set estoque_olist = null where id = $1`, [ipa.id])
  expectEq('estoque subiu ou sumiu: o CRM não inventa unidades nos lotes', await qtds(), { NOVO: 0, VELHO: 0 })

  // Entrou mercadoria: fica "sem lote" e avisa a equipe no sino (um aviso por cerveja).
  await q(`update lotes_cervejas set estoque_olist = 0 where id = $1`, [ipa.id])
  await q(`update lotes_cervejas set estoque_olist = 24 where id = $1`, [ipa.id])
  await q(`update lotes_cervejas set estoque_olist = 36 where id = $1`, [ipa.id])
  await db.exec(`reset role;`)
  const avisos = await q(`select perfil_id, quantidade, texto from notificacoes where tipo = 'lote_sem_registro' and lote_cerveja_id = $1 order by perfil_id`, [ipa.id])
  expectEq('entrada de mercadoria fica no histórico com as unidades que ficaram sem lote',
    await um(`select quantidade, (detalhes->>'sem_lote_depois')::int sem_lote from lote_movimentos where cerveja_id = $1 and tipo = 'leitura_olist' order by id desc limit 1`, [ipa.id]),
    { quantidade: 12, sem_lote: 36 })
  expectEq('entrada de mercadoria avisa cada pessoa da equipe uma vez (atualiza o aviso)',
    { pessoas: avisos.length, texto: avisos[0]?.texto, vezes: avisos[0]?.quantidade },
    // Três entradas: −2 → 3, 0 → 24 e 24 → 36 (de null → 0 não conta: não havia leitura anterior).
    { pessoas: (await um(`select count(*)::int n from perfis where ativo`)).n, texto: 'Pils Baixa: 36 un. na Olist ainda sem lote.', vezes: 3 })
  expectEq('lotes continuam como estavam depois da entrada', await qtds(), { NOVO: 0, VELHO: 0 })

  // Lote sem quantidade: a conta para (não dá para saber de qual lote saiu).
  await db.exec(como(uid2))
  await q(`insert into lotes (cerveja_id, lote, quantidade, validade) values ($1, 'SEMQTD', null, current_date + 5)`, [ipa.id])
  await q(`update lotes set quantidade = 30 where cerveja_id = $1 and lote = 'NOVO'`, [ipa.id])
  await db.exec(`reset role; set role service_role;`)
  await q(`update lotes_cervejas set estoque_olist = 20 where id = $1`, [ipa.id])
  expectEq('com lote sem quantidade, nada é baixado', await qtds(), { NOVO: 30, VELHO: 0, SEMQTD: null })
  await db.exec(`reset role;`)
  await db.exec(como(uid2))
  await q(`update lotes set quantidade = 0 where cerveja_id = $1 and lote = 'SEMQTD'`, [ipa.id])
  expectEq('equipe confere de novo depois de salvar (conciliar_lotes)', (await um(`select conciliar_lotes($1) n`, [ipa.id])).n, 0)
  expectEq('…e a soma volta a caber no estoque da Olist', await qtds(), { NOVO: 20, VELHO: 0, SEMQTD: 0 })
  expectEq('ajuste da equipe fica no histórico', (await um(`select tipo, quantidade, saldo from lote_movimentos where cerveja_id = $1 and lote = 'NOVO' and tipo = 'ajuste'`, [ipa.id])), { tipo: 'ajuste', quantidade: 30, saldo: 30 })
  await expectError('equipe não escreve no histórico', `insert into lote_movimentos (cerveja_id, lote, tipo, quantidade) values ($1, 'X', 'ajuste', 1)`, [ipa.id])
  await expectError('equipe não chama a conciliação interna', `select conciliar_lotes_da_cerveja($1)`, [ipa.id])
  // Edição de código/validade, dados vindos da Olist e falhas de leitura.
  await q(`update lotes set validade = validade + 7, lote = 'NOVO-B' where cerveja_id = $1 and lote = 'NOVO'`, [ipa.id])
  expectEq('edição do lote registra o antes e o depois',
    await um(`select tipo, lote, detalhes->'lote' codigo, (detalhes->'validade'->>1)::date - (detalhes->'validade'->>0)::date dias, autor_id = $2 autor, origem, papel
              from lote_movimentos where cerveja_id = $1 and tipo = 'edicao'`, [ipa.id, uid2]),
    { tipo: 'edicao', lote: 'NOVO-B', codigo: ['NOVO', 'NOVO-B'], dias: 7, autor: true, origem: 'manual', papel: 'authenticated' })
  await q(`update lotes_cervejas set nome = 'Pils Baixa 473', estoque_lido_em = now(), estoque_origem = 'botao' where id = $1`, [ipa.id])
  expectEq('nome que mudou na Olist fica no histórico',
    await um(`select detalhes->'nome' nome, origem from lote_movimentos where cerveja_id = $1 and tipo = 'cerveja_atualizada'`, [ipa.id]),
    { nome: ['Pils Baixa', 'Pils Baixa 473'], origem: 'botao' })
  await q(`update lotes_cervejas set leitura_erro = 'A Olist negou o acesso (403)', leitura_erro_em = now(), estoque_origem = 'botao' where id = $1`, [ipa.id])
  await q(`update lotes_cervejas set leitura_erro = 'A Olist negou o acesso (403)', leitura_erro_em = now() + interval '5 minutes' where id = $1`, [ipa.id])
  expectEq('falha de leitura fica no histórico (a mesma falha repetida, uma vez só)',
    await q(`select detalhes->>'erro' erro, origem from lote_movimentos where cerveja_id = $1 and tipo = 'falha_leitura'`, [ipa.id]),
    [{ erro: 'A Olist negou o acesso (403)', origem: 'botao' }])

  await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);`)
  await expectError('visitante não vê o histórico', `select count(*) from lote_movimentos`)
  await expectError('visitante não concilia', `select conciliar_lotes($1)`, [ipa.id])
  await db.exec(`reset role;`)

  await db.exec(como(uid))
  await q(`delete from lotes where cerveja_id = $1 and lote = 'SEMQTD'`, [ipa.id])
  expectEq('exclusão do lote fica no histórico', (await um(`select count(*)::int n from lote_movimentos where cerveja_id = $1 and tipo = 'exclusao'`, [ipa.id])).n, 1)
  const historicoAntes = (await um(`select count(*)::int n from lote_movimentos where olist_id = 7101`)).n
  await q(`delete from lotes_cervejas where id in ($1, $2)`, [cerveja.id, ipa.id])
  await db.exec(`reset role;`)
  expectEq('remover a cerveja apaga os lotes, mas o histórico fica guardado pelo produto da Olist',
    { lotes: (await um(`select count(*)::int n from lotes where cerveja_id in ($1, $2)`, [cerveja.id, ipa.id])).n,
      historico: (await um(`select count(*)::int n from lote_movimentos where olist_id = 7101`)).n,
      soltos: (await um(`select count(*)::int n from lote_movimentos where olist_id = 7101 and cerveja_id is null`)).n },
    { lotes: 0, historico: historicoAntes + 1, soltos: historicoAntes + 1 })
  expectEq('a remoção guarda como estavam os lotes',
    await um(`select autor_id = $1 autor, jsonb_array_length(detalhes->'lotes') lotes, detalhes->'lotes'->0->>'lote' primeiro from lote_movimentos where olist_id = 7101 and tipo = 'cerveja_removida'`, [uid]),
    { autor: true, lotes: 2, primeiro: 'VELHO' })
  await db.exec(como(uid))
  await q(`insert into lotes_cervejas (sku, olist_id, nome, estoque_olist, estoque_lido_em, estoque_origem) values ('BAIXA-1', 7101, 'Pils Baixa', 8, now(), 'cadastro')`)
  await db.exec(`reset role;`)
  expectEq('cadastrar de novo o mesmo produto traz o histórico antigo junto',
    await um(`select count(*)::int n, count(*) filter (where tipo = 'cerveja_cadastrada')::int cadastros from lote_movimentos where olist_id = 7101`),
    { n: historicoAntes + 2, cadastros: 2 })
  await q(`delete from lotes_cervejas where olist_id = 7101`)
  expectEq('o aviso da cerveja removida sai do sino', (await um(`select count(*)::int n from notificacoes where tipo = 'lote_sem_registro'`)).n, 0)
}

// -----------------------------------------------------------------------------
// Privacidade (LGPD): código no WhatsApp do link da pré-venda e anonimização do cliente
// -----------------------------------------------------------------------------
{
  const como = (id) => `reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`
  const servidor = `reset role; set role service_role;`
  const atrasarCodigos = async () => {
    await db.exec(`reset role;`)
    await q(`update link_codigos set criado_em = criado_em - interval '2 minutes'`)
    await db.exec(servidor)
  }

  await db.exec(servidor)
  expectEq('link: emite código', (await um(`select emitir_codigo_link('(11) 98888-7777', 'hashA', 'ip1') r`)).r.ok, true)
  const espera = (await um(`select emitir_codigo_link('11988887777', 'hashB', 'ip1') r`)).r
  expectEq('link: outro código em menos de 45 s espera', [espera.ok, espera.motivo, espera.segundos > 0], [false, 'aguarde', true])
  expectEq('link: código errado', (await um(`select conferir_codigo_link('11988887777', 'errado', 'tok1') r`)).r, { ok: false, motivo: 'errado', restantes: 4 })
  expectEq('link: código certo confirma o aparelho', (await um(`select conferir_codigo_link('11988887777', 'hashA', 'tok1') r`)).r, { ok: true })
  expectEq('link: aparelho devolve o número confirmado', (await um(`select whatsapp_da_sessao_link('tok1') r`)).r, '5511988887777')
  expectEq('link: aparelho desconhecido', (await um(`select whatsapp_da_sessao_link('outro') r`)).r, null)
  expectEq('link: código usado não vale de novo', (await um(`select conferir_codigo_link('11988887777', 'hashA', 'tok2') r`)).r.motivo, 'expirado')
  await atrasarCodigos()
  expectEq('link: novo código depois de 45 s', (await um(`select emitir_codigo_link('11988887777', 'hashC', 'ip1') r`)).r.ok, true)
  for (let i = 0; i < 5; i++) await q(`select conferir_codigo_link('11988887777', 'x', 'tok3')`)
  expectEq('link: 5 erros bloqueiam o código', (await um(`select conferir_codigo_link('11988887777', 'hashC', 'tok3') r`)).r.motivo, 'tentativas')
  await atrasarCodigos()
  expectEq('link: terceiro código na hora', (await um(`select emitir_codigo_link('11988887777', 'hashD', 'ip1') r`)).r.ok, true)
  await atrasarCodigos()
  expectEq('link: no máximo 3 códigos por hora por número', (await um(`select emitir_codigo_link('11988887777', 'hashE', 'ip1') r`)).r.motivo, 'limite')
  const descartado = (await um(`select emitir_codigo_link('11977776666', 'h5', 'ip2') r`)).r
  await q(`select descartar_codigo_link($1)`, [descartado.id])
  expectEq('link: código que não saiu no WhatsApp não conta', (await um(`select emitir_codigo_link('11977776666', 'h6', 'ip2') r`)).r.ok, true)
  for (let i = 0; i < 10; i++) await q(`select emitir_codigo_link($1, 'h', 'ip3')`, [`119555500${String(i).padStart(2, '0')}`])
  expectEq('link: no máximo 10 códigos por hora por IP', (await um(`select emitir_codigo_link('11955558888', 'h', 'ip3') r`)).r.motivo, 'limite')
  await q(`select encerrar_sessao_link('tok1')`)
  expectEq('link: "Não sou eu" esquece o aparelho', (await um(`select whatsapp_da_sessao_link('tok1') r`)).r, null)

  await db.exec(`reset role; set role anon;`)
  await expectError('visitante não lê os códigos', `select * from link_codigos`)
  await expectError('visitante não pede código direto no banco', `select emitir_codigo_link('11988887777', 'h', null)`)
  await db.exec(como(uid))
  await expectError('equipe não lê os aparelhos confirmados', `select * from link_sessoes`)
  await expectError('equipe não confere código', `select conferir_codigo_link('1', '2', '3')`)
  await db.exec(`reset role;`)

  // Anonimizar: cliente com pedido, conversa, lead, campanhas e aparelho confirmado.
  const titular = await um(`insert into clientes (nome, whatsapp, email, cpf, cep, logradouro, numero, bairro, cidade, uf, vip)
    values ('Titular LGPD', '31977001122', 'titular@email.com', '12345678900', '30130010', 'Rua X', '10', 'Centro', 'Belo Horizonte', 'MG', true) returning id, whatsapp`)
  const pedidoTitular = await um(`insert into pedidos (cliente_id, status, observacoes, endereco_entrega)
    values ($1, 'confirmado', 'Interfone 32', '{"cep":"30130010","logradouro":"Rua X","numero":"10","bairro":"Centro","cidade":"Belo Horizonte","uf":"MG"}') returning id`, [titular.id])
  const contato = await um(`insert into whatsapp_contatos (chatid, whatsapp, nome) values ('5531977001122@s.whatsapp.net', '5531977001122', 'Titular') returning id`)
  const atend = await um(`insert into atendimentos (contato_id) values ($1) returning id`, [contato.id])
  await q(`insert into whatsapp_mensagens (contato_id, atendimento_id, wa_id, direcao, tipo, texto, midia_path, enviada_em)
    values ($1, $2, 'lgpd-1', 'entrada', 'imagem', 'foto', $3, now())`, [contato.id, atend.id, `${contato.id}/lgpd-1.jpg`])
  const pastaLgpd = await um(`insert into leads_pastas (nome) values ('Pasta LGPD') returning id`)
  const listaLgpd = await um(`insert into leads_listas (pasta_id, nome, total, com_whatsapp, com_email, ddds)
    values ($1, 'Lista LGPD', 10, 8, 5, '{"31": 3, "11": 5}') returning id`, [pastaLgpd.id])
  await q(`insert into leads (lista_id, linha, nome, whatsapp, email, dados) values ($1, 1, 'Titular', $2, 'titular@email.com', '{}')`, [listaLgpd.id, titular.whatsapp])
  const campEnviada = await um(`insert into campanhas (nome, texto, origem) values ('Campanha LGPD', 'Oi', 'leads') returning id`)
  const campPendente = await um(`insert into campanhas (nome, texto, origem) values ('Campanha LGPD 2', 'Oi', 'leads') returning id`)
  await q(`insert into campanha_envios (campanha_id, whatsapp, nome, status, resposta) values ($1, '5531977001122', 'Titular', 'enviada', 'quero!')`, [campEnviada.id])
  await q(`insert into campanha_envios (campanha_id, whatsapp, nome, status) values ($1, '5531977001122', 'Titular', 'pendente')`, [campPendente.id])
  await q(`insert into link_sessoes (token_hash, whatsapp, expira_em) values ('tok-titular', $1, now() + interval '1 day')`, [titular.whatsapp])

  await db.exec(como(uid))
  await expectError('não anonimiza com pedido em andamento', `select anonimizar_cliente($1)`, [titular.id])
  await db.exec(`reset role;`)
  await q(`update pedidos set status = 'entregue' where id = $1`, [pedidoTitular.id])
  await db.exec(como(uid2))
  await expectError('membro (não admin) não anonimiza', `select anonimizar_cliente($1)`, [titular.id])
  await db.exec(como(uid))
  const anon = (await um(`select anonimizar_cliente($1) r`, [titular.id])).r
  expectEq('anonimizar devolve o resumo e as mídias a apagar', anon, { leads: 1, envios: 2, midias: [`${contato.id}/lgpd-1.jpg`], pedidos: 1, conversas: 1 })
  await expectError('não anonimiza duas vezes', `select anonimizar_cliente($1)`, [titular.id])
  await db.exec(`reset role;`)
  expectEq('cadastro sem dados pessoais (fica cidade/UF)',
    await um(`select nome, whatsapp, email, cpf, cep, logradouro, cidade, uf, vip, anonimizado_em is not null anonimizado from clientes where id = $1`, [titular.id]),
    { nome: 'Cliente anonimizado', whatsapp: null, email: null, cpf: null, cep: null, logradouro: null, cidade: 'Belo Horizonte', uf: 'MG', vip: false, anonimizado: true })
  expectEq('pedido fica no histórico só com cidade/UF',
    await um(`select endereco_entrega, observacoes from pedidos where id = $1`, [pedidoTitular.id]),
    { endereco_entrega: { uf: 'MG', cidade: 'Belo Horizonte' }, observacoes: null })
  expectEq('conversa e mensagens apagadas', await um(`select
    (select count(*)::int from whatsapp_contatos where id = $1) contatos,
    (select count(*)::int from whatsapp_mensagens where wa_id = 'lgpd-1') mensagens`, [contato.id]), { contatos: 0, mensagens: 0 })
  expectEq('lead apagado e contadores da lista acertados',
    await um(`select total, com_whatsapp, com_email, (ddds->>'31')::int d31, (select count(*)::int from leads where lista_id = $1) leads from leads_listas where id = $1`, [listaLgpd.id]),
    { total: 9, com_whatsapp: 7, com_email: 4, d31: 2, leads: 0 })
  expectEq('campanhas: pendente cancelado, enviado vira só estatística', await um(`select
    (select count(*)::int from campanha_envios where whatsapp = '5531977001122') com_numero,
    (select count(*)::int from campanha_envios where campanha_id = $2) pendentes,
    (select nome is null and resposta is null and whatsapp like 'anonimizado-%' from campanha_envios where campanha_id = $1) anonimo`, [campEnviada.id, campPendente.id]),
    { com_numero: 0, pendentes: 0, anonimo: true })
  expectEq('número vai para a lista de descadastro', (await um(`select origem from whatsapp_descadastros where whatsapp = '5531977001122'`))?.origem, 'equipe')
  expectEq('aparelho confirmado do titular esquecido', (await um(`select count(*)::int n from link_sessoes where token_hash = 'tok-titular'`)).n, 0)
  expectEq('linha do tempo registra a anonimização', (await um(`select tipo from atividades where cliente_id = $1 order by criado_em desc limit 1`, [titular.id])).tipo, 'cliente_anonimizado')
}

if (falhas > 0) {
  console.error(`\n✗ ${falhas} verificação(ões) falharam`)
  process.exit(1)
}
console.log('\n✓ Banco OK — migrations, seed, regras de negócio e RLS verificados')
