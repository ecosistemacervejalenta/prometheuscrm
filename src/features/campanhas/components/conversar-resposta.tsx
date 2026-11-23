'use client'

import { MessageCircle, MessagesSquare, Send, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { classesControle } from '@/components/form/fields'
import { Button } from '@/components/ui/button'
import { useAvisos } from '@/components/ui/toaster'
import { conversarComResposta } from '@/features/atendimento/actions'
import { formatarWhatsapp } from '@/lib/format'
import { cn } from '@/lib/utils'

import { mensagemDeRetorno } from '../conversa'
import type { RespostaCampanha } from '../queries'

/**
 * "Conversar" de uma resposta da campanha: chama o cliente pelo WhatsApp de atendimento da loja
 * (não pelo número das campanhas). A janela mostra a mensagem pronta, com a resposta dele citada,
 * para a equipe conferir ou editar; ao enviar, a conversa abre no Atendimento.
 */
export function ConversarResposta({
  resposta,
}: {
  resposta: Pick<RespostaCampanha, 'id' | 'nome' | 'whatsapp' | 'resposta' | 'respondida_em' | 'conversa_aberta'>
}) {
  const janela = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const avisar = useAvisos()
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [acao, setAcao] = useState<'enviar' | 'abrir' | null>(null)
  const [pendente, iniciar] = useTransition()
  const quem = resposta.nome ?? formatarWhatsapp(resposta.whatsapp)
  const aberta = resposta.conversa_aberta

  function abrirJanela() {
    setTexto(
      mensagemDeRetorno({ nome: resposta.nome, resposta: resposta.resposta, respondidaEm: resposta.respondida_em ?? new Date().toISOString() }),
    )
    setErro(null)
    janela.current?.showModal()
  }

  function conversar(enviar: boolean) {
    setErro(null)
    setAcao(enviar ? 'enviar' : 'abrir')
    iniciar(async () => {
      const r = await conversarComResposta(resposta.id, enviar ? texto : null)
      if (!r.atendimentoId) {
        setErro(r.mensagem ?? 'Não foi possível abrir a conversa.')
        return
      }
      // Envio que falhou fica na conversa com "Tentar de novo": abre do mesmo jeito.
      if (!r.ok) avisar(r.mensagem ?? 'A mensagem não foi enviada.', 'erro')
      else if (enviar) avisar('Mensagem enviada pelo WhatsApp da loja.')
      router.push(`/atendimento?aba=abertos&id=${r.atendimentoId}`)
    })
  }

  return (
    <>
      <Button variante="whatsapp" tamanho="sm" onClick={abrirJanela}>
        <MessageCircle /> Conversar
      </Button>
      <dialog
        ref={janela}
        aria-labelledby={`conversar-${resposta.id}`}
        onCancel={(e) => pendente && e.preventDefault()}
        className="m-auto w-[min(560px,calc(100vw-32px))] rounded-cartao bg-superficie p-0 text-ink shadow-flutuante backdrop:bg-ink/50"
      >
        <div className="flex items-start justify-between gap-3 border-b border-linha px-5 pt-4 pb-3.5">
          <div className="min-w-0">
            <h2 id={`conversar-${resposta.id}`} className="tipo-h3 truncate">
              Conversar com {quem}
            </h2>
            <p className="mt-0.5 text-[13px] text-suave">
              {resposta.nome ? `${formatarWhatsapp(resposta.whatsapp)} · ` : ''}pelo WhatsApp de atendimento da loja
            </p>
          </div>
          <Button variante="fantasma" tamanho="icone" aria-label="Fechar" disabled={pendente} onClick={() => janela.current?.close()}>
            <X aria-hidden />
          </Button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {aberta && (
            <p className="flex gap-2 rounded-xl bg-papel px-3.5 py-2.5 text-[13px] text-suave">
              <MessagesSquare className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {aberta.comigo
                  ? 'Você já tem uma conversa aberta com este cliente no Atendimento. A mensagem entra nela.'
                  : aberta.responsavel
                    ? `${aberta.responsavel} já está atendendo este cliente no Atendimento. A mensagem entra na mesma conversa, que continua com ${aberta.responsavel}.`
                    : 'Este cliente já está na fila do Atendimento. Ao conversar, o atendimento fica com você.'}
              </span>
            </p>
          )}
          <div>
            <label htmlFor={`texto-${resposta.id}`} className="mb-1.5 block text-[13px] font-semibold">
              Mensagem
            </label>
            <textarea
              id={`texto-${resposta.id}`}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={9}
              maxLength={4000}
              className={cn(classesControle, 'resize-y py-2.5 leading-6')}
            />
            <p className="mt-1.5 text-[13px] text-suave">
              A resposta do cliente vai citada para ele saber do que se trata. Sai com o seu nome em negrito no começo, como no
              Atendimento, e a conversa continua lá.
            </p>
          </div>
          {erro && (
            <p role="alert" className="rounded-xl bg-perigo-50 px-3.5 py-2.5 text-[13px] font-medium text-perigo">
              {erro}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-linha px-5 py-3.5 sm:flex-row sm:justify-end">
          <Button variante="secundario" disabled={pendente} carregando={pendente && acao === 'abrir'} onClick={() => conversar(false)}>
            <MessagesSquare /> Só abrir a conversa
          </Button>
          <Button
            variante="whatsapp"
            disabled={pendente || !texto.trim()}
            carregando={pendente && acao === 'enviar'}
            onClick={() => conversar(true)}
          >
            <Send /> Enviar e abrir conversa
          </Button>
        </div>
      </dialog>
    </>
  )
}
