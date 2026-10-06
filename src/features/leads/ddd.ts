/** DDDs do Brasil e a principal cidade de cada um (o banco usa a mesma lista em `ddd_do_whatsapp`). */
export const REGIAO_DO_DDD: Record<string, string> = {
  '11': 'São Paulo/SP',
  '12': 'São José dos Campos/SP',
  '13': 'Santos/SP',
  '14': 'Bauru/SP',
  '15': 'Sorocaba/SP',
  '16': 'Ribeirão Preto/SP',
  '17': 'São José do Rio Preto/SP',
  '18': 'Presidente Prudente/SP',
  '19': 'Campinas/SP',
  '21': 'Rio de Janeiro/RJ',
  '22': 'Campos dos Goytacazes/RJ',
  '24': 'Volta Redonda/RJ',
  '27': 'Vitória/ES',
  '28': 'Cachoeiro de Itapemirim/ES',
  '31': 'Belo Horizonte/MG',
  '32': 'Juiz de Fora/MG',
  '33': 'Governador Valadares/MG',
  '34': 'Uberlândia/MG',
  '35': 'Poços de Caldas/MG',
  '37': 'Divinópolis/MG',
  '38': 'Montes Claros/MG',
  '41': 'Curitiba/PR',
  '42': 'Ponta Grossa/PR',
  '43': 'Londrina/PR',
  '44': 'Maringá/PR',
  '45': 'Cascavel/PR',
  '46': 'Pato Branco/PR',
  '47': 'Joinville/SC',
  '48': 'Florianópolis/SC',
  '49': 'Chapecó/SC',
  '51': 'Porto Alegre/RS',
  '53': 'Pelotas/RS',
  '54': 'Caxias do Sul/RS',
  '55': 'Santa Maria/RS',
  '61': 'Brasília/DF',
  '62': 'Goiânia/GO',
  '63': 'Palmas/TO',
  '64': 'Rio Verde/GO',
  '65': 'Cuiabá/MT',
  '66': 'Rondonópolis/MT',
  '67': 'Campo Grande/MS',
  '68': 'Rio Branco/AC',
  '69': 'Porto Velho/RO',
  '71': 'Salvador/BA',
  '73': 'Ilhéus/BA',
  '74': 'Juazeiro/BA',
  '75': 'Feira de Santana/BA',
  '77': 'Vitória da Conquista/BA',
  '79': 'Aracaju/SE',
  '81': 'Recife/PE',
  '82': 'Maceió/AL',
  '83': 'João Pessoa/PB',
  '84': 'Natal/RN',
  '85': 'Fortaleza/CE',
  '86': 'Teresina/PI',
  '87': 'Petrolina/PE',
  '88': 'Juazeiro do Norte/CE',
  '89': 'Picos/PI',
  '91': 'Belém/PA',
  '92': 'Manaus/AM',
  '93': 'Santarém/PA',
  '94': 'Marabá/PA',
  '95': 'Boa Vista/RR',
  '96': 'Macapá/AP',
  '97': 'Interior do Amazonas/AM',
  '98': 'São Luís/MA',
  '99': 'Imperatriz/MA',
}

/** DDD vindo da URL (?ddd=11): só aceita DDDs que existem. */
export function dddValido(valor: string | undefined): string | undefined {
  return valor && valor in REGIAO_DO_DDD ? valor : undefined
}

export type ContagemDdd = { ddd: string | null; numeros: number }

/** Resumo da contagem: total de números (sem repetir) e quantos não têm DDD do Brasil. */
export function resumirDdds(contagem: ContagemDdd[]) {
  const total = contagem.reduce((s, c) => s + c.numeros, 0)
  const semDdd = contagem.find((c) => c.ddd === null)?.numeros ?? 0
  const porDdd = contagem.filter((c): c is { ddd: string; numeros: number } => c.ddd !== null)
  return { total, semDdd, porDdd }
}

/** Opções do filtro: "DDD 11 · São Paulo/SP · 18.162". */
export function opcoesDdd(porDdd: Array<{ ddd: string; numeros: number }>) {
  return porDdd.map((d) => ({
    valor: d.ddd,
    rotulo: `DDD ${d.ddd} · ${REGIAO_DO_DDD[d.ddd] ?? ''} · ${d.numeros.toLocaleString('pt-BR')}`,
  }))
}
