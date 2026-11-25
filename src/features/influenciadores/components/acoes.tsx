'use client'

import { Ban, KeyRound, MessageCircle, UserPlus, X } from 'lucide-react'
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'

import { Button, ButtonExternal } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { useAvisos } from '@/components/ui/toaster'
import type { Credenciais, EstadoAcao } from '@/lib/acoes'
import { linkWhatsapp } from '@/lib/whatsapp'

import { cancelarComissao, criarAcessoInfluenciador, novaSenhaInfluenciador } from '../actions'

/** Janela simples (dialog nativo): abre quando `aberta` vira true e avisa ao fechar. */
function Janela({ aberta, aoFechar, titulo, descricao, children }: { aberta: boolean; aoFechar: () => void; titulo: string; descricao?: string; children: ReactNode }) {
  const janela = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = janela.current
    if (!d) return
    if (aberta && !d.open) d.showModal()
    if (!aberta && d.open) d.close()
  }, [aberta])

  return (
    <dialog
      ref={janela}
      onClose={aoFechar}
      aria-label={titulo}
      className="m-auto w-[min(460px,calc(100vw-32px))] rounded-cartao bg-superficie p-5 text-ink shadow-flutuante backdrop:bg-ink/50"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="tipo-h3">{titulo}</h2>
          {descricao && <p className="mt-1 text-[13px] text-suave">{descricao}</p>}
        </div>
        <Button variante="fantasma" tamanho="icone" aria-label="Fechar" onClick={() => janela.current?.close()}>
          <X aria-hidden />
        </Button>
      </div>
      {aberta && children}
    </dialog>
  )
}

/**
 * Cria o login do Portal ou gera outra senha temporária e mostra a mensagem pronta para mandar.
 * A senha aparece uma vez só — como no cadastro da equipe.
 */
export function BotaoAcessoAoPortal({ id, nome, whatsapp, temAcesso }: { id: string; nome: string; whatsapp: string | null; temAcesso: boolean }) {
  const [pendente, iniciar] = useTransition()
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null)
  const avisar = useAvisos()
  const primeiroNome = nome.trim().split(/\s+/)[0]

  const gerar = () => {
    if (temAcesso && !window.confirm(`Gerar uma nova senha temporária para ${nome}? A senha atual deixa de funcionar.`)) return
    iniciar(async () => {
      const resultado: EstadoAcao = temAcesso ? await novaSenhaInfluenciador(id) : await criarAcessoInfluenciador(id)
      if (resultado.credenciais) setCredenciais(resultado.credenciais)
      else if (resultado.mensagem) avisar(resultado.mensagem, 'erro')
    })
  }

  return (
    <>
      <Button variante={temAcesso ? 'secundario' : 'escuro'} tamanho="sm" carregando={pendente} onClick={gerar}>
        {temAcesso ? <KeyRound aria-hidden /> : <UserPlus aria-hidden />}
        {temAcesso ? 'Nova senha' : 'Criar acesso ao Portal'}
      </Button>
      <Janela
        aberta={Boolean(credenciais)}
        aoFechar={() => setCredenciais(null)}
        titulo={temAcesso ? `Nova senha de ${primeiroNome}` : `Acesso de ${primeiroNome} criado`}
        descricao="Esta senha não aparece de novo. Envie agora — no primeiro acesso ela é trocada por uma senha pessoal."
      >
        {credenciais && (
          <div className="rounded-2xl border border-volt-100 bg-volt-50 p-4">
            <p className="tipo-rotulo text-volt-700">Senha temporária</p>
            <p className="tipo-dado mt-1 text-2xl font-semibold tracking-wide text-ink select-all">{credenciais.senha}</p>
            <p className="mt-0.5 truncate text-[13px] text-suave">{credenciais.email}</p>
            <pre className="mt-3 max-h-40 overflow-y-auto rounded-xl bg-superficie p-3 font-sans text-[13px] leading-5 whitespace-pre-wrap text-ink/80 ring-1 ring-linha">
              {credenciais.mensagem}
            </pre>
            <div className="mt-3 flex flex-wrap gap-2">
              {whatsapp && (
                <ButtonExternal href={linkWhatsapp(whatsapp, credenciais.mensagem)} variante="whatsapp" tamanho="sm">
                  <MessageCircle aria-hidden /> Enviar no WhatsApp
                </ButtonExternal>
              )}
              <CopyButton texto={credenciais.mensagem} rotulo="Copiar mensagem" variante="escuro" />
              <CopyButton texto={credenciais.senha} rotulo="Copiar senha" />
            </div>
          </div>
        )}
      </Janela>
    </>
  )
}

/** Cancela a comissão de uma venda, com o motivo (ex.: compra do próprio influenciador). */
export function BotaoCancelarComissao({ vendaId, pedido }: { vendaId: string; pedido: string }) {
  const [aberta, setAberta] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [pendente, iniciar] = useTransition()
  const avisar = useAvisos()

  return (
    <>
      <Button variante="fantasma" tamanho="sm" onClick={() => setAberta(true)} title="Cancelar a comissão desta venda">
        <Ban aria-hidden />
        <span className="sr-only lg:not-sr-only">Cancelar</span>
      </Button>
      <Janela
        aberta={aberta}
        aoFechar={() => setAberta(false)}
        titulo={`Cancelar a comissão do pedido ${pedido}`}
        descricao="A venda continua na lista, mas não gera comissão — mesmo que o pedido seja atualizado na Shopify. Dá para desfazer depois."
      >
        <label htmlFor={`motivo-${vendaId}`} className="mb-1.5 block text-[13px] font-semibold">
          Motivo
        </label>
        <textarea
          id={`motivo-${vendaId}`}
          rows={3}
          maxLength={300}
          autoFocus
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: compra feita pelo próprio influenciador."
          className="block w-full rounded-xl border border-linha bg-superficie px-3.5 py-2.5 text-[15px] leading-6 outline-none placeholder:text-sutil focus:border-ink focus:ring-4 focus:ring-volt/25"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variante="fantasma" onClick={() => setAberta(false)}>Voltar</Button>
          <Button
            variante="perigo"
            carregando={pendente}
            disabled={motivo.trim().length < 3}
            onClick={() =>
              iniciar(async () => {
                const resultado = await cancelarComissao(vendaId, motivo)
                avisar(resultado.mensagem ?? 'Pronto.', resultado.ok === false ? 'erro' : 'sucesso')
                if (resultado.ok !== false) {
                  setAberta(false)
                  setMotivo('')
                }
              })
            }
          >
            Cancelar comissão
          </Button>
        </div>
      </Janela>
    </>
  )
}
