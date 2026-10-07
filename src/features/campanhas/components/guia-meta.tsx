'use client'

import { Check, ChevronDown, Clock, ExternalLink, Megaphone, MessagesSquare, ShieldCheck } from 'lucide-react'
import { useMemo, useSyncExternalStore, type ReactNode } from 'react'

import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonExternal } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CopyButton } from '@/components/ui/copy-button'
import { cn } from '@/lib/utils'

import { VARIAVEIS_META, type NomeVariavelMeta, type StatusMeta } from '../meta'

/**
 * Passo a passo para conectar o WhatsApp oficial (API Cloud da Meta).
 * Passos com variável na Vercel se confirmam sozinhos; os demais a equipe marca
 * como feitos (lembrado neste navegador).
 */

const CHAVE_MARCADOS = 'prometheus:guia-meta'
const EVENTO_MARCADOS = 'prometheus:guia-meta'

function lerMarcados(): string {
  try {
    return window.localStorage.getItem(CHAVE_MARCADOS) ?? ''
  } catch {
    return ''
  }
}

function inscrever(aviso: () => void) {
  window.addEventListener(EVENTO_MARCADOS, aviso)
  window.addEventListener('storage', aviso)
  return () => {
    window.removeEventListener(EVENTO_MARCADOS, aviso)
    window.removeEventListener('storage', aviso)
  }
}

function useMarcados() {
  const texto = useSyncExternalStore(inscrever, lerMarcados, () => '')
  const marcados = useMemo(() => new Set(texto.split(',').filter(Boolean)), [texto])
  function alternar(chave: string) {
    const novos = new Set(marcados)
    if (novos.has(chave)) novos.delete(chave)
    else novos.add(chave)
    try {
      window.localStorage.setItem(CHAVE_MARCADOS, [...novos].join(','))
    } catch {
      // armazenamento indisponível: a marcação vale só até recarregar
    }
    window.dispatchEvent(new Event(EVENTO_MARCADOS))
  }
  return { marcados, alternar }
}

type Passo = {
  chave: string
  titulo: string
  resumo: string
  /** Variáveis que confirmam o passo sozinhas quando estão na Vercel. */
  variaveis?: NomeVariavelMeta[]
  /** Passo que só se faz junto com a integração (ainda não disponível). */
  proximaEtapa?: boolean
  links?: Array<{ href: string; rotulo: string }>
  conteudo: ReactNode
}

function Codigo({ children }: { children: ReactNode }) {
  return <code className="tipo-dado rounded bg-papel px-1 text-[12px] text-ink ring-1 ring-linha">{children}</code>
}

function Lista({ children }: { children: ReactNode }) {
  return <ol className="list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-suave">{children}</ol>
}

function CampoCopiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-papel p-3">
      <span className="tipo-rotulo w-full text-suave">{rotulo}</span>
      <code className="tipo-dado flex-1 text-[13px] break-all">{valor}</code>
      <CopyButton texto={valor} />
    </div>
  )
}

export function GuiaMeta({
  status,
  urlWebhook,
  tokenVerificacao,
  ehAdmin,
}: {
  status: StatusMeta
  urlWebhook: string
  /** O token já cadastrado na Vercel ou, se ainda não houver, uma sugestão gerada agora. Só para admins. */
  tokenVerificacao: string | null
  ehAdmin: boolean
}) {
  const { marcados, alternar } = useMarcados()

  const blocoVercel = VARIAVEIS_META.map((v) =>
    `${v.nome}=${v.nome === 'META_WEBHOOK_VERIFY_TOKEN' ? (tokenVerificacao ?? '') : v.exemplo}`,
  ).join('\n')

  const passos: Passo[] = [
    {
      chave: 'portfolio',
      titulo: 'Portfólio empresarial na Meta',
      resumo: 'A conta da empresa no Meta Business — a mesma dos anúncios, se já existir.',
      links: [
        { href: 'https://business.facebook.com/settings', rotulo: 'Abrir o Meta Business' },
        { href: 'https://business.facebook.com/settings/security', rotulo: 'Verificação da empresa' },
      ],
      conteudo: (
        <Lista>
          <li>Entre em business.facebook.com com o Facebook do responsável pela loja.</li>
          <li>Use o portfólio que já existe (o dos anúncios) ou crie um com o nome da empresa.</li>
          <li>
            Recomendado: em <strong>Central de Segurança › Verificação da empresa</strong>, envie os dados do CNPJ. Empresa verificada
            sobe de limite mais rápido e pode ter o nome exibido no WhatsApp.
          </li>
        </Lista>
      ),
    },
    {
      chave: 'app',
      titulo: 'App na Meta for Developers',
      resumo: 'É por ele que o CRM conversa com a API do WhatsApp.',
      links: [{ href: 'https://developers.facebook.com/apps', rotulo: 'Abrir Meus apps' }],
      conteudo: (
        <Lista>
          <li>
            Em developers.facebook.com, clique em <strong>Criar app</strong>.
          </li>
          <li>
            Escolha o uso <strong>Conectar-se com clientes pelo WhatsApp</strong> (ou o tipo <strong>Empresa</strong>) e selecione o
            portfólio do passo 1.
          </li>
          <li>
            No painel do app, adicione o produto <strong>WhatsApp</strong>. A Meta cria a conta do WhatsApp Business e um número de
            teste.
          </li>
        </Lista>
      ),
    },
    {
      chave: 'numero',
      titulo: 'Número exclusivo para campanhas',
      resumo: 'Um chip só para os disparos — o número do Atendimento continua como está.',
      links: [{ href: 'https://business.facebook.com/wa/manage/phone-numbers/', rotulo: 'Números no Gerenciador do WhatsApp' }],
      conteudo: (
        <div className="space-y-3">
          <Alert tom="alerta" titulo="Não use o número do Atendimento">
            Um número ligado à API oficial não pode ficar ativo no aplicativo do WhatsApp nem na uazapi. O número da loja segue no
            Atendimento; as campanhas saem por um número novo.
          </Alert>
          <Lista>
            <li>Separe um chip novo (ou um número que não esteja em nenhum WhatsApp).</li>
            <li>
              No app: <strong>WhatsApp › Configuração da API</strong> (API Setup) › <strong>Adicionar número de telefone</strong>.
              Confirme pelo código por SMS ou ligação.
            </li>
            <li>Escolha o nome de exibição (ex.: o nome da loja) — a Meta revisa o nome antes de liberar.</li>
          </Lista>
        </div>
      ),
    },
    {
      chave: 'pagamento',
      titulo: 'Forma de pagamento',
      resumo: 'Sem cartão cadastrado, a Meta não entrega mensagens de marketing.',
      links: [
        { href: 'https://business.facebook.com/wa/manage/home/', rotulo: 'Abrir o Gerenciador do WhatsApp' },
        { href: 'https://developers.facebook.com/docs/whatsapp/pricing', rotulo: 'Tabela de preços' },
      ],
      conteudo: (
        <Lista>
          <li>
            No Gerenciador do WhatsApp, abra <strong>Visão geral › Adicionar forma de pagamento</strong> e cadastre um cartão.
          </li>
          <li>A cobrança é por mensagem de marketing entregue, em dólar, direto da Meta.</li>
        </Lista>
      ),
    },
    {
      chave: 'token',
      titulo: 'Token permanente',
      resumo: 'A “senha” que o CRM usa para enviar pela API. Gerada num usuário do sistema.',
      variaveis: ['META_WHATSAPP_TOKEN'],
      links: [{ href: 'https://business.facebook.com/settings/system-users', rotulo: 'Abrir Usuários do sistema' }],
      conteudo: (
        <div className="space-y-3">
          <Lista>
            <li>
              Em <strong>Configurações do negócio › Usuários › Usuários do sistema</strong>, clique em <strong>Adicionar</strong>. Nome
              “Prometheus CRM”, função <strong>Administrador</strong>.
            </li>
            <li>
              <strong>Atribuir ativos</strong>: o app do passo 2 e a conta do WhatsApp, os dois com <strong>controle total</strong>.
            </li>
            <li>
              <strong>Gerar novo token</strong>: escolha o app, validade <strong>Nunca</strong> e as permissões{' '}
              <Codigo>whatsapp_business_messaging</Codigo> e <Codigo>whatsapp_business_management</Codigo>.
            </li>
            <li>
              Copie o token na hora (a Meta mostra uma vez só) — ele vai em <Codigo>META_WHATSAPP_TOKEN</Codigo>.
            </li>
          </Lista>
          <p className="text-[13px] text-suave">
            Não use o token temporário da tela “Configuração da API”: ele vence em 24 horas.
          </p>
        </div>
      ),
    },
    {
      chave: 'ids',
      titulo: 'IDs do número e da conta',
      resumo: 'Três códigos que dizem ao CRM qual número e qual app usar.',
      variaveis: ['META_WHATSAPP_PHONE_NUMBER_ID', 'META_WHATSAPP_WABA_ID', 'META_APP_SECRET'],
      links: [{ href: 'https://developers.facebook.com/apps', rotulo: 'Abrir o app' }],
      conteudo: (
        <Lista>
          <li>
            No app, abra <strong>WhatsApp › Configuração da API</strong> e selecione o número de campanhas em “De” (From).
          </li>
          <li>
            Copie a <strong>Identificação do número de telefone</strong> (Phone number ID) → <Codigo>META_WHATSAPP_PHONE_NUMBER_ID</Codigo>.
          </li>
          <li>
            Copie a <strong>Identificação da conta do WhatsApp Business</strong> (WhatsApp Business Account ID) →{' '}
            <Codigo>META_WHATSAPP_WABA_ID</Codigo>.
          </li>
          <li>
            Em <strong>Configurações do app › Básico</strong>, clique em Mostrar na <strong>Chave secreta do app</strong> (App secret) →{' '}
            <Codigo>META_APP_SECRET</Codigo>.
          </li>
        </Lista>
      ),
    },
    {
      chave: 'vercel',
      titulo: 'Cadastrar na Vercel',
      resumo: 'Os valores ficam guardados no servidor, nunca no navegador.',
      variaveis: VARIAVEIS_META.map((v) => v.nome),
      links: [{ href: 'https://vercel.com/dashboard', rotulo: 'Abrir a Vercel' }],
      conteudo: (
        <div className="space-y-3">
          <ul className="divide-y divide-linha overflow-hidden rounded-xl border border-linha">
            {VARIAVEIS_META.map((v) => (
              <li key={v.nome} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="tipo-dado block text-[12px]">{v.nome}</span>
                  <span className="block text-[12px] text-suave">{v.descricao}</span>
                </span>
                {status.variaveis[v.nome] ? (
                  <Badge tom="sucesso" ponto>Encontrada</Badge>
                ) : (
                  <Badge tom="alerta" ponto>Falta</Badge>
                )}
              </li>
            ))}
          </ul>
          {ehAdmin ? (
            <>
              <div className="overflow-hidden rounded-xl bg-ink">
                <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
                  <span className="tipo-rotulo text-white/60">Bloco para colar na Vercel</span>
                  <CopyButton texto={blocoVercel} rotulo="Copiar bloco" />
                </div>
                <pre className="tipo-dado overflow-x-auto p-3 text-[12px] leading-5 text-white">{blocoVercel}</pre>
              </div>
              <Lista>
                <li>
                  Na Vercel, abra o projeto <strong>prometheus-crm › Settings › Environment Variables</strong>.
                </li>
                <li>
                  Cole o bloco no primeiro campo (Key) — a Vercel separa as variáveis sozinha. Troque os textos “cole_…” pelos valores dos
                  passos 5 e 6 e marque o ambiente <strong>Production</strong>.
                </li>
                <li>
                  O <Codigo>META_WEBHOOK_VERIFY_TOKEN</Codigo> já vem preenchido
                  {status.variaveis.META_WEBHOOK_VERIFY_TOKEN ? ' com o valor cadastrado' : ' com uma senha gerada agora'} — guarde-o: ele
                  será usado na Meta no passo 8.
                </li>
                <li>
                  Em <strong>Deployments</strong>, faça o <strong>Redeploy</strong> e recarregue esta página: as variáveis ficam verdes.
                </li>
              </Lista>
            </>
          ) : (
            <p className="text-[13px] text-suave">Somente administradores veem o bloco com os valores para colar na Vercel.</p>
          )}
        </div>
      ),
    },
    {
      chave: 'webhook',
      titulo: 'Webhook: entregas e respostas',
      resumo: 'A Meta avisa o CRM quando cada mensagem é entregue, lida ou respondida.',
      proximaEtapa: true,
      conteudo: (
        <div className="space-y-3">
          <p>
            Este passo é ligado junto com o envio das campanhas. Quando estiver disponível, no app abra{' '}
            <strong>WhatsApp › Configuração</strong> e use:
          </p>
          <CampoCopiavel rotulo="URL de retorno (Callback URL)" valor={urlWebhook} />
          <p className="text-[13px] text-suave">
            Token de verificação: o valor de <Codigo>META_WEBHOOK_VERIFY_TOKEN</Codigo>. Campos assinados:{' '}
            <Codigo>messages</Codigo> e <Codigo>message_template_status_update</Codigo>.
          </p>
        </div>
      ),
    },
  ]

  const feito = (p: Passo) =>
    !p.proximaEtapa && (p.variaveis ? p.variaveis.every((v) => status.variaveis[v]) : marcados.has(p.chave))
  const disponiveis = passos.filter((p) => !p.proximaEtapa)
  const concluidos = disponiveis.filter(feito).length
  const atual = passos.findIndex((p) => !p.proximaEtapa && !feito(p))

  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardHeader
          titulo="WhatsApp oficial (API da Meta)"
          descricao="Número exclusivo para as Campanhas: as mensagens saem pelos servidores da Meta, sem risco de banimento por disparo."
          acoes={
            status.configurado ? (
              <Badge tom="sucesso" ponto>Variáveis cadastradas</Badge>
            ) : (
              <Badge tom="alerta" ponto>Não conectado</Badge>
            )
          }
        />
        <CardContent className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
              <span className="font-semibold">Progresso da conexão</span>
              <span className="tipo-dado text-suave">
                {concluidos} de {disponiveis.length} passos
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-papel ring-1 ring-linha ring-inset">
              <div className="h-full rounded-full bg-volt transition-[width]" style={{ width: `${(concluidos / disponiveis.length) * 100}%` }} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex gap-3 rounded-xl bg-papel p-3">
              <MessagesSquare className="mt-0.5 size-4 shrink-0 text-suave" aria-hidden />
              <p className="text-[13px]">
                <strong>Atendimento</strong>
                <span className="block text-suave">Número da loja (uazapi): conversas com os clientes, como hoje.</span>
              </p>
            </div>
            <div className="flex gap-3 rounded-xl bg-volt-50 p-3">
              <Megaphone className="mt-0.5 size-4 shrink-0 text-volt-700" aria-hidden />
              <p className="text-[13px]">
                <strong>Campanhas</strong>
                <span className="block text-suave">Número próprio na API oficial: disparos para listas, com limite e qualidade da Meta.</span>
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-3 border-t border-linha pt-4">
            {['Número', 'Qualidade', 'Limite por dia'].map((rotulo) => (
              <div key={rotulo}>
                <dt className="tipo-rotulo text-suave">{rotulo}</dt>
                <dd className="tipo-dado mt-0.5 text-suave">—</dd>
              </div>
            ))}
          </dl>
          <p className="-mt-2 text-[12px] text-sutil">Número, qualidade e limite aparecem aqui quando a integração for ligada.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader titulo="Passo a passo da conexão" descricao="Siga na ordem. Leva cerca de 30 minutos, mais a análise da Meta." />
        <ol className="border-t border-linha">
          {passos.map((p, i) => {
            const ok = feito(p)
            const automatico = Boolean(p.variaveis)
            return (
              <li key={p.chave} className="border-b border-linha last:border-b-0">
                <details open={i === atual} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-papel/60 lg:px-5 [&::-webkit-details-marker]:hidden">
                    <span
                      className={cn(
                        'tipo-dado grid size-7 shrink-0 place-items-center rounded-full text-[12px]',
                        ok ? 'bg-volt text-ink' : p.proximaEtapa ? 'bg-papel text-sutil ring-1 ring-linha' : 'bg-ink text-white',
                      )}
                    >
                      {ok ? <Check className="size-4" aria-label="Concluído" /> : p.proximaEtapa ? <Clock className="size-3.5" aria-hidden /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-[15px] font-semibold', p.proximaEtapa && 'text-suave')}>{p.titulo}</span>
                      <span className="block text-[13px] text-suave">{p.resumo}</span>
                    </span>
                    {p.proximaEtapa ? (
                      <Badge tom="neutro">Próxima etapa</Badge>
                    ) : ok ? (
                      <Badge tom="sucesso" className="max-sm:hidden">Feito</Badge>
                    ) : null}
                    <ChevronDown className="size-4 shrink-0 text-sutil transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="space-y-4 px-4 pb-5 pl-14 text-sm lg:px-5 lg:pl-15">
                    {p.conteudo}
                    <div className="flex flex-wrap items-center gap-2">
                      {p.links?.map((l) => (
                        <ButtonExternal key={l.href} href={l.href} tamanho="sm">
                          <ExternalLink /> {l.rotulo}
                        </ButtonExternal>
                      ))}
                      {!p.proximaEtapa &&
                        (automatico ? (
                          <span className="text-[12px] text-suave">
                            {ok ? 'Confirmado: o servidor encontrou as variáveis.' : 'Fica verde sozinho quando as variáveis estiverem na Vercel.'}
                          </span>
                        ) : (
                          <Button tamanho="sm" variante={ok ? 'fantasma' : 'escuro'} onClick={() => alternar(p.chave)}>
                            <Check /> {ok ? 'Desmarcar' : 'Marcar como feito'}
                          </Button>
                        ))}
                    </div>
                  </div>
                </details>
              </li>
            )
          })}
        </ol>
      </Card>

      <Card>
        <CardHeader
          titulo={
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-sucesso" aria-hidden /> Para o número nunca ser bloqueado
            </span>
          }
          descricao="A Meta mede a qualidade pelas reações dos clientes. Estes cuidados mantêm a qualidade alta e o limite subindo."
        />
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li>
              <strong>Envie para quem conhece a loja</strong> — clientes, Grupo VIP e quem pediu para receber. Listas compradas geram
              denúncias.
            </li>
            <li>
              <strong>Deixe o botão “Não quero receber”</strong> em toda campanha: sair é melhor do que bloquear ou denunciar.
            </li>
            <li>
              <strong>Comece pequeno</strong> — o limite sobe sozinho (250 → 2 mil → 10 mil → 100 mil → ilimitado por dia) quando a
              qualidade está boa e você usa o limite atual.
            </li>
            <li>
              <strong>Não repita a mesma pessoa em seguida</strong>: espace as campanhas e varie a mensagem.
            </li>
            <li>
              <strong>Qualidade caiu para “Baixa”?</strong> Pause, revise a lista e a mensagem antes de disparar de novo.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
