// =============================================================================
// Teste do BALANÇO DE ESTOQUE dos lotes (banco), SEM Docker e sem tocar em produção:
// aplica todas as migrations + seed num Postgres embutido (PGlite), como o db:test, e
// confere as regras do balanço: registro da contagem, conclusão (lotes iguais à contagem,
// histórico com autor), falhas, permissões e a convivência com a baixa automática.
//   node scripts/testar-balanco.mjs
// =============================================================================
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../supabase/', import.meta.url))
let falhas = 0
const db = new PGlite()

// O mesmo "stub" mínimo do Supabase usado em testar-banco.mjs.
await db.exec(`
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
create schema cron;
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$ select 1::bigint $$;
`)

for (const f of readdirSync(join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  try {
    await db.exec(readFileSync(join(ROOT, 'migrations', f), 'utf8').replace(/create extension if not exists pg_cron[^;]*;/gi, ''))
  } catch (e) {
    console.error('✗ migration', f, '\n', e.message, e.position ? `pos ${e.position}` : '', e.where ?? '')
    process.exit(1)
  }
}
await db.exec(readFileSync(join(ROOT, 'seed.sql'), 'utf8'))
console.log('✓ migrations e seed aplicados')

const q = async (sql, params) => (await db.query(sql, params)).rows
const um = async (sql, params) => (await q(sql, params))[0]
const expectEq = (label, atual, esperado) => {
  const a = JSON.stringify(atual)
  const e = JSON.stringify(esperado)
  if (a === e) console.log(`✓ ${label}`)
  else {
    falhas++
    console.log(`✗ ${label}: esperado ${e}, veio ${a}`)
  }
}
const expectError = async (label, sql, params, trecho) => {
  try {
    await db.query(sql, params)
    falhas++
    console.log(`✗ ${label}: deveria ter falhado`)
  } catch (e) {
    if (trecho && !e.message.includes(trecho)) {
      falhas++
      console.log(`✗ ${label}: falhou por outro motivo — ${e.message}`)
    } else console.log(`✓ ${label}: ${e.message}`)
  }
}

const ana = (await um(`insert into auth.users (email, raw_user_meta_data) values ('ana@prometheus.beer', '{"nome":"Ana Ribeiro"}') returning id`)).id
const joao = (await um(`insert into auth.users (email, raw_user_meta_data) values ('joao@prometheus.beer', '{"nome":"João"}') returning id`)).id
const fora = (await um(`insert into auth.users (email) values ('fora@prometheus.beer') returning id`)).id
await db.exec(`update perfis set ativo = true where id in ('${ana}', '${joao}'); update perfis set ativo = false where id = '${fora}';`)
const como = (id) => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`)
const servidor = () => db.exec(`reset role; set role service_role; select set_config('request.jwt.claim.sub', '', false);`)
const dono = () => db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
const iniciar = (cerveja, contagem) => um(`select iniciar_balanco_dos_lotes($1, $2::jsonb) r`, [cerveja, JSON.stringify(contagem)]).then((l) => l.r)
const lotesDa = (cerveja) => q(`select lote, quantidade from lotes where cerveja_id = $1 order by lote`, [cerveja])
const historico = (cerveja, desde = 0) =>
  q(`select tipo, lote, quantidade, origem, autor_id, estoque_antes::int antes, estoque_depois::int depois from lote_movimentos where cerveja_id = $1 and id > $2 order by id`, [cerveja, desde])
const ultimoId = async () => (await um(`select coalesce(max(id), 0)::int n from lote_movimentos`)).n

// -----------------------------------------------------------------------------
// 1. Balanço que ajusta lotes, cria lote novo e muda o estoque
// -----------------------------------------------------------------------------
await como(ana)
const pils = (await um(`insert into lotes_cervejas (sku, olist_id, nome, estoque_olist, estoque_lido_em) values ('PILS-1', 9101, 'Pils do Balanço', 30, now()) returning id`)).id
await q(`insert into lotes (cerveja_id, lote, quantidade, validade) values ($1, 'A', 10, current_date + 90), ($1, 'B', 20, current_date + 10)`, [pils])
const [loteA, loteB] = await q(`select id from lotes where cerveja_id = $1 order by lote`, [pils])
const avisosAntes = (await um(`select count(*)::int n from notificacoes where tipo = 'lote_sem_registro'`)).n

await como(joao)
let marco = await ultimoId()
const b1 = await iniciar(pils, {
  lotes: [{ id: loteA.id, quantidade: 9 }, { id: loteB.id, quantidade: 18 }],
  novos: [{ lote: 'C', validade: '2030-05-01', quantidade: 6 }],
})
expectEq('registrar a contagem devolve o total (9 + 18 + 6)', { total: b1.total, olist: b1.olist_id }, { total: 33, olist: 9101 })
expectEq(
  'o registro nasce "enviando", com quem contou e como estava',
  await um(`select status, total, soma_antes, estoque_crm_antes::int crm, autor_id, envio_iniciado_em is null sem_envio from lotes_balancos where id = $1`, [b1.id]),
  { status: 'enviando', total: 33, soma_antes: 30, crm: 30, autor_id: joao, sem_envio: true },
)
expectEq('registrar a contagem ainda não mexe nos lotes', await lotesDa(pils), [{ lote: 'A', quantidade: 10 }, { lote: 'B', quantidade: 20 }])
expectEq('nem no histórico', await historico(pils, marco), [])
await expectError('a equipe não conclui o balanço (só o servidor, depois da Olist)', `select concluir_balanco_dos_lotes($1, 30, 33, 555001, 'obs')`, [b1.id], 'permission denied')
await expectError('a equipe não marca falha de balanço', `select falhar_balanco_dos_lotes($1, 'recusado', 'x')`, [b1.id], 'permission denied')
await expectError('a equipe não escreve no registro do balanço', `update lotes_balancos set total = 1 where id = $1`, [b1.id], 'permission denied')
await expectError('segundo balanço da mesma cerveja enquanto o primeiro está em envio', `select iniciar_balanco_dos_lotes($1, $2::jsonb)`, [
  pils,
  JSON.stringify({ lotes: [{ id: loteA.id, quantidade: 9 }, { id: loteB.id, quantidade: 18 }] }),
], 'Já há um balanço')

await servidor()
await q(`select concluir_balanco_dos_lotes($1, 30, 33, 555001, 'BALANÇO PELO CRM #1')`, [b1.id])
await dono()
expectEq('lotes do CRM ficam iguais à contagem', await lotesDa(pils), [{ lote: 'A', quantidade: 9 }, { lote: 'B', quantidade: 18 }, { lote: 'C', quantidade: 6 }])
expectEq(
  'estoque do CRM vira o total contado, com origem "balanco" e releitura pedida',
  await um(`select estoque_olist::int e, estoque_origem o, releitura_pedida_em is not null reler from lotes_cervejas where id = $1`, [pils]),
  { e: 33, o: 'balanco', reler: true },
)
expectEq('histórico: o balanço e cada lote, com o autor da contagem; nenhuma "leitura" nem baixa automática', await historico(pils, marco), [
  { tipo: 'balanco', lote: null, quantidade: 3, origem: 'balanco', autor_id: joao, antes: 30, depois: 33 },
  { tipo: 'ajuste', lote: 'A', quantidade: -1, origem: 'balanco', autor_id: joao, antes: null, depois: 33 },
  { tipo: 'ajuste', lote: 'B', quantidade: -2, origem: 'balanco', autor_id: joao, antes: null, depois: 33 },
  { tipo: 'cadastro', lote: 'C', quantidade: 6, origem: 'balanco', autor_id: joao, antes: null, depois: 33 },
])
expectEq(
  'o evento do balanço guarda o lançamento, a observação e a contagem',
  await um(`select (detalhes->>'id_lancamento')::int l, detalhes->>'observacao' o, jsonb_array_length(detalhes->'lotes') n, (detalhes->>'conferido_na_olist')::int c
            from lote_movimentos where cerveja_id = $1 and tipo = 'balanco'`, [pils]),
  { l: 555001, o: 'BALANÇO PELO CRM #1', n: 3, c: 33 },
)
expectEq(
  'registro concluído com antes, depois e lançamento',
  await um(`select status, estoque_antes::int a, estoque_depois::int d, id_lancamento::int l, concluido_em is not null fim from lotes_balancos where id = $1`, [b1.id]),
  { status: 'concluido', a: 30, d: 33, l: 555001, fim: true },
)
expectEq('lote novo fica em nome de quem contou', (await um(`select criado_por from lotes where cerveja_id = $1 and lote = 'C'`, [pils])).criado_por, joao)
expectEq('balanço que aumenta o estoque não dispara "entrou mercadoria sem lote"', (await um(`select count(*)::int n from notificacoes where tipo = 'lote_sem_registro'`)).n, avisosAntes)
await servidor()
await expectError('balanço concluído não conclui de novo', `select concluir_balanco_dos_lotes($1, 30, 33, 1, 'x')`, [b1.id], 'não está aguardando')

// -----------------------------------------------------------------------------
// 2. Depois do balanço, a baixa automática e os ajustes da equipe seguem como antes
// -----------------------------------------------------------------------------
marco = await ultimoId()
await q(`update lotes_cervejas set estoque_olist = 31, estoque_lido_em = now() + interval '1 second', estoque_origem = 'rotina', releitura_pedida_em = null where id = $1`, [pils])
await dono()
expectEq('venda depois do balanço: leitura + baixa do lote que vence primeiro', await historico(pils, marco), [
  { tipo: 'leitura_olist', lote: null, quantidade: -2, origem: 'rotina', autor_id: null, antes: 33, depois: 31 },
  { tipo: 'baixa_olist', lote: 'B', quantidade: -2, origem: 'rotina', autor_id: null, antes: 33, depois: 31 },
])
await como(ana)
marco = await ultimoId()
await q(`update lotes set quantidade = 8 where id = $1`, [loteA.id])
await dono()
expectEq('ajuste da equipe fora do balanço continua "manual", em nome de quem fez', await historico(pils, marco), [
  { tipo: 'ajuste', lote: 'A', quantidade: -1, origem: 'manual', autor_id: ana, antes: null, depois: 31 },
])

// -----------------------------------------------------------------------------
// 3. Balanço zerando o estoque e balanço sem mudança
// -----------------------------------------------------------------------------
const lotesPils = await q(`select id, lote, quantidade from lotes where cerveja_id = $1 order by lote`, [pils])
await como(ana)
const b2 = await iniciar(pils, { lotes: lotesPils.map((l) => ({ id: l.id, quantidade: 0 })) })
expectEq('balanço pode zerar tudo', b2.total, 0)
await servidor()
marco = await ultimoId()
await q(`select concluir_balanco_dos_lotes($1, 31, 0, 555002, 'zerar')`, [b2.id])
await dono()
expectEq('lotes zerados (ficam como esgotados)', await lotesDa(pils), [{ lote: 'A', quantidade: 0 }, { lote: 'B', quantidade: 0 }, { lote: 'C', quantidade: 0 }])
expectEq('estoque do CRM em zero', (await um(`select estoque_olist::int e from lotes_cervejas where id = $1`, [pils])).e, 0)
expectEq('histórico do balanço que zerou', (await historico(pils, marco)).map((m) => `${m.tipo}:${m.lote ?? ''}:${m.quantidade}:${m.origem}`), [
  'balanco::-31:balanco', 'ajuste:A:-8:balanco', 'ajuste:B:-16:balanco', 'ajuste:C:-6:balanco',
])
await como(joao)
const b3 = await iniciar(pils, { lotes: lotesPils.map((l) => ({ id: l.id, quantidade: 0 })) })
await servidor()
marco = await ultimoId()
await q(`select concluir_balanco_dos_lotes($1, 0, 0, 555003, 'igual')`, [b3.id])
await dono()
expectEq('balanço sem mudança registra só o evento do balanço', (await historico(pils, marco)).map((m) => `${m.tipo}:${m.quantidade}`), ['balanco:0'])

// -----------------------------------------------------------------------------
// 4. Contagem inválida não é registrada
// -----------------------------------------------------------------------------
await como(ana)
const todos = lotesPils.map((l) => ({ id: l.id, quantidade: 1 }))
const erroDe = (label, contagem, trecho) => expectError(label, `select iniciar_balanco_dos_lotes($1, $2::jsonb)`, [pils, JSON.stringify(contagem)], trecho)
await erroDe('faltou contar um lote', { lotes: todos.slice(1) }, 'lotes desta cerveja mudaram')
await erroDe('lote contado duas vezes', { lotes: [...todos, todos[0]] }, 'lotes desta cerveja mudaram')
await erroDe('lote de outra cerveja ou inexistente', { lotes: [...todos.slice(1), { id: '00000000-0000-4000-8000-000000000000', quantidade: 1 }] }, 'lotes desta cerveja mudaram')
await erroDe('quantidade negativa', { lotes: [{ ...todos[0], quantidade: -1 }, ...todos.slice(1)] }, 'Informe a quantidade contada')
await erroDe('quantidade que não é número', { lotes: [{ ...todos[0], quantidade: 'abc' }, ...todos.slice(1)] }, 'Informe a quantidade contada')
await erroDe('quantidade com vírgula', { lotes: [{ ...todos[0], quantidade: '1.5' }, ...todos.slice(1)] }, 'Informe a quantidade contada')
await erroDe('lote novo com código que já existe (sem diferenciar maiúsculas)', { lotes: todos, novos: [{ lote: 'a', validade: '2030-01-01', quantidade: 1 }] }, 'mais de uma vez')
await erroDe('dois lotes novos com o mesmo código', { lotes: todos, novos: [{ lote: 'Z', validade: '2030-01-01', quantidade: 1 }, { lote: 'z', validade: '2030-02-01', quantidade: 1 }] }, 'mais de uma vez')
await erroDe('lote novo sem validade', { lotes: todos, novos: [{ lote: 'Z', quantidade: 1 }] }, 'Informe a validade')
await erroDe('lote novo com quantidade zero', { lotes: todos, novos: [{ lote: 'Z', validade: '2030-01-01', quantidade: 0 }] }, 'maior que zero')
await erroDe('total acima de 100.000', { lotes: [{ ...todos[0], quantidade: 99999 }, ...todos.slice(1)], novos: [{ lote: 'Z', validade: '2030-01-01', quantidade: 5 }] }, 'limite de 100.000')
await expectError('cerveja que não está no controle', `select iniciar_balanco_dos_lotes('00000000-0000-4000-8000-000000000000', '{"lotes":[]}'::jsonb)`, undefined, 'não está mais no controle')
await dono()
expectEq('nenhuma contagem inválida virou registro', (await um(`select count(*)::int n from lotes_balancos`)).n, 3)

await como(fora)
await expectError('quem não é da equipe não registra balanço', `select iniciar_balanco_dos_lotes($1, $2::jsonb)`, [pils, JSON.stringify({ lotes: todos })], 'permissão')
expectEq('quem não é da equipe não vê os balanços', (await um(`select count(*)::int n from lotes_balancos`)).n, 0)
await db.exec(`reset role; set role anon; select set_config('request.jwt.claim.sub', '', false);`)
await expectError('visitante não registra balanço', `select iniciar_balanco_dos_lotes($1, $2::jsonb)`, [pils, JSON.stringify({ lotes: todos })])
await expectError('visitante não vê os balanços', `select count(*) from lotes_balancos`)

// -----------------------------------------------------------------------------
// 5. Falhas: a Olist recusou / sem confirmação / envio interrompido
// -----------------------------------------------------------------------------
await como(ana)
const b4 = await iniciar(pils, { lotes: [{ id: lotesPils[0].id, quantidade: 5 }, { id: lotesPils[1].id, quantidade: 0 }, { id: lotesPils[2].id, quantidade: 0 }] })
await servidor()
marco = await ultimoId()
await q(`select falhar_balanco_dos_lotes($1, 'recusado', 'A Olist não aceitou o balanço.', 0)`, [b4.id])
await dono()
expectEq('balanço recusado: lotes e estoque do CRM ficam como estavam', {
  lotes: await lotesDa(pils),
  estoque: (await um(`select estoque_olist::int e from lotes_cervejas where id = $1`, [pils])).e,
}, { lotes: [{ lote: 'A', quantidade: 0 }, { lote: 'B', quantidade: 0 }, { lote: 'C', quantidade: 0 }], estoque: 0 })
expectEq(
  'a recusa fica no histórico, em nome de quem contou',
  await um(`select tipo, origem, autor_id, detalhes->>'situacao' s, (detalhes->>'total')::int t from lote_movimentos where cerveja_id = $1 and id > $2`, [pils, marco]),
  { tipo: 'falha_balanco', origem: 'balanco', autor_id: ana, s: 'recusado', t: 5 },
)
expectEq('registro marcado como recusado, com o motivo', await um(`select status, erro from lotes_balancos where id = $1`, [b4.id]), { status: 'recusado', erro: 'A Olist não aceitou o balanço.' })
await servidor()
await expectError('situação inventada é recusada', `select falhar_balanco_dos_lotes($1, 'concluido', 'x')`, [b4.id], 'Situação inválida')

await como(joao)
const contagem5 = { lotes: [{ id: lotesPils[0].id, quantidade: 5 }, { id: lotesPils[1].id, quantidade: 0 }, { id: lotesPils[2].id, quantidade: 0 }] }
const b5 = await iniciar(pils, contagem5)
await dono()
await q(`update lotes_balancos set criado_em = now() - interval '10 minutes' where id = $1`, [b5.id])
await como(ana)
marco = await ultimoId()
const b6 = await iniciar(pils, contagem5)
await dono()
expectEq('balanço antigo sem resposta vira "conferir" quando outro começa', (await um(`select status from lotes_balancos where id = $1`, [b5.id])).status, 'conferir')
expectEq(
  'e fica no histórico em nome de quem tinha contado',
  await um(`select tipo, autor_id, detalhes->>'situacao' s from lote_movimentos where cerveja_id = $1 and id > $2`, [pils, marco]),
  { tipo: 'falha_balanco', autor_id: joao, s: 'conferir' },
)
await servidor()
await q(`select concluir_balanco_dos_lotes($1, 0, 5, null, 'sem número de lançamento')`, [b6.id])
await dono()
expectEq('balanço conclui mesmo sem o número do lançamento (resposta perdida, saldo conferido)', (await um(`select status, id_lancamento from lotes_balancos where id = $1`, [b6.id])), { status: 'concluido', id_lancamento: null })

// -----------------------------------------------------------------------------
// 6. Lote mexido no meio do envio: a conferência do fim acerta pela regra de sempre
// -----------------------------------------------------------------------------
await como(ana)
const b7 = await iniciar(pils, { lotes: [{ id: lotesPils[0].id, quantidade: 5 }, { id: lotesPils[1].id, quantidade: 0 }, { id: lotesPils[2].id, quantidade: 0 }] })
await q(`insert into lotes (cerveja_id, lote, quantidade, validade) values ($1, 'INTRUSO', 0, current_date + 400)`, [pils])
await q(`update lotes set quantidade = 4 where cerveja_id = $1 and lote = 'INTRUSO'`, [pils])
await servidor()
await q(`select concluir_balanco_dos_lotes($1, 5, 5, 555007, 'com intruso')`, [b7.id])
await dono()
expectEq(
  'soma dos lotes nunca passa do total enviado à Olist',
  await um(`select (select sum(quantidade)::int from lotes where cerveja_id = $1) soma, (select estoque_olist::int from lotes_cervejas where id = $1) estoque`, [pils]),
  { soma: 5, estoque: 5 },
)

// -----------------------------------------------------------------------------
// 7. Aviso da Caixa VIP (pedidos de pré-venda ainda não separados)
// -----------------------------------------------------------------------------
const pedidos = await q(`select id from pedidos order by numero limit 2`)
await q(`update pedidos set status = 'confirmado' where id = $1`, [pedidos[0].id])
await q(`update pedidos set status = 'entregue' where id = $1`, [pedidos[1].id])
await q(
  `insert into movimentos_estoque_olist (olist_produto_id, pedido_id, tipo, quantidade, motivo, status, enviado_em) values
     (9101, $1, 'S', 3, 'teste', 'enviado', now()),   -- na caixa, já baixado na Olist
     (9101, $1, 'E', 1, 'teste', 'enviado', now()),   -- uma devolvida
     (9101, $1, 'S', 2, 'teste', 'pendente', null),   -- na caixa, baixa a caminho
     (9101, $1, 'S', 9, 'teste', 'cancelado', null),  -- anulada: não conta
     (9101, $2, 'S', 5, 'teste', 'enviado', now()),   -- pedido entregue: a garrafa já saiu
     (9999, $1, 'S', 7, 'teste', 'enviado', now())    -- outro produto`,
  [pedidos[0].id, pedidos[1].id],
)
await como(joao)
expectEq('unidades em Caixa VIP não separada: baixadas e a caminho', await um(`select * from caixa_vip_do_produto_olist(9101)`), { na_olist: 2, a_caminho: 2 })
expectEq('produto sem Caixa VIP', await um(`select * from caixa_vip_do_produto_olist(1)`), { na_olist: 0, a_caminho: 0 })
const lotesAgora = await q(`select id from lotes where cerveja_id = $1`, [pils])
const b8 = await iniciar(pils, { lotes: lotesAgora.map((l) => ({ id: l.id, quantidade: 1 })) })
expectEq('o registro guarda o aviso da Caixa VIP mostrado na hora', await um(`select caixa_vip v, caixa_vip_a_caminho c from lotes_balancos where id = $1`, [b8.id]), { v: 2, c: 2 })
await como(fora)
await expectError('quem não é da equipe não consulta a Caixa VIP', `select * from caixa_vip_do_produto_olist(9101)`, undefined, 'permissão')

// -----------------------------------------------------------------------------
// 8. Cerveja que sai do controle: o registro do balanço e o histórico ficam
// -----------------------------------------------------------------------------
await como(ana)
await q(`delete from lotes_cervejas where id = $1`, [pils])
await dono()
expectEq(
  'os balanços continuam guardados pelo produto da Olist',
  await um(`select count(*)::int n, count(cerveja_id)::int com_cerveja, max(nome) nome from lotes_balancos where olist_id = 9101`),
  { n: 8, com_cerveja: 0, nome: 'Pils do Balanço' },
)
await servidor()
await expectError('balanço de cerveja que saiu do controle não conclui', `select concluir_balanco_dos_lotes($1, 5, 4, 1, 'x')`, [b8.id], 'saiu do controle')
await q(`select falhar_balanco_dos_lotes($1, 'conferir', 'A cerveja saiu do controle no meio do envio.', 5, 4, 555008)`, [b8.id])
await dono()
expectEq('a falha ainda entra no histórico do produto', (await um(`select count(*)::int n from lote_movimentos where olist_id = 9101 and tipo = 'falha_balanco'`)).n, 3)

console.log(falhas ? `\n✗ ${falhas} verificação(ões) falharam` : '\n✓ balanço: todas as verificações passaram')
process.exit(falhas ? 1 : 0)
