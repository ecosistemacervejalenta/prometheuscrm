import { diasDesde, FUSO } from '@/lib/datas'
import { primeiroNome } from '@/lib/format'

/** Respostas sem texto chegam da Meta com um rótulo no lugar (webhook das campanhas). */
export const ROTULO_TIPO: Record<string, string> = {
  image: '[foto]',
  audio: '[áudio]',
  video: '[vídeo]',
  document: '[documento]',
  sticker: '[figurinha]',
  location: '[localização]',
  contacts: '[contato]',
  reaction: '[reação]',
}

/** O que o cliente fez, para respostas sem texto ("Você reagiu…", "Você mandou um áudio…"). */
const ACAO_SEM_TEXTO: Record<string, string> = {
  '[foto]': 'mandou uma foto',
  '[áudio]': 'mandou um áudio',
  '[vídeo]': 'mandou um vídeo',
  '[documento]': 'mandou um documento',
  '[figurinha]': 'mandou uma figurinha',
  '[localização]': 'mandou uma localização',
  '[contato]': 'mandou um contato',
  '[mensagem]': 'respondeu',
}

/** "MARIA" / "maria" → "Maria"; nomes já com maiúsculas e minúsculas ficam como estão. */
function nomeParaSaudacao(nome: string | null) {
  const primeiro = primeiroNome(nome).replace(/[^\p{L}'-]/gu, '')
  if (primeiro.length < 2) return ''
  const misto = primeiro !== primeiro.toUpperCase() && primeiro !== primeiro.toLowerCase()
  return misto ? primeiro : primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase()
}

/** hoje · ontem · no dia 20/11 (fuso de Brasília). */
function quando(iso: string) {
  const dias = diasDesde(iso)
  if (dias === 0) return 'hoje'
  if (dias === 1) return 'ontem'
  return `no dia ${new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' }).format(new Date(iso))}`
}

/** Cada linha vira citação no WhatsApp ("> texto"). */
function citar(texto: string) {
  return texto
    .trim()
    .split('\n')
    .map((linha) => `> ${linha}`)
    .join('\n')
}

/**
 * Primeira mensagem pelo WhatsApp da loja para quem respondeu a campanha (no outro número):
 * repete a resposta do cliente para ele saber por que está sendo chamado. A equipe pode editar
 * antes de enviar; a assinatura (*Nome:*) entra no envio, como no Atendimento.
 */
export function mensagemDeRetorno({
  nome,
  resposta,
  respondidaEm,
}: {
  nome: string | null
  resposta: string | null
  respondidaEm: string
}) {
  const saudacao = nomeParaSaudacao(nome)
  const dia = quando(respondidaEm)
  const texto = resposta?.trim() ?? ''

  let contexto: string
  if (!texto || texto === '[reação]') {
    contexto = texto ? `Você reagiu ${dia} à mensagem que te enviamos.` : `Você respondeu ${dia} à mensagem que te enviamos.`
  } else if (ACAO_SEM_TEXTO[texto]) {
    contexto = `Você ${ACAO_SEM_TEXTO[texto]} ${dia} em resposta à mensagem que te enviamos.`
  } else {
    contexto = `Você respondeu ${dia} à mensagem que te enviamos:\n${citar(texto)}`
  }

  return [
    `Oi${saudacao ? `, ${saudacao}` : ''}! Tudo bem?`,
    contexto,
    'Estou te chamando por aqui, que é o nosso WhatsApp de atendimento. Como posso te ajudar?',
  ].join('\n\n')
}
