import 'server-only'

import { exigirEquipe } from '@/lib/auth'

import { SEM_CONEXAO, type IdMarketplace, type StatusMarketplace } from './canais'

export type EntregaAlertaMl = 'aguardando' | 'na_fila' | 'tentando' | 'entregue' | 'falhou' | 'sem_webhook'

export type AlertaMlNaTela = {
  id: string
  tipo: 'pergunta' | 'mensagem' | 'reclamacao' | 'teste'
  titulo: string
  link: string | null
  criado_em: string
  entrega: EntregaAlertaMl
  erroEntrega: string | null
}

/** Últimos alertas do Mercado Livre mandados ao grupo, com a entrega ao n8n. */
export async function ultimosAlertasMercadoLivre(limite = 8): Promise<AlertaMlNaTela[]> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase
    .from('ml_alertas')
    .select('id, tipo, titulo, link, criado_em, evento:eventos_integracao!ml_alertas_evento_id_fkey(status, tentativas, ultimo_erro)')
    .order('criado_em', { ascending: false })
    .limit(limite)
  if (error) throw error
  return (data ?? []).map((a) => {
    const evento = a.evento as { status: string; tentativas: number; ultimo_erro: string | null } | null
    const entrega: EntregaAlertaMl = !evento
      ? 'aguardando'
      : evento.status === 'enviado'
        ? 'entregue'
        : evento.status === 'ignorado'
          ? 'sem_webhook'
          : evento.status === 'erro'
            ? 'falhou'
            : evento.tentativas > 0
              ? 'tentando'
              : 'na_fila'
    return {
      id: a.id,
      tipo: a.tipo as AlertaMlNaTela['tipo'],
      titulo: a.titulo,
      link: a.link,
      criado_em: a.criado_em,
      entrega,
      erroEntrega: evento?.ultimo_erro ?? null,
    }
  })
}

/** Status das conexões com Mercado Livre e Shopee (sem tokens nem chaves), com a sessão do usuário. */
export async function statusMarketplaces(): Promise<Record<IdMarketplace, StatusMarketplace>> {
  const { supabase } = await exigirEquipe()
  const { data, error } = await supabase.rpc('status_marketplaces')
  if (error) throw error
  const linhas = (data ?? {}) as Partial<Record<IdMarketplace, Partial<StatusMarketplace>>>
  return {
    mercado_livre: { ...SEM_CONEXAO, ...linhas.mercado_livre },
    shopee: { ...SEM_CONEXAO, ...linhas.shopee },
  }
}
