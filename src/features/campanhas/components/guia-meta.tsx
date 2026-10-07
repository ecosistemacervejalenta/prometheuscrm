'use client'

import { Check, ChevronDown, ExternalLink, ShieldCheck } from 'lucide-react'
import { useMemo, useSyncExternalStore, type ReactNode } from 'react'

import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, ButtonExternal } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CopyButton } from '@/components/ui/copy-button'
import { formatarDataHora } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { ConexaoMeta } from '../meta'

/**
 * Passo a passo para conectar o WhatsApp oficial (API Cloud da Meta).
 * Os passos que o CRM consegue conferir (credenciais salvas, webhook recebendo)
 * se confirmam sozinhos; os demais a equipe marca como feitos (lembrado neste navegador).
 */

const CHAVE_MARCADOS = 'prometheus:guia-meta'
const EVENTO_MARCADOS = 'prometheus:guia-meta'
const CAMPOS_WEBHOOK = ['messages', 'message_template_status_update', 'user_preferences', 'business_capability_update', 'phone_number_quality_update']

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
  /** Confirmado pelo CRM (true/false); undefined = a equipe marca como feito. */
  confirmado?: boolean
  dicaConfirmacao?: string
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

export function GuiaMeta({ conexao, urlWebhook, ehAdmin }: { conexao: ConexaoMeta; urlWebhook: string; ehAdmin: boolean }) {
  const { marcados, alternar } = useMarcados()
  const credenciaisOk = conexao.configurado && !conexao.ultimo_erro

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
            Escolha o caso de uso <strong>Conectar-se com clientes pelo WhatsApp</strong> (Connect with customers through WhatsApp) e
            selecione o portfólio do passo 1.
          </li>
          <li>
            Em <strong>Casos de uso › Personalizar › Conectar no WhatsApp</strong>, clique em <strong>Começar a usar a API</strong>. Na
            seção <strong>Configuração da API</strong> (API Setup), escolha uma conta do WhatsApp Business ou crie uma nova.
          </li>
          <li>
            Quando terminar, publique o app (modo <strong>Ao vivo</strong> no painel): alguns avisos do webhook só chegam com o app
            publicado.
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
              No app: <strong>Casos de uso › Personalizar › Configuração da API</strong> (API Setup) ›{' '}
              <strong>Adicionar número de telefone</strong>. Confirme pelo código por SMS ou ligação.
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
          <li>
            Cobre em <strong>reais (BRL)</strong>: no Billing Hub, deixe o país de faturamento (Sold-To) como Brasil. Desde julho de 2026
            contas do Brasil podem ser em BRL, e a partir de julho de 2027 a Meta não entrega mensagens de contas brasileiras em outra moeda.
          </li>
          <li>A cobrança é por mensagem de marketing entregue, direto da Meta.</li>
        </Lista>
      ),
    },
    {
      chave: 'token',
      titulo: 'Token permanente',
      resumo: 'A “senha” que o CRM usa para enviar pela API. Gerada num usuário do sistema.',
      confirmado: conexao.configurado,
      dicaConfirmacao: 'Fica verde quando o token for salvo no formulário de conexão, acima.',
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
              <Codigo>business_management</Codigo>, <Codigo>whatsapp_business_management</Codigo> e{' '}
              <Codigo>whatsapp_business_messaging</Codigo>.
            </li>
            <li>
              Copie o token na hora (a Meta mostra uma vez só) e cole no campo <strong>Token permanente</strong> do formulário acima.
            </li>
          </Lista>
          <p className="text-[13px] text-suave">Não use o token temporário da tela “Configuração da API”: ele vence em 24 horas.</p>
        </div>
      ),
    },
    {
      chave: 'ids',
      titulo: 'IDs e chave secreta → salvar no CRM',
      resumo: 'Os códigos do número, da conta e do app. O CRM confere tudo na Meta ao salvar.',
      confirmado: credenciaisOk,
      dicaConfirmacao: conexao.ultimo_erro
        ? 'A Meta recusou os dados salvos — veja o erro no quadro de conexão.'
        : 'Fica verde quando a conexão for salva e conferida.',
      links: [{ href: 'https://developers.facebook.com/apps', rotulo: 'Abrir o app' }],
      conteudo: (
        <Lista>
          <li>
            No app, abra <strong>Casos de uso › Personalizar › Configuração da API</strong> e selecione o número de campanhas em “De”
            (From).
          </li>
          <li>
            Copie a <strong>Identificação do número de telefone</strong> (Phone number ID) → campo <strong>ID do número</strong>.
          </li>
          <li>
            Copie a <strong>Identificação da conta do WhatsApp Business</strong> (WhatsApp Business Account ID) → campo{' '}
            <strong>ID da conta do WhatsApp</strong>.
          </li>
          <li>
            Em <strong>Configurações do app › Básico</strong>, copie o <strong>ID do app</strong> e, em Mostrar, a{' '}
            <strong>Chave secreta do app</strong> (App secret).
          </li>
          <li>
            No campo <strong>PIN do número</strong>: se o número já tem confirmação em duas etapas, use o PIN dela; se nunca teve, os 6
            dígitos que você digitar viram o PIN (guarde-o). A Meta aceita no máximo 10 tentativas de registro em 72 horas.
          </li>
          <li>
            Clique em <strong>Salvar e testar conexão</strong>. O token e a chave ficam criptografados no banco — ninguém consegue vê-los
            de novo pela tela.
          </li>
        </Lista>
      ),
    },
    {
      chave: 'webhook',
      titulo: 'Webhook: entregas, leituras e respostas',
      resumo: 'A Meta avisa o CRM quando cada mensagem é entregue, lida ou respondida e quando aprova a mensagem.',
      confirmado: Boolean(conexao.webhook_recebido_em),
      dicaConfirmacao: conexao.webhook_recebido_em
        ? `Último aviso da Meta em ${formatarDataHora(conexao.webhook_recebido_em)}.`
        : 'Fica verde quando chegar o primeiro aviso da Meta.',
      conteudo: (
        <div className="space-y-3">
          <p>
            No app, abra <strong>Casos de uso › Personalizar › Configuração</strong> (Configuration), clique em <strong>Editar</strong>{' '}
            no Webhook e cole:
          </p>
          <CampoCopiavel rotulo="URL de retorno (Callback URL)" valor={urlWebhook} />
          {ehAdmin && conexao.token_verificacao ? (
            <CampoCopiavel rotulo="Token de verificação (Verify token)" valor={conexao.token_verificacao} />
          ) : (
            <p className="text-[13px] text-suave">O token de verificação aparece aqui para administradores.</p>
          )}
          <p>
            Clique em <strong>Verificar e salvar</strong>. Depois, em <strong>Campos do webhook</strong>, assine:{' '}
            {CAMPOS_WEBHOOK.map((c, i) => (
              <span key={c}>
                {i > 0 && ', '}
                <Codigo>{c}</Codigo>
              </span>
            ))}
            .
          </p>
          <p className="text-[13px] text-suave">
            A ligação do app com a sua conta do WhatsApp o CRM já faz ao salvar a conexão.
          </p>
        </div>
      ),
    },
  ]

  const feito = (p: Passo) => p.confirmado ?? marcados.has(p.chave)
  const concluidos = passos.filter(feito).length
  const atual = passos.findIndex((p) => !feito(p))

  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardHeader
          titulo="Passo a passo da conexão"
          descricao="Siga na ordem. Leva cerca de 30 minutos, mais a análise da Meta."
          acoes={
            <span className="tipo-dado text-[13px] text-suave">
              {concluidos} de {passos.length}
            </span>
          }
        />
        <div className="px-4 pb-4 lg:px-5">
          <div className="h-2 overflow-hidden rounded-full bg-papel ring-1 ring-linha ring-inset">
            <div className="h-full rounded-full bg-volt transition-[width]" style={{ width: `${(concluidos / passos.length) * 100}%` }} />
          </div>
        </div>
        <ol className="border-t border-linha">
          {passos.map((p, i) => {
            const ok = feito(p)
            const automatico = p.confirmado !== undefined
            return (
              <li key={p.chave} className="border-b border-linha last:border-b-0">
                <details open={i === atual} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 hover:bg-papel/60 lg:px-5 [&::-webkit-details-marker]:hidden">
                    <span
                      className={cn(
                        'tipo-dado grid size-7 shrink-0 place-items-center rounded-full text-[12px]',
                        ok ? 'bg-volt text-ink' : 'bg-ink text-white',
                      )}
                    >
                      {ok ? <Check className="size-4" aria-label="Concluído" /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{p.titulo}</span>
                      <span className="block text-[13px] text-suave">{p.resumo}</span>
                    </span>
                    {ok && <Badge tom="sucesso" className="max-sm:hidden">Feito</Badge>}
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
                      {automatico ? (
                        <span className="text-[12px] text-suave">{p.dicaConfirmacao}</span>
                      ) : (
                        <Button tamanho="sm" variante={ok ? 'fantasma' : 'escuro'} onClick={() => alternar(p.chave)}>
                          <Check /> {ok ? 'Desmarcar' : 'Marcar como feito'}
                        </Button>
                      )}
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
              <strong>Comece pequeno</strong> — contas novas falam com 250 contatos por dia. Para chegar a 2 mil, verifique a empresa ou
              some 2 mil mensagens entregues em 30 dias; depois o limite sobe sozinho (10 mil → 100 mil → ilimitado) quando a qualidade
              está boa e você usa o limite atual.
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
