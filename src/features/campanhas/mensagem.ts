import { envPublico } from '@/lib/env'

/**
 * Mensagem de campanha do WhatsApp oficial (API Cloud da Meta).
 * Mensagens iniciadas pela loja só saem como "modelo" aprovado pela Meta; estas
 * regras barram, antes da análise, os motivos de recusa mais comuns.
 * Funções puras: rodam no navegador (prévia ao digitar) e no servidor.
 */

export const LIMITES_MENSAGEM = { texto: 1024, rodape: 60, botao: 25 } as const
export const IMAGEM_MAXIMA = 5 * 1024 * 1024
export const TIPOS_IMAGEM = ['image/jpeg', 'image/png']

/** Única variável aceita: o primeiro nome do contato. */
export const VARIAVEL_NOME = '{nome}'

export type MensagemCampanha = {
  texto: string
  /** Usado no lugar de {nome} quando o contato não tem nome (a Meta não aceita variável vazia). */
  nomePadrao: string
  rodape: string
  botaoLink: { texto: string; url: string } | null
  botaoSair: boolean
}

export type CampoMensagem = 'texto' | 'nomePadrao' | 'rodape' | 'botaoTexto' | 'botaoUrl'

export const TEXTO_BOTAO_SAIR = 'Não quero receber'

const VARIAVEIS = /\{(\w+)\}/g

/** Problemas da mensagem por campo (vazio = pronta para a análise da Meta). */
export function validarMensagem(m: MensagemCampanha): Partial<Record<CampoMensagem, string>> {
  const erros: Partial<Record<CampoMensagem, string>> = {}
  const texto = m.texto.trim()

  const desconhecidas = [...texto.matchAll(VARIAVEIS)].map((v) => v[0]).filter((v) => v !== VARIAVEL_NOME)
  if (!texto) erros.texto = 'Escreva a mensagem.'
  else if (texto.length > LIMITES_MENSAGEM.texto) erros.texto = `Use no máximo ${LIMITES_MENSAGEM.texto.toLocaleString('pt-BR')} caracteres.`
  else if (desconhecidas.length > 0) erros.texto = `Só ${VARIAVEL_NOME} é preenchido automaticamente — tire ${desconhecidas[0]}.`
  else if (texto.startsWith(VARIAVEL_NOME) || texto.endsWith(VARIAVEL_NOME)) {
    erros.texto = `A Meta recusa mensagens que começam ou terminam com ${VARIAVEL_NOME}. Ex.: “Olá, {nome}! …”`
  }

  if (texto.includes(VARIAVEL_NOME) && !m.nomePadrao.trim()) erros.nomePadrao = 'Diga o que usar quando o contato não tem nome.'

  if (m.rodape.length > LIMITES_MENSAGEM.rodape) erros.rodape = `Use no máximo ${LIMITES_MENSAGEM.rodape} caracteres.`
  else if (/\{\w+\}/.test(m.rodape)) erros.rodape = 'O rodapé não aceita {nome}.'

  if (m.botaoLink) {
    const rotulo = m.botaoLink.texto.trim()
    if (!rotulo) erros.botaoTexto = 'Escreva o texto do botão.'
    else if (rotulo.length > LIMITES_MENSAGEM.botao) erros.botaoTexto = `Use no máximo ${LIMITES_MENSAGEM.botao} caracteres.`
    if (!urlValida(m.botaoLink.url)) erros.botaoUrl = 'Cole o link completo, começando com https://'
  }

  return erros
}

function urlValida(url: string) {
  try {
    const u = new URL(url.trim())
    return u.protocol === 'https:' && u.hostname.includes('.')
  } catch {
    return false
  }
}

/**
 * Valor do {nome}: primeiro nome numa linha só (a Meta recusa quebras e tabs) e,
 * se a lista veio toda em maiúsculas ou minúsculas, com só a inicial maiúscula.
 * Sem nome, vale o nome padrão da campanha.
 */
export function valorDoNome(nome: string | null, nomePadrao: string): string {
  const primeiro = (nome ?? '').replace(/\s+/g, ' ').trim().split(' ')[0]?.slice(0, 40) ?? ''
  if (!primeiro) return nomePadrao.replace(/\s+/g, ' ').trim() || 'cliente'
  const uniforme = primeiro === primeiro.toUpperCase() || primeiro === primeiro.toLowerCase()
  return uniforme ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() : primeiro
}

/** Texto como o contato vai ver: {nome} vira o primeiro nome (ou o nome padrão). */
export function textoParaContato(texto: string, nome: string | null, nomePadrao: string): string {
  return texto.replaceAll(VARIAVEL_NOME, valorDoNome(nome, nomePadrao))
}

/** URL pública da foto da campanha (a Meta busca a imagem por ela). */
export function urlImagemCampanha(caminho: string | null): string | null {
  return caminho ? `${envPublico.supabaseUrl}/storage/v1/object/public/campanhas/${caminho}` : null
}
