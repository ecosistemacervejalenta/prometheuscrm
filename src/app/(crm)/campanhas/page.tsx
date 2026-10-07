import type { Metadata } from 'next'
import Link from 'next/link'
import { Megaphone, MessageSquareText, Plus, Send, Upload } from 'lucide-react'

import { Alert } from '@/components/ui/alert'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { statusMeta } from '@/features/campanhas/queries'
import { exigirEquipe } from '@/lib/auth'

export const metadata: Metadata = { title: 'Campanhas' }

const COMO_FUNCIONA = [
  { icone: Upload, titulo: 'Suba a lista', texto: 'CSV, Excel, números colados ou uma lista do Banco de Leads.' },
  { icone: MessageSquareText, titulo: 'Escreva a mensagem', texto: 'Com foto, {nome} e botões. A Meta aprova antes do 1º envio.' },
  { icone: Send, titulo: 'Dispare', texto: 'Agora ou agendado, pelo WhatsApp oficial — sem risco de banimento.' },
]

export default async function PaginaCampanhas() {
  await exigirEquipe()
  const meta = statusMeta()

  return (
    <>
      <PageHeader
        contexto="WhatsApp oficial · API da Meta"
        titulo="Campanhas"
        descricao="Disparos de WhatsApp para listas de contatos, pelo número oficial da loja na Meta."
        acoes={
          <ButtonLink href="/campanhas/nova" variante="primario">
            <Plus /> Nova campanha
          </ButtonLink>
        }
      />

      <div className="space-y-5 lg:space-y-6">
        {!meta.configurado && (
          <Alert tom="alerta" titulo="WhatsApp oficial ainda não conectado">
            Você já pode montar campanhas; o disparo é liberado depois da conexão com a Meta.{' '}
            <Link href="/configuracoes/whatsapp-oficial" className="font-semibold underline underline-offset-2">
              Ver o passo a passo
            </Link>
          </Alert>
        )}

        <ol className="grid gap-3 sm:grid-cols-3">
          {COMO_FUNCIONA.map((p, i) => (
            <li key={p.titulo} className="flex gap-3 rounded-cartao border border-linha bg-superficie p-4 shadow-cartao">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-volt-50 text-volt-700">
                <p.icone className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">
                  <span className="tipo-dado mr-1.5 text-[13px] text-suave">{i + 1}.</span>
                  {p.titulo}
                </p>
                <p className="text-[13px] text-suave">{p.texto}</p>
              </div>
            </li>
          ))}
        </ol>

        <Card>
          <EmptyState
            icone={Megaphone}
            titulo="Nenhuma campanha ainda"
            descricao="As campanhas disparadas aparecem aqui com o número de entregues, lidas e respostas."
            acao={
              <ButtonLink href="/campanhas/nova">
                <Plus /> Montar a primeira campanha
              </ButtonLink>
            }
          />
        </Card>
      </div>
    </>
  )
}
