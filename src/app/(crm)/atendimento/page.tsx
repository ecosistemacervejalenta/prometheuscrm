import type { Metadata } from 'next'
import { MessagesSquare, Settings } from 'lucide-react'
import { notFound } from 'next/navigation'

import { Alert } from '@/components/ui/alert'
import { ButtonLink } from '@/components/ui/button'
import { AtualizacaoAoVivo } from '@/features/atendimento/components/ao-vivo'
import { Conversa } from '@/features/atendimento/components/conversa'
import { hrefConversa, ListaConversas } from '@/features/atendimento/components/lista-conversas'
import {
  ABAS_ATENDIMENTO,
  configAtendimento,
  contagensAtendimento,
  listarAtendimentos,
  listarEquipe,
  listarEtiquetas,
  obterConversa,
  type AbaAtendimento,
} from '@/features/atendimento/queries'
import { uazapiConfigurada } from '@/features/atendimento/uazapi'
import { exigirEquipe } from '@/lib/auth'
import { cn, param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Atendimento' }

export default async function PaginaAtendimento({ searchParams }: PageProps<'/atendimento'>) {
  const { perfil } = await exigirEquipe()
  const busca = await searchParams
  const abaParam = param(busca.aba) as AbaAtendimento | undefined
  const aba: AbaAtendimento = abaParam && ABAS_ATENDIMENTO.includes(abaParam) ? abaParam : 'abertos'
  const termo = param(busca.q)
  const id = param(busca.id)

  const [itens, contagens, conversa, equipe, config, etiquetas] = await Promise.all([
    listarAtendimentos({ aba, busca: termo }),
    contagensAtendimento(),
    id ? obterConversa(id) : null,
    listarEquipe(),
    configAtendimento(),
    id ? listarEtiquetas() : [],
  ])
  if (id && !conversa) notFound()

  return (
    <>
      {!uazapiConfigurada() && (
        <Alert tom="alerta" titulo="WhatsApp ainda não conectado" className="mb-3">
          Cadastre UAZAPI_URL e UAZAPI_TOKEN na Vercel e ative o webhook em Configurações › Integrações.
        </Alert>
      )}
      <div
        className={cn(
          'flex overflow-hidden rounded-cartao border border-linha bg-superficie shadow-cartao',
          // Altura da tela menos barra superior/abas (celular) ou margens (desktop).
          'h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-var(--altura-abas)-5rem)] lg:h-[calc(100dvh-4rem)]',
        )}
      >
        <aside className={cn('w-full shrink-0 border-r border-linha lg:flex lg:w-[320px]', conversa ? 'hidden' : 'flex')}>
          <ListaConversas
            itens={itens}
            aba={aba}
            busca={termo}
            selecionado={id}
            contagens={contagens}
            meuId={perfil.id}
            avisos={<AtualizacaoAoVivo pendentes={contagens.pendentes} />}
          />
        </aside>

        {conversa ? (
          <Conversa
            key={conversa.atendimento.id}
            conversa={conversa}
            equipe={equipe}
            etiquetas={etiquetas}
            meuId={perfil.id}
            pastas={config.pastas}
            pastaPadraoId={config.pastaLeadsId}
            nomesAssinatura={config.assinatura ? config.nomesAssinatura : null}
            voltarHref={hrefConversa(aba, termo)}
          />
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center bg-papel px-6 text-center lg:flex">
            <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-volt-50 text-volt-700">
              <MessagesSquare className="size-6" aria-hidden />
            </span>
            <p className="tipo-h3">Escolha uma conversa</p>
            <p className="mt-1 max-w-sm text-sm text-suave">
              Mensagens novas entram na <strong className="text-ink">Fila</strong>. Responder ou clicar em Assumir coloca o atendimento com você.
            </p>
            {perfil.papel === 'admin' && (
              <ButtonLink href="/configuracoes/integracoes#whatsapp" tamanho="sm" className="mt-5">
                <Settings /> Configurar WhatsApp
              </ButtonLink>
            )}
          </div>
        )}
      </div>
    </>
  )
}
