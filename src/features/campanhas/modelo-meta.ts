import { createHash } from 'node:crypto'

import { slugificar } from '@/lib/utils'

import { TEXTO_BOTAO_SAIR, valorDoNome, VARIAVEL_NOME } from './mensagem'

/**
 * Campanha → modelo (template) da Meta: o corpo para a análise e os componentes
 * de cada envio. Mensagens viram categoria MARKETING em pt_BR, com {nome} como
 * variável nomeada ({{nome}}).
 */

export const IDIOMA_MODELO = 'pt_BR'
/** Payload do botão "Não quero receber" (volta no webhook quando o contato toca). */
export const PAYLOAD_SAIR = 'prometheus_sair'

export type CampanhaModelo = {
  id: string
  nome: string
  texto: string
  nome_padrao: string
  rodape: string | null
  botao_texto: string | null
  botao_url: string | null
  botao_sair: boolean
  imagem_path: string | null
}

const temNome = (c: CampanhaModelo) => c.texto.includes(VARIAVEL_NOME)

/** Nome único na conta: só minúsculas, números e _ (regra da Meta). */
export function nomeDoModelo(c: Pick<CampanhaModelo, 'id' | 'nome'>): string {
  const base = slugificar(c.nome).replace(/-/g, '_').slice(0, 40) || 'campanha'
  return `${base}_${c.id.replace(/-/g, '').slice(0, 8)}`
}

/**
 * Identidade do conteúdo do modelo (sem a foto em si: ela muda a cada envio).
 * Campanhas com a mesma assinatura reaproveitam um modelo já aprovado — sem nova análise.
 */
export function assinaturaDoModelo(c: CampanhaModelo): string {
  const conteudo = JSON.stringify([c.texto.trim(), c.rodape?.trim() || null, c.botao_texto, c.botao_url, c.botao_sair, Boolean(c.imagem_path)])
  return createHash('sha256').update(conteudo).digest('hex')
}

/** Botões na ordem do modelo: link primeiro, depois "Não quero receber" (posição usada no envio). */
function botoes(c: CampanhaModelo) {
  const lista: Array<{ type: 'URL'; text: string; url: string } | { type: 'QUICK_REPLY'; text: string }> = []
  if (c.botao_texto && c.botao_url) lista.push({ type: 'URL', text: c.botao_texto, url: c.botao_url })
  if (c.botao_sair) lista.push({ type: 'QUICK_REPLY', text: TEXTO_BOTAO_SAIR })
  return lista
}

/** Corpo do POST /{waba}/message_templates. `handleImagem` = foto de exemplo já enviada à Meta. */
export function corpoDoModelo(c: CampanhaModelo, nome: string, handleImagem: string | null) {
  const componentes: unknown[] = []
  if (handleImagem) componentes.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [handleImagem] } })
  componentes.push({
    type: 'BODY',
    text: c.texto.trim().replaceAll(VARIAVEL_NOME, '{{nome}}'),
    ...(temNome(c) && { example: { body_text_named_params: [{ param_name: 'nome', example: 'Mariana' }] } }),
  })
  if (c.rodape?.trim()) componentes.push({ type: 'FOOTER', text: c.rodape.trim() })
  const lista = botoes(c)
  if (lista.length > 0) componentes.push({ type: 'BUTTONS', buttons: lista })

  return {
    name: nome,
    language: IDIOMA_MODELO,
    category: 'MARKETING',
    ...(temNome(c) && { parameter_format: 'NAMED' }),
    components: componentes,
  }
}

/** Componentes de um envio (foto, nome e payload do botão de sair). */
export function componentesDoEnvio(c: CampanhaModelo, nomeContato: string | null, urlImagem: string | null): unknown[] {
  const componentes: unknown[] = []
  if (c.imagem_path && urlImagem) componentes.push({ type: 'header', parameters: [{ type: 'image', image: { link: urlImagem } }] })
  if (temNome(c)) {
    componentes.push({ type: 'body', parameters: [{ type: 'text', parameter_name: 'nome', text: valorDoNome(nomeContato, c.nome_padrao) }] })
  }
  const indiceSair = botoes(c).findIndex((b) => b.type === 'QUICK_REPLY')
  if (indiceSair >= 0) {
    componentes.push({ type: 'button', sub_type: 'quick_reply', index: String(indiceSair), parameters: [{ type: 'payload', payload: PAYLOAD_SAIR }] })
  }
  return componentes
}
