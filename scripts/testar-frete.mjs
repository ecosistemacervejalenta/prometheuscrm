// =============================================================================
// Teste das regras do frete calculado (Olist Envios pela Shopify), sem rede:
// peso da caixa, endereço no formato da Shopify e escolha da opção mais barata.
// As taxas de exemplo são respostas REAIS da loja (draftOrderCalculate, 2026-11-25).
//   npm run test:frete
// =============================================================================
import {
  entradaDaCotacao,
  escolherFrete,
  fraseDaFalha,
  lerCotacaoDoPedido,
  nomeDaTransportadora,
  normalizarLoja,
  opcoesDoOlistEnvios,
  pesoDaCaixaKg,
} from '../src/features/shopify/cotacao.ts'

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

// Av. Paulista (CEP da lista VIP): a loja devolve o Olist Envios E a "Entrega VIP" do ShipZip.
const PAULISTA = [
  {
    title: 'Olist Envios Pax',
    handle:
      'eyJhbGciOiJIUzI1NiJ9.eyJ0aXRsZSI6Ik9saXN0IEVudmlvcyBQYXgiLCJjb2RlIjoib2xpc3QtZW52aW9zLXBheCIsInNvdXJjZSI6Ik9saXN0IEVudmlvcyIsInByaWNlIjoiMTMuMzYiLCJjdXJyZW5jeSI6IkJSTCIsInByaWNlX3ByZXNlbnRtZW50IjoiMTMuMzYiLCJjdXJyZW5jeV9wcmVzZW50bWVudCI6IkJSTCIsImVzdGltYXRlZF9kZWxpdmVyeV90aW1lX3JhbmdlIjpudWxsLCJncm91cF9pZCI6bnVsbH0.KjCA1IZZ_kUGMUi0xc9jm9G6zQwQ9Azs07aaqaV7s0I',
    price: { amount: '13.36', currencyCode: 'BRL' },
  },
  {
    title: 'Entrega VIP no mesmo dia! Compre até as 12h (de segunda a sexta) e receba hoje. ',
    handle:
      'eyJhbGciOiJIUzI1NiJ9.eyJ0aXRsZSI6IkVudHJlZ2EgVklQIG5vIG1lc21vIGRpYSEgQ29tcHJlIGF0w6kgYXMgMTJoIChkZSBzZWd1bmRhIGEgc2V4dGEpIGUgcmVjZWJhIGhvamUuIiwiY29kZSI6ImVudHJlZ2FfdmlwIiwic291cmNlIjoiU2hpcHBpbmcgJiBEZWxpdmVyeSDigJEgU2hpcFppcCIsInByaWNlIjoiMTUuMCIsImN1cnJlbmN5IjoiQlJMIiwicHJpY2VfcHJlc2VudG1lbnQiOiIxNS4wIiwiY3VycmVuY3lfcHJlc2VudG1lbnQiOiJCUkwiLCJlc3RpbWF0ZWRfZGVsaXZlcnlfdGltZV9yYW5nZSI6bnVsbCwiZ3JvdXBfaWQiOm51bGx9.SnqMTtNubu_iXhOSclzvg8EpirT4AyIq9t12cX26H9Q',
    price: { amount: '15.0', currencyCode: 'BRL' },
  },
]
// Belo Horizonte (fora da lista): SEDEX vem primeiro na resposta, mas a iMile é a mais barata.
const BH = [
  { title: 'Olist Envios Correios SEDEX', handle: 'x.e30.y', price: { amount: '66.18', currencyCode: 'BRL' } },
  {
    title: 'Olist Envios IMile',
    handle:
      'eyJhbGciOiJIUzI1NiJ9.eyJ0aXRsZSI6Ik9saXN0IEVudmlvcyBJTWlsZSIsImNvZGUiOiJvbGlzdC1lbnZpb3MtaW1pbGUiLCJzb3VyY2UiOiJPbGlzdCBFbnZpb3MiLCJwcmljZSI6IjIzLjM0IiwiY3VycmVuY3kiOiJCUkwiLCJwcmljZV9wcmVzZW50bWVudCI6IjIzLjM0IiwiY3VycmVuY3lfcHJlc2VudG1lbnQiOiJCUkwiLCJlc3RpbWF0ZWRfZGVsaXZlcnlfdGltZV9yYW5nZSI6bnVsbCwiZ3JvdXBfaWQiOm51bGx9.-LXNgwFtQPS-DXk_0epBBvh6zvakHHqW6Uxmxl_jG2Q',
    price: { amount: '23.34', currencyCode: 'BRL' },
  },
]

// ---- Peso -------------------------------------------------------------------
igual('9 cervejas = 4,5 kg (500 g cada)', pesoDaCaixaKg(9), 4.5)
igual('1 cerveja = 0,5 kg', pesoDaCaixaKg(1), 0.5)
igual('quantidade quebrada ou negativa não vira peso', [pesoDaCaixaKg(2.9), pesoDaCaixaKg(-3)], [1, 0])

// ---- Escolha da opção ---------------------------------------------------------
igual('escolhe a mais barata do Olist Envios (não a primeira da lista)', escolherFrete(BH, 6), {
  ok: true,
  valor: 23.34,
  servico: 'Olist Envios IMile',
  pesoKg: 3,
  opcoes: [
    { servico: 'Olist Envios IMile', valor: 23.34 },
    { servico: 'Olist Envios Correios SEDEX', valor: 66.18 },
  ],
})
igual('a "Entrega VIP" do ShipZip fica de fora, mesmo na resposta da loja', opcoesDoOlistEnvios(PAULISTA), [{ servico: 'Olist Envios Pax', valor: 13.36 }])
igual(
  'app de frete mais barato que não é o Olist Envios não é escolhido',
  escolherFrete([{ title: 'Motoboy', handle: null, price: { amount: '5.00', currencyCode: 'BRL' } }, ...BH], 6).ok && escolherFrete([{ title: 'Motoboy', price: { amount: '5.00' } }, ...BH], 6).valor,
  23.34,
)
igual('sem nenhuma opção do Olist Envios: falha com o motivo', escolherFrete([PAULISTA[1]], 6).motivo, 'sem_opcoes')
igual('resposta vazia: falha com o motivo', (({ ok, motivo }) => ({ ok, motivo }))(escolherFrete([], 6)), { ok: false, motivo: 'sem_opcoes' })
igual(
  'ignora preço inválido, negativo ou em outra moeda',
  opcoesDoOlistEnvios([
    { title: 'Olist Envios A', price: { amount: 'abc', currencyCode: 'BRL' } },
    { title: 'Olist Envios B', price: { amount: '-1', currencyCode: 'BRL' } },
    { title: 'Olist Envios C', price: { amount: '9.99', currencyCode: 'USD' } },
    { title: 'Olist Envios D', price: null },
    { title: 'Olist Envios E', price: { amount: '19.999', currencyCode: 'BRL' } },
  ]),
  [{ servico: 'Olist Envios E', valor: 20 }],
)
igual(
  'serviço repetido fica com o menor valor; frete grátis (R$ 0) vale',
  opcoesDoOlistEnvios([
    { title: 'Olist Envios Pax', price: { amount: '13.36' } },
    { title: 'Olist Envios Pax', price: { amount: '12.00' } },
    { title: 'Olist Envios Grátis', price: { amount: '0.0' } },
  ]),
  [
    { servico: 'Olist Envios Grátis', valor: 0 },
    { servico: 'Olist Envios Pax', valor: 12 },
  ],
)
igual('título sem o nome do app, mas calculado por ele (handle), entra', opcoesDoOlistEnvios([{ ...PAULISTA[0], title: 'Pax' }]), [{ servico: 'Pax', valor: 13.36 }])
igual('título com o nome do app, mas calculado por outro (handle), não entra', opcoesDoOlistEnvios([{ ...PAULISTA[1], title: 'Olist Envios falso' }]), [])
igual('nome da transportadora sem o nome do app', [nomeDaTransportadora('Olist Envios Correios SEDEX'), nomeDaTransportadora('Olist Envios')], ['Correios SEDEX', 'Olist Envios'])

// ---- Entrada da Shopify -------------------------------------------------------
const pedido = {
  unidades: 9,
  cep: '30130-003',
  valor: 225,
  endereco: { logradouro: ' Av. Afonso  Pena ', numero: '1000', complemento: 'Apto 12', bairro: 'Centro', cidade: 'Belo Horizonte', uf: 'mg' },
}
igual('9 cervejas viram 9 itens de 500 g para o endereço da caixa', entradaDaCotacao(pedido), {
  lineItems: [
    {
      title: 'Caixa VIP (cerveja)',
      quantity: 9,
      originalUnitPriceWithCurrency: { amount: '25.00', currencyCode: 'BRL' },
      requiresShipping: true,
      taxable: false,
      weight: { value: 0.5, unit: 'KILOGRAMS' },
    },
  ],
  shippingAddress: { address1: 'Av. Afonso Pena, 1000', address2: 'Apto 12 · Centro', city: 'Belo Horizonte', provinceCode: 'MG', countryCode: 'BR', zip: '30130-003' },
})
igual('sem rua (cadastro antigo) ainda calcula pelo CEP', entradaDaCotacao({ ...pedido, endereco: { cidade: 'Belo Horizonte', uf: 'MG' } })?.shippingAddress, {
  address1: 'Endereço da entrega',
  city: 'Belo Horizonte',
  provinceCode: 'MG',
  countryCode: 'BR',
  zip: '30130-003',
})
igual('valor zerado não vira preço zero', entradaDaCotacao({ ...pedido, valor: 0 })?.lineItems[0].originalUnitPriceWithCurrency.amount, '0.01')
igual(
  'CEP incompleto, sem cidade, UF inválida ou sem cervejas: não calcula',
  [
    entradaDaCotacao({ ...pedido, cep: '3013' }),
    entradaDaCotacao({ ...pedido, endereco: { ...pedido.endereco, cidade: ' ' } }),
    entradaDaCotacao({ ...pedido, endereco: { ...pedido.endereco, uf: 'XX' } }),
    entradaDaCotacao({ ...pedido, endereco: { ...pedido.endereco, uf: null } }),
    entradaDaCotacao({ ...pedido, unidades: 0 }),
  ],
  [null, null, null, null, null],
)

// ---- Endereço da loja ---------------------------------------------------------
igual(
  'aceita o endereço da loja em qualquer formato',
  ['cervejalentamarket', 'CervejaLentaMarket.myshopify.com', 'https://cervejalentamarket.myshopify.com/admin', 'admin.shopify.com/store/cervejalentamarket/settings'].map(normalizarLoja),
  Array(4).fill('cervejalentamarket'),
)
igual(
  'recusa domínio próprio e endereço que escaparia para outro servidor',
  ['www.cervejalenta.com.br', 'loja.myshopify.com.evil.com', 'evil.com/x.myshopify.com', 'loja.myshopify.com@evil.com', 'a b', '', '-loja', 'loja:8080'].map(normalizarLoja),
  Array(8).fill(null),
)

// ---- O que fica guardado no pedido -------------------------------------------
igual(
  'lê o cálculo guardado no pedido',
  lerCotacaoDoPedido({ origem: 'shopify', situacao: 'ok', servico: 'Olist Envios IMile', valor: 23.34, unidades: 7, peso_kg: 3.5, cep: '30130003', cotado_em: '2026-11-25T12:00:00Z', opcoes: [{ servico: 'Olist Envios IMile', valor: 23.34 }, { lixo: 1 }] }),
  { situacao: 'ok', servico: 'Olist Envios IMile', valor: 23.34, pesoKg: 3.5, quando: '2026-11-25T12:00:00Z', opcoes: [{ servico: 'Olist Envios IMile', valor: 23.34 }], unidades: 7, cep: '30130003' },
)
igual(
  'lê a falha guardada no pedido',
  lerCotacaoDoPedido({ origem: 'shopify', situacao: 'falhou', motivo: 'sem_opcoes', detalhe: 'sem opção', unidades: 9, cep: '30130003', tentado_em: '2026-11-25T12:00:00Z' }),
  { situacao: 'falhou', motivo: 'sem_opcoes', detalhe: 'sem opção', quando: '2026-11-25T12:00:00Z', unidades: 9, cep: '30130003' },
)
igual('frete fixo ou cotado à mão não tem cálculo', [lerCotacaoDoPedido(null), lerCotacaoDoPedido({ origem: 'manual' }), lerCotacaoDoPedido('x'), lerCotacaoDoPedido([])], [null, null, null, null])
igual('motivo vira frase para a equipe', [fraseDaFalha('a Shopify demorou demais para responder.'), fraseDaFalha('')], ['A Shopify demorou demais para responder.', 'Não foi possível calcular o frete.'])

if (falhas > 0) {
  console.error(`\n✗ ${falhas} verificação(ões) falharam`)
  process.exit(1)
}
console.log('\n✓ Frete OK — peso, endereço e escolha da opção mais barata verificados')
