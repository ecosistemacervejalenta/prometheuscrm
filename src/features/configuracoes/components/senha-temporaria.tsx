'use client'

import { KeyRound, X } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { useAvisos } from '@/components/ui/toaster'
import type { Credenciais } from '@/lib/acoes'

import { gerarNovaSenha } from '../actions'

/** Senha temporária recém-gerada, com a mensagem pronta para repassar. Ela não aparece de novo. */
export function PainelCredenciais({ credenciais }: { credenciais: Credenciais }) {
  const primeiroNome = credenciais.nome.trim().split(/\s+/)[0]
  return (
    <div className="rounded-2xl border border-volt-100 bg-volt-50 p-4">
      <p className="tipo-rotulo text-volt-700">Senha temporária</p>
      <p className="tipo-dado mt-1 text-2xl font-semibold tracking-wide text-ink select-all">{credenciais.senha}</p>
      <p className="mt-0.5 truncate text-[13px] text-suave">{credenciais.email}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton texto={credenciais.mensagem} rotulo="Copiar mensagem" variante="escuro" />
        <CopyButton texto={credenciais.senha} rotulo="Copiar senha" />
      </div>
      <p className="mt-3 text-[13px] text-suave">
        Envie para {primeiroNome} (ex.: WhatsApp). No primeiro acesso a senha pessoal é criada. Esta senha não aparece de
        novo: se perder, use “Nova senha” na lista de membros.
      </p>
    </div>
  )
}

/** Gera outra senha temporária para o membro e mostra numa janela. */
export function BotaoNovaSenha({ id, nome, className }: { id: string; nome: string; className?: string }) {
  const [pendente, iniciar] = useTransition()
  const [credenciais, setCredenciais] = useState<Credenciais | null>(null)
  const janela = useRef<HTMLDialogElement>(null)
  const avisar = useAvisos()

  useEffect(() => {
    if (credenciais) janela.current?.showModal()
  }, [credenciais])

  return (
    <>
      <Button
        variante="secundario"
        tamanho="sm"
        className={className}
        carregando={pendente}
        onClick={() => {
          if (!window.confirm(`Gerar uma nova senha temporária para ${nome}? A senha atual deixa de funcionar.`)) return
          iniciar(async () => {
            const resultado = await gerarNovaSenha(id)
            if (resultado.credenciais) setCredenciais(resultado.credenciais)
            else if (resultado.mensagem) avisar(resultado.mensagem, 'erro')
          })
        }}
      >
        <KeyRound aria-hidden />
        Nova senha
      </Button>
      <dialog
        ref={janela}
        onClose={() => setCredenciais(null)}
        aria-label={`Nova senha temporária de ${nome}`}
        className="m-auto w-[min(440px,calc(100vw-32px))] rounded-cartao bg-superficie p-5 text-ink shadow-flutuante backdrop:bg-ink/50"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="tipo-h3">Nova senha de {nome}</h2>
            <p className="mt-1 text-[13px] text-suave">A senha anterior já não funciona mais.</p>
          </div>
          <Button variante="fantasma" tamanho="icone" aria-label="Fechar" onClick={() => janela.current?.close()}>
            <X aria-hidden />
          </Button>
        </div>
        {credenciais && <PainelCredenciais credenciais={credenciais} />}
      </dialog>
    </>
  )
}
