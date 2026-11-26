// =============================================================================
// Teste do simulador do cadastro de influenciadores, sem rede.
// Os pedidos abaixo são pedidos REAIS da loja com cupom de porcentagem (só valores dos itens,
// lidos na Shopify em 2026-11-25): o desconto da simulação tem de bater com o da Shopify.
//   npm run test:simulacao
// =============================================================================
import { combinaComBusca, lerPercentual, simularPedido } from '../src/features/influenciadores/simulacao.ts'

let falhas = 0
const igual = (rotulo, atual, esperado) => {
  const a = JSON.stringify(atual)
  const e = JSON.stringify(esperado)
  if (a === e) console.log(`✓ ${rotulo}`)
  else {
    falhas++
    console.log(`✗ ${rotulo}: esperado ${e}, veio ${a}`)
  }
}

const itens = (linhas) => linhas.map(([preco, quantidade], i) => ({ chave: String(i), titulo: `item ${i}`, preco, quantidade }))

// [pedido, cupom %, itens [preço, quantidade], desconto que a Shopify deu, subtotal depois do desconto]
const PEDIDOS_REAIS = [
  ['#1103', 10, [[27, 2], [65.7, 1]], 11.97, 107.73],
  ['#1102', 5, [[42, 2], [56, 3], [43.9, 2], [56.7, 2], [35, 2], [38.5, 2], [75.99, 1], [53, 1], [41, 2], [41.5, 2]], 44.7, 849.49],
  ['#1095', 5, [[77.5, 1], [33, 2]], 7.17, 136.33],
  ['#1093', 5, [[29, 1], [119.9, 1], [33.9, 1], [37, 1], [33, 1], [109.9, 1], [37, 1], [37, 1], [36, 1]], 23.63, 449.07],
  ['#1089', 5, [[25.5, 1], [35.9, 1], [42, 1], [41, 1], [41, 1], [41, 1], [42.99, 1]], 13.46, 255.93],
  ['#1086', 5, [[27, 1], [119, 1], [69.9, 1], [34.5, 1], [34.5, 1], [31.5, 1], [36.9, 1], [34.5, 1], [42, 1], [33.5, 1], [36, 1], [17, 1], [17, 1], [21, 1], [21, 1], [17, 1], [35.9, 1], [43.9, 1], [252.99, 1]], 46.25, 878.84],
]

for (const [pedido, cupom, linhas, desconto, subtotal] of PEDIDOS_REAIS) {
  const r = simularPedido(itens(linhas), cupom, 10)
  igual(`${pedido}: desconto e subtotal iguais aos da Shopify`, { desconto: r.desconto, clientePaga: r.clientePaga }, { desconto, clientePaga: subtotal })
}

// Comissão: mesma conta do banco (round(base × % / 100, 2)), sobre o que o cliente paga.
const r = simularPedido(itens([[29, 2], [54.9, 1]]), 10, 12.5)
igual('conta completa de um pedido', r, {
  unidades: 3,
  produtos: 112.9,
  desconto: 11.29,
  clientePaga: 101.61,
  comissao: 12.7,
  loja: 88.91,
  custoDoPrograma: 23.99,
  custoDoProgramaFracao: 23.99 / 112.9,
})
igual('loja + comissão + desconto = produtos', Math.round((r.loja + r.comissao + r.desconto) * 100) / 100, r.produtos)
igual('sem itens, tudo zero', simularPedido([], 10, 10).custoDoProgramaFracao, 0)
igual('percentual inválido conta como 0', simularPedido(itens([[50, 1]]), NaN, 10).desconto, 0)
igual('percentual acima de 100 vira 100', simularPedido(itens([[50, 1]]), 150, 0).clientePaga, 0)
igual('lê "12,5" e "12.5 %"', [lerPercentual('12,5'), lerPercentual('12.5 %'), Number.isNaN(lerPercentual(''))], [12.5, 12.5, true])
igual('busca sem acento e em qualquer ordem', combinaComBusca('Cerveja Belga Chimay Red Belgian Dubbel 330ml', 'dubbel chimay'), true)
igual('busca acha com acento digitado', combinaComBusca('Cerveja Alemã Hofbrau', 'alema'), true)
igual('busca exige todas as palavras', combinaComBusca('Cerveja Belga Orval', 'orval ipa'), false)

if (falhas > 0) {
  console.error(`\n✗ ${falhas} verificação(ões) falharam`)
  process.exit(1)
}
console.log('\n✓ Simulador OK — desconto igual ao da Shopify nos pedidos reais')
