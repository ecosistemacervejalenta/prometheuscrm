import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Calculator, ExternalLink, MessageCircle, Pause, Pencil, Play, RefreshCw, Search, ShoppingBag, UserRound } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Alert } from '@/components/ui/alert'
import { ButtonExternal, ButtonLink } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { CopyButton } from '@/components/ui/copy-button'
import { EmptyState } from '@/components/ui/empty-state'
import { Kpi } from '@/components/ui/kpi'
import { PageHeader } from '@/components/ui/page-header'
import { Dado, Dados } from '@/features/configuracoes/components/blocos'
import { buscarVendasAntigas, conferirCupom, mudarStatusInfluenciador, registrarPagamento, removerAcessoInfluenciador } from '@/features/influenciadores/actions'
import { BotaoAcessoAoPortal } from '@/features/influenciadores/components/acoes'
import { FormularioPagamento } from '@/features/influenciadores/components/formularios'
import { GraficoDeVendas } from '@/features/influenciadores/components/grafico-de-vendas'
import { Cupom, SeletorDePeriodo, SeloCupomNaShopify, SeloStatusInfluenciador } from '@/features/influenciadores/components/selos'
import { TabelaDeVendas } from '@/features/influenciadores/components/tabela-de-vendas'
import { integracaoDoPrograma, listarPagamentos, listarVendas, obterInfluenciador, regrasDoPrograma, resumoDoPrograma } from '@/features/influenciadores/queries'
import { arroba, formatarPercentual, linkDeDivulgacao, STATUS_INFLUENCIADOR, TIPOS_CHAVE_PIX, type TipoChavePix } from '@/features/influenciadores/rotulos'
import { intervalosDoPeriodo, periodoValido } from '@/features/vendas/periodos'
import { hojeISO } from '@/lib/datas'
import { formatarCnpj, formatarCpf, formatarData, formatarDataHora, formatarHaQuanto, formatarMoeda, formatarNumero, formatarWhatsapp } from '@/lib/format'
import { param } from '@/lib/utils'
import { linkWhatsapp } from '@/lib/whatsapp'

export const metadata: Metadata = { title: 'Influenciador' }

const VENDAS_NA_FICHA = 12

export default async function PaginaInfluenciador({ params, searchParams }: PageProps<'/influenciadores/[id]'>) {
  const { id } = await params
  const busca = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const periodo = periodoValido(param(busca.periodo) ?? '30d')
  const hoje = hojeISO()
  const { atual, descricao } = intervalosDoPeriodo(periodo, hoje)

  const i = await obterInfluenciador(id)
  if (!i?.id || !i.nome || !i.cupom) notFound()

  const [regras, integracao, resumo, { vendas, total: totalDeVendas }, pagamentos] = await Promise.all([
    regrasDoPrograma(),
    integracaoDoPrograma(),
    resumoDoPrograma(atual.inicio, atual.fim, id),
    listarVendas({ influenciadorId: id }),
    listarPagamentos({ influenciadorId: id, limite: 50 }),
  ])

  const status = i.status ?? 'ativo'
  const link = linkDeDivulgacao(regras.loja_url, i.cupom)
  const disponivel = Number(i.saldo_disponivel ?? 0)
  const temAcesso = Boolean(i.usuario_id)
  const documento = i.documento ? (i.documento.length === 14 ? formatarCnpj(i.documento) : formatarCpf(i.documento)) : null
  const adminDaShopify = integracao.loja ? `https://admin.shopify.com/store/${integracao.loja}/discounts` : null

  return (
    <>
      <PageHeader
        titulo={i.nome}
        contexto={
          <span className="flex flex-wrap items-center gap-2">
            <Cupom codigo={i.cupom} apagado={status !== 'ativo'} />
            <SeloStatusInfluenciador status={status} />
            {arroba(i.instagram) && <span>{arroba(i.instagram)}</span>}
          </span>
        }
        voltar={{ href: '/influenciadores/lista', rotulo: 'Influenciadores' }}
        acoes={
          <>
            {i.whatsapp && (
              <ButtonExternal href={linkWhatsapp(i.whatsapp)} variante="whatsapp">
                <MessageCircle /> WhatsApp
              </ButtonExternal>
            )}
            <ButtonLink href={`/influenciadores/${id}/editar`}>
              <Pencil /> Editar
            </ButtonLink>
          </>
        }
      />

      {param(busca.criado) && (
        <Alert tom="sucesso" titulo="Influenciador cadastrado" className="mb-5 lg:mb-6">
          {i.cupom_situacao === 'ativo'
            ? `O cupom ${i.cupom} já vale na loja. `
            : 'Confira abaixo a situação do cupom na Shopify. '}
          {temAcesso ? '' : 'Falta só criar o acesso ao Portal e mandar a senha para ele.'}
        </Alert>
      )}
      {Number(i.alertas ?? 0) > 0 && (
        <Alert tom="alerta" titulo="Pedido estornado depois do repasse" className="mb-5 lg:mb-6">
          {i.alertas} venda(s) já paga(s) teve(tiveram) cancelamento ou devolução na Shopify. Se for o caso, desconte o valor no próximo repasse
          (campo “ajuste”). As vendas estão marcadas na lista abaixo.
        </Alert>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:mb-6 lg:grid-cols-4 lg:gap-4">
        <Kpi rotulo="Vendido" valor={formatarMoeda(i.vendido)} detalhe={`${formatarNumero(i.pedidos)} pedido(s) no total`} />
        <Kpi rotulo="Comissão gerada" valor={formatarMoeda(i.comissao_total)} detalhe={`${formatarPercentual(i.comissao_percentual)} sobre os produtos`} />
        <Kpi
          rotulo="A liberar"
          valor={formatarMoeda(Number(i.saldo_a_liberar ?? 0) + Number(i.saldo_aguardando ?? 0))}
          detalhe={Number(i.saldo_aguardando ?? 0) > 0 ? `${formatarMoeda(i.saldo_aguardando)} aguardando pagamento` : `carência de ${regras.carencia_dias} dia(s)`}
        />
        <Kpi rotulo="A pagar agora" valor={formatarMoeda(disponivel)} detalhe={`já repassado: ${formatarMoeda(i.recebido)}`} destaque={disponivel > 0} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr] lg:gap-6">
        <div className="min-w-0 space-y-5 lg:space-y-6">
          <Card>
            <CardHeader titulo="Vendas no período" descricao={descricao} acoes={<SeletorDePeriodo ativo={periodo} caminho={`/influenciadores/${id}`} opcoes={['30d', '90d', 'mes', 'mes_anterior']} />} />
            <CardContent>
              <div className="mb-4 grid grid-cols-3 gap-3">
                {[
                  { rotulo: 'Pedidos', valor: formatarNumero(resumo.periodo.pedidos) },
                  { rotulo: 'Vendido', valor: formatarMoeda(resumo.periodo.vendido) },
                  { rotulo: 'Comissão', valor: formatarMoeda(resumo.periodo.comissao) },
                ].map((n) => (
                  <div key={n.rotulo} className="rounded-xl bg-papel p-3">
                    <p className="tipo-rotulo text-suave">{n.rotulo}</p>
                    <p className="tipo-numero mt-0.5 truncate text-[18px] leading-6 lg:text-[20px]">{n.valor}</p>
                  </div>
                ))}
              </div>
              <GraficoDeVendas serie={resumo.serie} intervalo={atual} vazio="Nenhum pedido usou este cupom no período." />
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              titulo="Últimas vendas"
              descricao={totalDeVendas > VENDAS_NA_FICHA ? `As ${VENDAS_NA_FICHA} mais recentes de ${formatarNumero(totalDeVendas)}.` : undefined}
              acoes={
                <>
                  {integracao.pedidos && (
                    <ActionButton acao={buscarVendasAntigas.bind(null, id)} titulo={`Reler na Shopify os pedidos com o cupom desde ${formatarData(i.contar_desde)}`}>
                      <Search aria-hidden /> Buscar na Shopify
                    </ActionButton>
                  )}
                  {totalDeVendas > 0 && <ButtonLink href={`/influenciadores/vendas?influenciador=${id}`} tamanho="sm">Ver todas</ButtonLink>}
                </>
              }
            />
            {vendas.length === 0 ? (
              <EmptyState
                icone={ShoppingBag}
                titulo="Nenhuma venda com este cupom ainda"
                descricao={`Contam os pedidos feitos a partir de ${formatarData(i.contar_desde)}. Eles entram sozinhos, alguns minutos depois de fechados na loja.`}
              />
            ) : (
              <TabelaDeVendas vendas={vendas.slice(0, VENDAS_NA_FICHA)} comAcoes />
            )}
          </Card>

          <Card>
            <div id="repasse" className="scroll-mt-24">
              <CardHeader titulo="Registrar repasse" descricao="Pague por PIX e registre aqui: as comissões liberadas são quitadas de uma vez." />
              <CardContent>
                <FormularioPagamento
                  acao={registrarPagamento.bind(null, id)}
                  disponivel={disponivel}
                  vendas={Number(i.vendas_disponiveis ?? 0)}
                  chavePix={i.chave_pix}
                  hoje={hoje}
                />
              </CardContent>
            </div>
            {pagamentos.length > 0 && (
              <div className="border-t border-linha">
                <p className="tipo-rotulo px-4 pt-4 pb-2 text-suave lg:px-5">Repasses feitos</p>
                <ul className="divide-y divide-linha">
                  {pagamentos.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-4 px-4 py-3 lg:px-5">
                      <div className="min-w-0">
                        <p className="tipo-dado">{formatarData(p.pago_em)}</p>
                        <p className="text-[13px] text-suave">
                          {p.vendas} venda(s) · comissões {formatarMoeda(p.comissoes)}
                          {Number(p.ajuste) !== 0 && ` · ajuste ${formatarMoeda(p.ajuste)} (${p.ajuste_motivo})`}
                          {p.observacoes && ` · ${p.observacoes}`}
                        </p>
                      </div>
                      <p className="tipo-dado shrink-0 font-semibold">{formatarMoeda(p.total)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-5 lg:space-y-6">
          <Card>
            <CardHeader titulo="Cupom" acoes={<SeloCupomNaShopify situacao={i.cupom_situacao} />} />
            <CardContent className="space-y-4">
              <div className="rounded-2xl bg-ink p-4 text-white">
                <p className="tipo-rotulo text-white/50">Código</p>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="tipo-numero truncate text-[28px] leading-9 tracking-wide">{i.cupom}</p>
                  <CopyButton texto={i.cupom} rotulo="Copiar" />
                </div>
                <p className="mt-2 text-[13px] text-white/60">
                  {formatarPercentual(i.desconto_percentual)} de desconto para o cliente · {formatarPercentual(i.comissao_percentual)} de comissão
                </p>
              </div>

              {i.cupom_detalhe && (
                <Alert tom={i.cupom_situacao === 'erro' ? 'erro' : 'alerta'}>{i.cupom_detalhe}</Alert>
              )}

              {link ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-papel p-3">
                  <span className="tipo-rotulo w-full text-suave">Link de divulgação (já aplica o cupom)</span>
                  <code className="tipo-dado min-w-0 flex-1 text-[13px] break-all">{link}</code>
                  <CopyButton texto={link} />
                </div>
              ) : (
                <p className="text-[13px] text-suave">
                  Informe o endereço da loja em Ajustes para mostrar o link de divulgação (abre a loja com o cupom já aplicado).
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <ActionButton acao={conferirCupom.bind(null, id)}>
                  <RefreshCw aria-hidden /> {i.cupom_situacao === 'ativo' || i.cupom_situacao === 'inativo' ? 'Conferir na Shopify' : 'Criar na Shopify'}
                </ActionButton>
                <ButtonLink href={`/influenciadores/${id}/editar#simulacao`} tamanho="sm">
                  <Calculator aria-hidden /> Simular um pedido
                </ButtonLink>
                {adminDaShopify && (
                  <ButtonExternal href={adminDaShopify} tamanho="sm">
                    <ExternalLink aria-hidden /> Descontos na Shopify
                  </ButtonExternal>
                )}
              </div>
              {i.cupom_conferido_em && <p className="tipo-dado text-[12px] text-suave">Conferido {formatarHaQuanto(i.cupom_conferido_em)}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader titulo="Acesso ao Portal" descricao={temAcesso ? 'O influenciador entra com o e-mail e a senha dele.' : 'Ainda sem login: crie o acesso e mande a senha.'} />
            <CardContent className="space-y-4">
              <Dados colunas={2}>
                <Dado rotulo="Login" largo>{i.email}</Dado>
                <Dado rotulo="Situação">
                  {!temAcesso ? 'Sem acesso' : i.trocar_senha ? 'Senha temporária enviada' : 'Ativo'}
                </Dado>
                <Dado rotulo="Criado em">{temAcesso ? formatarData(i.acesso_criado_em) : '—'}</Dado>
                <Dado rotulo="Último acesso">{i.ultimo_acesso_em ? formatarDataHora(i.ultimo_acesso_em) : 'nunca entrou'}</Dado>
              </Dados>
              <div className="flex flex-wrap gap-2">
                <BotaoAcessoAoPortal id={id} nome={i.nome} whatsapp={i.whatsapp} temAcesso={temAcesso} />
                {temAcesso && (
                  <ActionButton
                    acao={removerAcessoInfluenciador.bind(null, id)}
                    variante="perigo"
                    confirmar={`Remover o acesso de ${i.nome} ao Portal? As vendas e os repasses continuam guardados.`}
                  >
                    Remover acesso
                  </ActionButton>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader titulo="Dados" acoes={<ButtonLink href={`/influenciadores/${id}/editar`} tamanho="sm"><UserRound /> Editar</ButtonLink>} />
            <CardContent className="space-y-4">
              <Dados colunas={2}>
                <Dado rotulo="WhatsApp">{i.whatsapp ? formatarWhatsapp(i.whatsapp) : '—'}</Dado>
                <Dado rotulo="Instagram">
                  {i.instagram ? (
                    <a href={`https://instagram.com/${i.instagram}`} target="_blank" rel="noopener noreferrer" className="font-medium text-volt-700 hover:text-ink">
                      @{i.instagram}
                    </a>
                  ) : (
                    '—'
                  )}
                </Dado>
                <Dado rotulo="Chave PIX" largo>
                  {i.chave_pix ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="tipo-dado break-all">{i.chave_pix}</span>
                      <span className="text-[12px] text-suave">({TIPOS_CHAVE_PIX[i.tipo_chave_pix as TipoChavePix] ?? 'chave'})</span>
                    </span>
                  ) : (
                    <span className="font-medium text-alerta">não cadastrada</span>
                  )}
                </Dado>
                <Dado rotulo="Recebedor">{i.nome_recebedor ?? '—'}</Dado>
                <Dado rotulo="CPF/CNPJ">{documento ?? '—'}</Dado>
                <Dado rotulo="Vendas contam desde">{formatarData(i.contar_desde)}</Dado>
                <Dado rotulo="Cadastro">{formatarData(i.criado_em)}</Dado>
              </Dados>
              {i.observacoes && (
                <div>
                  <p className="tipo-rotulo text-suave">Anotações da equipe</p>
                  <p className="mt-1 text-[14px] whitespace-pre-wrap text-ink/80">{i.observacoes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader titulo="Parceria" descricao={STATUS_INFLUENCIADOR[status].ajuda} />
            <CardContent className="flex flex-wrap gap-2">
              {status === 'ativo' ? (
                <ActionButton
                  acao={mudarStatusInfluenciador.bind(null, id, 'pausado')}
                  confirmar={`Pausar ${i.nome}? O cupom ${i.cupom} deixa de funcionar na loja até ser reativado.`}
                >
                  <Pause aria-hidden /> Pausar
                </ActionButton>
              ) : (
                <ActionButton acao={mudarStatusInfluenciador.bind(null, id, 'ativo')} variante="escuro">
                  <Play aria-hidden /> Reativar
                </ActionButton>
              )}
              {status !== 'encerrado' && (
                <ActionButton
                  acao={mudarStatusInfluenciador.bind(null, id, 'encerrado')}
                  variante="perigo"
                  confirmar={`Encerrar a parceria com ${i.nome}? O cupom é desligado. O histórico e as comissões pendentes continuam aqui e no Portal dele.`}
                >
                  Encerrar parceria
                </ActionButton>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
