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

// RLS ---------------------------------------------------------------------------
const uid = (await q(`insert into auth.users (email, raw_user_meta_data) values ('ana@prometheus.beer', '{"nome":"Ana Ribeiro"}') returning id`))[0].id
const uid2 = (await q(`insert into auth.users (email) values ('joao@prometheus.beer') returning id`))[0].id
show('perfis', await q(`select nome, email, papel from perfis order by criado_em`))

await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
show('autenticado (membro) vê clientes', (await q(`select count(*) from clientes`))[0])
show('autenticado cria pedido manual', (await q(`select numero, total, criado_por is not null as tem_autor from criar_pedido((select id from clientes where nome='Bruno Ferreira'), $1::jsonb, null, 'loja')`, [JSON.stringify([{ produto_id: itens[0].produto_id, quantidade: 1 }])]))[0])
await expectError('autenticado não chama função do link público', `select identificar_cliente_pre_venda('11987654321')`)
await db.exec(`reset role;`)

await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid2}', false);`)
show('autenticado inativo (novo usuário) vê clientes (0)', (await q(`select count(*) from clientes`))[0])
await db.exec(`reset role; update perfis set ativo = true where id = '${uid2}'; set role authenticated; select set_config('request.jwt.claim.sub', '${uid2}', false);`)
await q(`update perfis set nome = 'João Silva' where id = $1`, [uid2])
await expectError('equipe tenta virar admin', `update perfis set papel = 'admin' where id = $1`, [uid2])
await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false);`)
await q(`update perfis set cargo = 'Atendimento' where id = $1`, [uid2])
await db.exec(`reset role;`)
show('perfil do João', (await q(`select nome, cargo, papel, ativo from perfis where id = $1`, [uid2]))[0])

await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`)
await expectError('anon lê clientes', `select * from clientes`)
await expectError('anon chama função', `select identificar_cliente_pre_venda('11987654321')`)
await db.exec(`reset role;`)

await db.exec(`set role service_role;`)
show('service_role identifica cliente', (await q(`select identificar_cliente_pre_venda('11987654321') r`))[0].r)
await db.exec(`reset role;`)

if (falhas > 0) {
  console.error(`\n✗ ${falhas} verificação(ões) falharam`)
  process.exit(1)
}
console.log('\n✓ Banco OK — migrations, seed, regras de negócio e RLS verificados')
