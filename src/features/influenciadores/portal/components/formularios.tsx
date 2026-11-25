'use client'

import { Check, Copy, Save, Share2 } from 'lucide-react'
import { useState } from 'react'

import { ActionForm, SubmitButton } from '@/components/form/action-form'
import { Field, Input, Select } from '@/components/form/fields'
import { Button } from '@/components/ui/button'
import { formatarWhatsapp } from '@/lib/format'
import { cn } from '@/lib/utils'

import { TIPOS_CHAVE_PIX } from '../../rotulos'
import { definirSenhaDoPortal, entrarNoPortal, salvarContaDoPortal } from '../actions'
import type { InfluenciadorDoPortal } from '../sessao'

export function FormularioEntrarNoPortal() {
  return (
    <ActionForm action={entrarNoPortal} className="space-y-4">
      <Field label="E-mail" name="email">
        <Input name="email" type="email" autoComplete="email" inputMode="email" placeholder="voce@email.com" autoFocus />
      </Field>
      <Field label="Senha" name="senha">
        <Input name="senha" type="password" autoComplete="current-password" placeholder="••••••••" />
      </Field>
      <SubmitButton bloco tamanho="lg">
        Entrar
      </SubmitButton>
      <p className="text-center text-sm text-suave">Esqueceu a senha? Peça uma nova para a loja pelo WhatsApp.</p>
    </ActionForm>
  )
}

export function FormularioSenhaDoPortal({ primeiroAcesso = false }: { primeiroAcesso?: boolean }) {
  return (
    <ActionForm action={definirSenhaDoPortal} className="space-y-4" limparAoConcluir>
      <Field label="Nova senha" name="senha" dica="Mínimo de 8 caracteres.">
        <Input name="senha" type="password" autoComplete="new-password" autoFocus={primeiroAcesso} />
      </Field>
      <Field label="Confirme a senha" name="confirmacao">
        <Input name="confirmacao" type="password" autoComplete="new-password" />
      </Field>
      <SubmitButton bloco={primeiroAcesso} tamanho={primeiroAcesso ? 'lg' : undefined} variante={primeiroAcesso ? 'primario' : 'escuro'}>
        {primeiroAcesso ? 'Salvar e entrar' : 'Trocar senha'}
      </SubmitButton>
    </ActionForm>
  )
}

/** Contato e PIX. Cupom, comissão e e-mail de login são da loja (mostrados só para leitura). */
export function FormularioContaDoPortal({ eu }: { eu: InfluenciadorDoPortal }) {
  return (
    <ActionForm action={salvarContaDoPortal} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="WhatsApp" name="whatsapp">
          <Input name="whatsapp" type="tel" autoComplete="tel" defaultValue={eu.whatsapp ? formatarWhatsapp(eu.whatsapp) : ''} placeholder="(11) 98765-4321" />
        </Field>
        <Field label="Instagram" name="instagram">
          <Input name="instagram" autoComplete="off" spellCheck={false} defaultValue={eu.instagram ? `@${eu.instagram}` : ''} placeholder="@usuario" />
        </Field>
      </div>

      <div className="rounded-2xl border border-linha p-4">
        <p className="tipo-h3 text-[15px]">PIX para receber as comissões</p>
        <p className="mt-0.5 text-[13px] text-suave">Confira com atenção: é para esta chave que a loja faz os repasses.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-6">
          <Field label="Tipo da chave" name="tipo_chave_pix" className="sm:col-span-2">
            <Select name="tipo_chave_pix" defaultValue={eu.tipo_chave_pix ?? ''}>
              <option value="">Escolha</option>
              {Object.entries(TIPOS_CHAVE_PIX).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>{rotulo}</option>
              ))}
            </Select>
          </Field>
          <Field label="Chave PIX" name="chave_pix" className="sm:col-span-4">
            <Input name="chave_pix" autoComplete="off" spellCheck={false} defaultValue={eu.chave_pix ?? ''} />
          </Field>
          <Field label="Nome de quem recebe" name="nome_recebedor" className="sm:col-span-4" dica="Como aparece no seu banco.">
            <Input name="nome_recebedor" autoComplete="name" defaultValue={eu.nome_recebedor ?? ''} />
          </Field>
          <Field label="CPF ou CNPJ" name="documento" className="sm:col-span-2">
            <Input name="documento" inputMode="numeric" autoComplete="off" defaultValue={eu.documento ?? ''} />
          </Field>
        </div>
      </div>

      <SubmitButton>
        <Save aria-hidden /> Salvar
      </SubmitButton>
    </ActionForm>
  )
}

function BotaoCopiar({ texto, rotulo, className }: { texto: string; rotulo: string; className?: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <Button
      variante="primario"
      className={className}
      onClick={async () => {
        await navigator.clipboard.writeText(texto)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 2000)
      }}
    >
      {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copiado ? 'Copiado!' : rotulo}
    </Button>
  )
}

/**
 * O cupom em destaque (é o que o influenciador mais usa): copiar o código, copiar o link que já
 * aplica o desconto e compartilhar (no celular abre a folha de compartilhamento do aparelho).
 */
export function CartaoDoCupom({
  cupom,
  ativo,
  desconto,
  comissao,
  link,
  loja,
}: {
  cupom: string
  ativo: boolean
  desconto: string
  comissao: string
  link: string | null
  loja: string
}) {
  const texto = link
    ? `Use meu cupom ${cupom} e ganhe ${desconto} de desconto na ${loja}: ${link}`
    : `Use meu cupom ${cupom} e ganhe ${desconto} de desconto na ${loja}.`

  const compartilhar = async () => {
    if (typeof navigator.share === 'function') {
      await navigator.share({ text: texto }).catch(() => undefined)
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <section className="relative overflow-hidden rounded-cartao bg-ink p-5 text-white sm:p-6" aria-label="Seu cupom">
      <div className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-volt/15 blur-2xl" aria-hidden />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <p className="tipo-rotulo text-white/50">Seu cupom</p>
          <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium', ativo ? 'bg-volt/15 text-volt' : 'bg-white/10 text-white/60')}>
            <span className={cn('size-1.5 rounded-full', ativo ? 'bg-volt' : 'bg-white/40')} aria-hidden />
            {ativo ? 'Ativo na loja' : 'Desligado'}
          </span>
        </div>
        <p className="tipo-numero mt-2 text-[40px] leading-[44px] tracking-wide break-all select-all sm:text-[52px] sm:leading-[56px]">{cupom}</p>
        <p className="mt-2 text-[14px] text-white/70">
          <b className="font-semibold text-white">{desconto}</b> de desconto para quem usar · você ganha <b className="font-semibold text-volt">{comissao}</b> de comissão
        </p>

        {link && (
          <div className="mt-4 rounded-xl bg-white/[0.07] p-3">
            <p className="tipo-rotulo text-white/50">Link que já aplica o cupom</p>
            <p className="tipo-dado mt-1 text-[13px] break-all text-white/90 select-all">{link}</p>
          </div>
        )}

        <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
          <BotaoCopiar texto={link ?? cupom} rotulo={link ? 'Copiar link' : 'Copiar cupom'} />
          {link && (
            <Button variante="secundario" className="border-white/15 bg-white/10 text-white hover:border-white/25 hover:bg-white/15" onClick={() => navigator.clipboard.writeText(cupom)}>
              <Copy aria-hidden /> Copiar só o código
            </Button>
          )}
          <Button variante="secundario" className="border-white/15 bg-white/10 text-white hover:border-white/25 hover:bg-white/15" onClick={compartilhar}>
            <Share2 aria-hidden /> Compartilhar
          </Button>
        </div>
      </div>
    </section>
  )
}
