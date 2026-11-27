import type { Enums } from '@/types/database.types'

export type TipoColecao = Enums<'tipo_colecao'>

export const TIPOS_DE_COLECAO: Array<{ valor: TipoColecao; rotulo: string; plural: string; descricao: string }> = [
  { valor: 'estilo', rotulo: 'Estilo', plural: 'Estilos', descricao: 'IPA, Stout, Sour, Tripel…' },
  { valor: 'cervejaria', rotulo: 'Cervejaria', plural: 'Cervejarias', descricao: 'Dogma, Chimay, Dádiva…' },
  { valor: 'tema', rotulo: 'Tema', plural: 'Temas', descricao: 'Kits, presentes, ofertas, sem álcool…' },
  { valor: 'ignorar', rotulo: 'Ignorar', plural: 'Ignoradas', descricao: 'Não é cerveja (copos, acessórios): fica fora' },
]

export const ROTULO_DO_TIPO = Object.fromEntries(TIPOS_DE_COLECAO.map((t) => [t.valor, t.rotulo])) as Record<TipoColecao, string>

/** Minúsculas e sem acento, para comparar títulos e marcas. */
export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

const IGNORAR = /\b(acessorios?|copos?|tacas?|canecas?|abridor(es)?|bones?|camisetas?|vale[- ]presente|cartao[- ]presente|gift ?card|embalagens?)\b/
const TEMA =
  /\b(kits?|packs?|para presentear|presentes?|ofertas?|promoc\w*|dia d[oa]s?|natal|black friday|lancamentos?|novidades?|sem alcool|sem gluten|nao pasteurizad\w*|puro malte|mais vendid\w*|degustac\w*|assinaturas?|combos?|outlet|liquidac\w*)\b/
const ESTILO = new RegExp(
  '\\b(' +
    [
      'ipa', 'neipa', 'apa', 'ale', 'lager', 'pils', 'pilsner', 'stout', 'porter', 'sour', 'gose', 'weiss', 'weisse', 'weissbier',
      'weizen', 'weizenbock', 'witbier', 'wheat', 'trigo', 'bock', 'doppelbock', 'eisbock', 'dunkel', 'helles', 'kellerbier', 'kolsch',
      'altbier', 'saison', 'tripel', 'dubbel', 'quadrupel', 'trappist', 'lambic', 'gueuze', 'framboise', 'kriek', 'flanders',
      'barley ?wine', 'berliner', 'catharina', 'fruit', 'smoothie', 'pastry', 'hidromel', 'mead', 'rauch\\w*', 'marzen',
      'schwarzbier', 'roggenbier', 'bitter', 'cream', 'wild', 'specialty', 'amber', 'red ale', 'blonde?', 'golden', 'session',
      'imperial', 'juicy', 'hazy', 'west coast', 'pumpkin', 'zwickel\\w*', 'dortmund\\w*', 'brown', 'dark', 'vienna', 'munich',
      'scotch', 'barleywine', 'brut', 'grisette', 'farmhouse',
    ].join('|') +
    ')\\b',
)

/**
 * Sugere o tipo de uma collection pelo título (e pelas marcas de alguns produtos dela):
 * não-cerveja → ignorar; kits/ofertas/datas → tema; marca dos produtos = título → cervejaria;
 * nome de estilo (IPA, Stout, Tripel…) → estilo; o resto (Dogma, Chimay…) → cervejaria.
 * É só um palpite: a equipe corrige em Clientes › Por estilo › Organizar.
 */
export function sugerirTipo(titulo: string, marcas: Array<string | null | undefined> = []): TipoColecao {
  const t = semAcento(titulo)
  if (!t) return 'tema'
  if (IGNORAR.test(t)) return 'ignorar'
  if (TEMA.test(t)) return 'tema'

  const conhecidas = marcas.map((m) => semAcento(m ?? '')).filter(Boolean)
  const daMarca = conhecidas.filter((m) => m === t || m.startsWith(`${t} `) || t.startsWith(`${m} `)).length
  if (conhecidas.length > 0 && daMarca / conhecidas.length >= 0.6) return 'cervejaria'

  if (ESTILO.test(t)) return 'estilo'
  return 'cervejaria'
}
