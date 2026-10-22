/**
 * Frases do pop-up motivacional (uma por dia, igual para toda a equipe).
 * A ordem é sorteada a cada volta: passam todas as frases, sem repetir, e só
 * então começa uma nova volta com outra ordem. Incluir ou tirar uma frase daqui
 * muda o sorteio a partir do dia seguinte — não precisa mexer em mais nada.
 */
export type Frase = {
  texto: string
  autor: string
  empresa: string
  /** Valor de mercado ou de venda da empresa, como referência. */
  valor: string
}

const APPLE = '~US$ 4,4 trilhões'
const MICROSOFT = '~US$ 3 trilhões'
const AMAZON = '~US$ 2,6 trilhões'
const TESLA = '~US$ 1,5 trilhão'
const SPACEX = '~US$ 2,2 trilhões'
const META = '~US$ 1,5 trilhão'
const ALPHABET = '~US$ 4,4 trilhões'
const NVIDIA = '~US$ 5 trilhões'
const LINKEDIN = 'vendido por US$ 26,2 bilhões'
const YC = 'portfólio avaliado em mais de US$ 600 bilhões'
const FORD = '~US$ 45 bilhões'
const BERKSHIRE = '~US$ 1,1 trilhão'
const ALIBABA = '~US$ 300 bilhões'

export const FRASES: Frase[] = [
  { texto: 'A única maneira de fazer um ótimo trabalho é amar o que você faz.', autor: 'Steve Jobs', empresa: 'Apple', valor: APPLE },
  { texto: 'Seu tempo é limitado, então não o desperdice vivendo a vida de outra pessoa.', autor: 'Steve Jobs', empresa: 'Apple', valor: APPLE },
  { texto: 'Continue com fome. Continue tolo.', autor: 'Steve Jobs', empresa: 'Apple', valor: APPLE },
  { texto: 'Às vezes, quando você inova, comete erros. É melhor admiti-los rápido e seguir melhorando.', autor: 'Steve Jobs', empresa: 'Apple', valor: APPLE },
  { texto: 'Seus clientes mais insatisfeitos são sua maior fonte de aprendizado.', autor: 'Bill Gates', empresa: 'Microsoft', valor: MICROSOFT },
  { texto: 'O sucesso é um péssimo professor. Ele faz pessoas inteligentes acharem que não podem perder.', autor: 'Bill Gates', empresa: 'Microsoft', valor: MICROSOFT },
  { texto: 'Superestimamos a mudança dos próximos dois anos e subestimamos a dos próximos dez.', autor: 'Bill Gates', empresa: 'Microsoft', valor: MICROSOFT },
  { texto: 'Se você não está disposto a ser incompreendido, não deveria inovar.', autor: 'Jeff Bezos', empresa: 'Amazon', valor: AMAZON },
  { texto: 'Sua marca é o que as pessoas dizem sobre você quando você não está na sala.', autor: 'Jeff Bezos', empresa: 'Amazon', valor: AMAZON },
  { texto: 'Seja teimoso na visão e flexível nos detalhes.', autor: 'Jeff Bezos', empresa: 'Amazon', valor: AMAZON },
  { texto: 'Se você dobrar o número de experimentos por ano, vai dobrar sua capacidade de inovar.', autor: 'Jeff Bezos', empresa: 'Amazon', valor: AMAZON },
  { texto: 'Quando algo é importante o suficiente, você faz, mesmo que as probabilidades estejam contra você.', autor: 'Elon Musk', empresa: 'Tesla', valor: TESLA },
  { texto: 'Falhar é uma opção aqui. Se as coisas não estão falhando, você não está inovando o suficiente.', autor: 'Elon Musk', empresa: 'SpaceX', valor: SPACEX },
  { texto: 'Persistência é muito importante. Você não deve desistir, a menos que seja forçado.', autor: 'Elon Musk', empresa: 'Tesla', valor: TESLA },
  { texto: 'Começar uma empresa é como mastigar vidro e encarar o abismo.', autor: 'Elon Musk', empresa: 'SpaceX', valor: SPACEX },
  {
    texto: 'O maior risco é não correr risco nenhum. Num mundo que muda rápido, a única estratégia que com certeza falha é não arriscar.',
    autor: 'Mark Zuckerberg',
    empresa: 'Meta',
    valor: META,
  },
  { texto: 'Mova-se rápido e quebre coisas.', autor: 'Mark Zuckerberg', empresa: 'Meta', valor: META },
  {
    texto: 'Se você está mudando o mundo, está trabalhando em coisas importantes e fica animado para acordar de manhã.',
    autor: 'Larry Page',
    empresa: 'Google/Alphabet',
    valor: ALPHABET,
  },
  { texto: 'Sempre entregue mais do que o esperado.', autor: 'Larry Page', empresa: 'Google/Alphabet', valor: ALPHABET },
  { texto: 'Grandeza não vem de inteligência. Vem de caráter, e caráter é formado por quem já sofreu.', autor: 'Jensen Huang', empresa: 'Nvidia', valor: NVIDIA },
  { texto: 'Nossa empresa está sempre a 30 dias de quebrar.', autor: 'Jensen Huang', empresa: 'Nvidia', valor: NVIDIA },
  { texto: 'Não seja um sabe-tudo, seja um aprende-tudo.', autor: 'Satya Nadella', empresa: 'Microsoft', valor: MICROSOFT },
  { texto: 'Nossa indústria não respeita tradição, só respeita inovação.', autor: 'Satya Nadella', empresa: 'Microsoft', valor: MICROSOFT },
  { texto: 'Os fundadores de maior sucesso não querem criar empresas. Estão numa missão.', autor: 'Sam Altman', empresa: 'OpenAI', valor: '~US$ 500 bilhões, privada' },
  { texto: 'Se você não sente vergonha da primeira versão do seu produto, lançou tarde demais.', autor: 'Reid Hoffman', empresa: 'LinkedIn', valor: LINKEDIN },
  { texto: 'Empreender é pular de um penhasco e montar o avião durante a queda.', autor: 'Reid Hoffman', empresa: 'LinkedIn', valor: LINKEDIN },
  { texto: 'Faça coisas que não escalam.', autor: 'Paul Graham', empresa: 'Y Combinator', valor: YC },
  { texto: 'Faça algo que as pessoas queiram.', autor: 'Paul Graham', empresa: 'Y Combinator', valor: YC },
  { texto: 'Pensamento brilhante é raro, mas coragem é ainda mais rara que genialidade.', autor: 'Peter Thiel', empresa: 'PayPal', valor: 'vendido por US$ 1,5 bilhão' },
  { texto: 'O software está devorando o mundo.', autor: 'Marc Andreessen', empresa: 'Netscape', valor: 'vendida por US$ 4,2 bilhões' },
  { texto: 'Construa algo que 100 pessoas amem, não algo que 1 milhão de pessoas apenas goste.', autor: 'Brian Chesky', empresa: 'Airbnb', valor: '~US$ 80 bilhões' },
  {
    texto: 'Empresas raramente morrem por andar rápido demais, mas frequentemente morrem por andar devagar demais.',
    autor: 'Reed Hastings',
    empresa: 'Netflix',
    valor: '~US$ 450 bilhões',
  },
  { texto: 'Não se preocupe em falhar. Você só precisa acertar uma vez.', autor: 'Drew Houston', empresa: 'Dropbox', valor: '~US$ 8 bilhões' },
  { texto: 'Fracasso não é o resultado. Fracasso é não tentar.', autor: 'Sara Blakely', empresa: 'Spanx', valor: 'avaliada em US$ 1,2 bilhão' },
  { texto: 'Cercado de pessoas comprometidas com um propósito comum, tudo é possível.', autor: 'Howard Schultz', empresa: 'Starbucks', valor: '~US$ 100 bilhões' },
  { texto: 'Os covardes nunca começaram e os fracos morreram no caminho. Sobramos nós.', autor: 'Phil Knight', empresa: 'Nike', valor: '~US$ 90 bilhões' },
  { texto: 'O jeito de começar é parar de falar e começar a fazer.', autor: 'Walt Disney', empresa: 'Disney', valor: '~US$ 200 bilhões' },
  { texto: 'Quer você pense que pode, quer pense que não pode, você está certo.', autor: 'Henry Ford', empresa: 'Ford', valor: FORD },
  { texto: 'Fracasso é a oportunidade de começar de novo, agora de forma mais inteligente.', autor: 'Henry Ford', empresa: 'Ford', valor: FORD },
  { texto: 'Existe apenas um chefe: o cliente.', autor: 'Sam Walton', empresa: 'Walmart', valor: '~US$ 950 bilhões' },
  { texto: 'Leva 20 anos para construir uma reputação e cinco minutos para destruí-la.', autor: 'Warren Buffett', empresa: 'Berkshire Hathaway', valor: BERKSHIRE },
  { texto: 'O risco vem de não saber o que você está fazendo.', autor: 'Warren Buffett', empresa: 'Berkshire Hathaway', valor: BERKSHIRE },
  { texto: 'Hoje é difícil, amanhã será pior, mas depois de amanhã haverá sol.', autor: 'Jack Ma', empresa: 'Alibaba', valor: ALIBABA },
  { texto: 'Se você não desistir, ainda tem uma chance.', autor: 'Jack Ma', empresa: 'Alibaba', valor: ALIBABA },
  { texto: 'O negócio dos negócios é melhorar o estado do mundo.', autor: 'Marc Benioff', empresa: 'Salesforce', valor: '~US$ 230 bilhões' },
  { texto: 'Sonhar grande e sonhar pequeno dá o mesmo trabalho.', autor: 'Jorge Paulo Lemann', empresa: 'AB InBev', valor: '~US$ 120 bilhões' },
  { texto: 'Quando você inova, precisa estar preparado para todos dizerem que você é louco.', autor: 'Larry Ellison', empresa: 'Oracle', valor: '~US$ 600 bilhões' },
  { texto: 'Faça cada detalhe perfeito e limite o número de detalhes.', autor: 'Jack Dorsey', empresa: 'Twitter', valor: 'vendido por US$ 44 bilhões' },
  { texto: 'Sorte é dividendo do suor. Quanto mais você sua, mais sorte tem.', autor: 'Ray Kroc', empresa: "McDonald's", valor: '~US$ 220 bilhões' },
  { texto: 'O fracasso não é o oposto do sucesso, é parte dele.', autor: 'Arianna Huffington', empresa: 'HuffPost', valor: 'vendido por US$ 315 milhões' },
]

/** Dia em que começou a primeira volta de frases. */
const DIA_ZERO = Date.UTC(2026, 0, 1)

/** Frase de um dia "YYYY-MM-DD": a mesma para todo mundo naquele dia. */
export function fraseDoDia(diaISO: string): Frase {
  const total = FRASES.length
  const dias = Math.floor((Date.parse(`${diaISO}T12:00:00Z`) - DIA_ZERO) / 86_400_000)
  const volta = Math.floor(dias / total)
  return FRASES[ordemDaVolta(volta)[dias - volta * total]]
}

/** Ordem sorteada (sempre a mesma para a mesma volta), sem abrir a volta com a frase que fechou a anterior. */
function ordemDaVolta(volta: number): number[] {
  const ordem = embaralhar(volta)
  const anterior = embaralhar(volta - 1)
  if (ordem[0] === anterior[anterior.length - 1]) [ordem[0], ordem[1]] = [ordem[1], ordem[0]]
  return ordem
}

/** Fisher–Yates com gerador pseudoaleatório de semente fixa (mulberry32). */
function embaralhar(semente: number): number[] {
  let estado = (semente + 0x9e3779b9) >>> 0
  const aleatorio = () => {
    estado = (estado + 0x6d2b79f5) >>> 0
    let t = estado
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
  const ordem = FRASES.map((_, i) => i)
  for (let i = ordem.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1))
    ;[ordem[i], ordem[j]] = [ordem[j], ordem[i]]
  }
  return ordem
}
