'use client'

import { ArrowRight, Check, Copy, Heart, LoaderCircle, PackageCheck, PackageOpen, Truck } from 'lucide-react'
import { useCallback, useEffect, useState, useTransition } from 'react'

import { formatarData, formatarMoeda, numeroPedido } from '@/lib/format'
import { cn } from '@/lib/utils'

import { fecharMinhaCaixa, minhaCaixa } from './actions'
import type { PedidoFeito } from './armazenamento'
import { CaixaIlustracao, ConteudoDaCaixa } from './caixa'
import { caixaQuitada, gruposDaCaixa, type CaixaPublica } from './caixa-dados'
import { classeBotaoGrande, copiarTexto } from './estilos'
import { PixChaveLoja } from './pagamento'
import { PixMercadoPago } from './pix-mercado-pago'
import type { PreVendaPublica } from './queries'

type Escolha = NonNullable<PedidoFeito['escolha']>

/**
 * Última tela do link: as cervejas entraram na Caixa VIP. O cliente escolhe entre
 * deixar a caixa aberta (vai juntando as próximas pré-vendas e paga tudo no fechamento,
 * com um frete só) ou fechar e pagar agora. Paga, a caixa aparece fechada com laço:
 * vai ser preparada e enviada com carinho.
 */
export function TelaCaixa({
  pedido,
  caixaInicial,
  loja,
  whatsapp,
  aoEscolher,
  aoComprarMais,
}: {
  pedido: PedidoFeito
  caixaInicial: CaixaPublica | null
  loja: PreVendaPublica['loja']
  whatsapp: string
  aoEscolher: (escolha: Escolha) => void
  aoComprarMais: (() => void) | null
}) {
  const [caixa, setCaixa] = useState<CaixaPublica | null>(caixaInicial)
  const [escolha, setEscolha] = useState<Escolha | null>(pedido.escolha ?? null)
  const [pagoAgora, setPagoAgora] = useState(false)
  const [fechando, iniciar] = useTransition()
  const [primeiraVez] = useState(() => caixaInicial !== null)
  const pedidoId = pedido.pedidoId

  // Sempre confere a caixa no servidor: pode ter recebido itens de outra pré-venda ou sido paga.
  useEffect(() => {
    if (!pedidoId) return
    let ativo = true
    minhaCaixa(pedidoId)
      .then((c) => ativo && c && setCaixa(c))
      .catch(() => {})
    return () => {
      ativo = false
    }
  }, [pedidoId])

  const escolher = useCallback(
    (nova: Escolha) => {
      setEscolha(nova)
      aoEscolher(nova)
      if (nova === 'pagar' && pedidoId) {
        iniciar(async () => {
          const c = await fecharMinhaCaixa(pedidoId).catch(() => null)
          if (c) setCaixa(c)
        })
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [aoEscolher, pedidoId],
  )

  // Pedido lembrado de antes da Caixa VIP (sem id): mostra só a chave PIX, como antes.
  if (!pedidoId) {
    const valor = pedido.frete === 'a_cotar' ? pedido.subtotal : pedido.total
    return (
      <div className="animar-passo space-y-4">
        <Heroi titulo={numeroPedido(pedido.numero)} rotulo="Pedido confirmado" texto={`Obrigado, ${pedido.nome.split(' ')[0]}!`} />
        <PixChaveLoja
          loja={loja}
          valor={valor}
          rotuloValor="Valor a pagar"
          mensagemComprovante={`Olá! Segue o comprovante do PIX do pedido ${numeroPedido(pedido.numero)} (${pedido.nome}) — ${formatarMoeda(valor)}.`}
        />
      </div>
    )
  }

  if (!caixa) {
    return (
      <div className="grid min-h-[60vh] place-items-center" aria-busy="true">
        <div className="text-center">
          <CaixaIlustracao estado="aberta" className="max-w-[180px] opacity-60" />
          <p className="mt-3 flex items-center justify-center gap-2 text-[15px] text-suave">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Abrindo sua caixa…
          </p>
        </div>
      </div>
    )
  }

  const quitada = pagoAgora || caixaQuitada(caixa)
  const aberta = caixa.situacao === 'aberta'
  const modo: 'escolher' | 'aberta' | 'pagar' | 'paga' = quitada
    ? 'paga'
    : aberta
      ? escolha === 'aberta'
        ? 'aberta'
        : 'escolher'
      : 'pagar'
  const primeiroNome = caixa.cliente.primeiroNome || pedido.nome.split(' ')[0]
  const linkCaixa = typeof window === 'undefined' ? '' : `${window.location.origin}/pagar/${caixa.pedidoId}`
  const freteCaixa =
    caixa.frete === 'a_cotar'
      ? { rotulo: 'Frete (um só para a caixa)', valor: 'a cotar' }
      : { rotulo: 'Frete (um só para a caixa)', valor: formatarMoeda(caixa.taxaEntrega) }

  return (
    <div className="animar-passo space-y-4">
      {modo === 'paga' ? (
        <section className="rounded-[28px] bg-ink px-6 pt-7 pb-8 text-center text-white">
          <CaixaIlustracao estado="fechada" movimento className="max-w-[220px]" />
          <p className="tipo-rotulo mt-4 text-volt">Caixa fechada e paga</p>
          <h1 className="tipo-h2 mt-2 text-balance">Agora é com a gente, {primeiroNome}!</h1>
          <p className="mt-2 text-[16px] leading-6 text-white/75">
            Sua Caixa VIP vai ser preparada com todo o carinho e sai para entrega assim que as cervejas chegarem
            {caixa.previsaoEnvio ? ` (previsão ${formatarData(caixa.previsaoEnvio)})` : ''}.
          </p>
        </section>
      ) : (
        <section className={cn('rounded-[28px] px-6 pt-6 pb-7 text-center', modo === 'pagar' ? 'bg-ink text-white' : 'bg-volt text-ink')}>
          <CaixaIlustracao
            estado={modo === 'pagar' ? 'fechada' : 'aberta'}
            quantidade={caixa.unidades}
            animar={primeiraVez && modo === 'escolher'}
            className="max-w-[220px]"
          />
          <p className={cn('tipo-rotulo mt-3', modo === 'pagar' ? 'text-volt' : 'text-ink/70')}>
            {modo === 'pagar' ? 'Caixa fechada · falta o pagamento' : 'Cervejas garantidas'}
          </p>
          <h1 className="tipo-h2 mt-1.5 text-balance">
            {modo === 'pagar' ? `Quase lá, ${primeiroNome}!` : `Já estão na sua Caixa VIP, ${primeiroNome}!`}
          </h1>
          <p className={cn('mt-2 text-[16px] leading-6', modo === 'pagar' ? 'text-white/75' : 'text-ink/75')}>
            {modo === 'pagar'
              ? 'Pague o PIX abaixo e sua caixa segue para envio assim que as cervejas chegarem.'
              : `${numeroPedido(caixa.numero)} · ${caixa.unidades} ${caixa.unidades === 1 ? 'cerveja' : 'cervejas'} na caixa`}
          </p>
        </section>
      )}

      {modo === 'escolher' && <CartoesDeEscolha caixa={caixa} ocupado={fechando} aoEscolher={escolher} />}

      {modo === 'aberta' && (
        <section className="rounded-[24px] border-2 border-vip/50 bg-vip-50 p-5">
          <p className="flex items-center gap-2 text-[18px] font-semibold">
            <PackageOpen className="size-6 text-vip-700" aria-hidden /> Sua caixa fica aberta
          </p>
          <p className="mt-2 text-[15px] leading-6 text-ink/80">
            Toda compra que você fizer nas próximas pré-vendas com o WhatsApp <b className="whitespace-nowrap">{whatsapp}</b> entra nesta
            mesma caixa. Quando quiser fechar, é só abrir qualquer link de pré-venda ou o link da sua caixa e pagar tudo de uma vez — com um
            frete só.
          </p>
          <BotaoCopiarLink link={linkCaixa} />
          <button
            type="button"
            onClick={() => escolher('pagar')}
            disabled={fechando}
            className={classeBotaoGrande('claro', 'mt-3 w-full')}
          >
            {fechando ? <LoaderCircle className="animate-spin" aria-hidden /> : <PackageCheck aria-hidden />} Fechar e pagar agora
          </button>
        </section>
      )}

      {modo === 'pagar' &&
        (loja.mercadoPago ? (
          <PixMercadoPago
            pedidoId={caixa.pedidoId}
            aoMudar={(s) => {
              if (s === 'pago') setPagoAgora(true)
              minhaCaixa(caixa.pedidoId).then((c) => c && setCaixa(c)).catch(() => {})
            }}
            reserva={<ReservaChave caixa={caixa} loja={loja} />}
          />
        ) : (
          <ReservaChave caixa={caixa} loja={loja} />
        ))}

      <ConteudoDaCaixa
        numero={caixa.numero}
        grupos={gruposDaCaixa(caixa.itens)}
        frete={freteCaixa}
        total={caixa.total}
        rotuloTotal={caixa.frete === 'a_cotar' ? 'Total da caixa (sem frete)' : 'Total da caixa'}
        pago={caixa.pago}
        devido={caixa.devido}
        previsaoEnvio={caixa.previsaoEnvio}
      />

      {caixa.frete === 'a_cotar' && modo !== 'paga' && (
        <p className="flex items-start gap-3 rounded-[20px] border border-alerta/25 bg-alerta-50 p-4 text-[15px] leading-6 text-ink/80">
          <Truck className="mt-0.5 size-5 shrink-0 text-alerta" aria-hidden />
          <span>
            <b className="text-alerta">Frete a cotar.</b> Seu CEP está fora da área de frete fixo: a gente cota um frete só para a caixa
            inteira e te manda no WhatsApp.
          </span>
        </p>
      )}

      {aoComprarMais && (
        <button type="button" onClick={aoComprarMais} className={classeBotaoGrande('claro', 'w-full')}>
          Escolher mais cervejas <ArrowRight aria-hidden />
        </button>
      )}
      <p className="pb-2 text-center text-[13px] text-balance text-suave">
        <Heart className="mr-1 inline size-3.5 -translate-y-px fill-perigo text-perigo" aria-hidden />
        No fim, sua caixa é fechada e enviada com todo o carinho até você.
      </p>
    </div>
  )
}

function CartoesDeEscolha({ caixa, ocupado, aoEscolher }: { caixa: CaixaPublica; ocupado: boolean; aoEscolher: (e: Escolha) => void }) {
  return (
    <section aria-labelledby="titulo-escolha" className="space-y-3">
      <h2 id="titulo-escolha" className="tipo-h3 px-1">
        Como você prefere?
      </h2>

      <div className="relative overflow-hidden rounded-[24px] bg-ink p-5 text-white">
        <span className="tipo-rotulo inline-flex items-center gap-1.5 rounded-full bg-vip px-2.5 py-1 text-ink">
          <PackageOpen className="size-3.5" aria-hidden /> Frete único
        </span>
        <h3 className="tipo-h2 mt-3">Deixar minha caixa aberta</h3>
        <p className="mt-2 text-[15px] leading-6 text-white/75">
          Vem mais lançamento por aí. Vá colocando suas cervejas na caixa durante a semana e pague tudo de uma vez, no fechamento — com
          <b className="text-white"> um frete só</b> para a caixa inteira.
        </p>
        <button type="button" onClick={() => aoEscolher('aberta')} className={classeBotaoGrande('volt', 'mt-4 w-full')}>
          <PackageOpen aria-hidden /> Deixar aberta
        </button>
      </div>

      <div className="rounded-[24px] border border-linha bg-superficie p-5">
        <h3 className="tipo-h3">Fechar a caixa e pagar agora</h3>
        <p className="mt-1.5 text-[15px] leading-6 text-suave">
          Já escolheu tudo? Pague {formatarMoeda(caixa.devido)} com PIX e sua caixa segue para envio assim que as cervejas chegarem.
        </p>
        <button type="button" onClick={() => aoEscolher('pagar')} disabled={ocupado} className={classeBotaoGrande('claro', 'mt-4 w-full')}>
          {ocupado ? <LoaderCircle className="animate-spin" aria-hidden /> : <PackageCheck aria-hidden />} Fechar e pagar agora
        </button>
      </div>
    </section>
  )
}

function ReservaChave({ caixa, loja }: { caixa: CaixaPublica; loja: PreVendaPublica['loja'] }) {
  return (
    <PixChaveLoja
      loja={loja}
      valor={caixa.devido}
      rotuloValor={caixa.pago > 0 ? 'Falta pagar' : 'Valor a pagar'}
      detalhe={caixa.frete === 'a_cotar' ? 'O frete é pago à parte, quando enviarmos a cotação.' : 'Já inclui o frete da caixa.'}
      mensagemComprovante={`Olá! Segue o comprovante do PIX da Caixa VIP ${numeroPedido(caixa.numero)} — ${formatarMoeda(caixa.devido)}.`}
    />
  )
}

function BotaoCopiarLink({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false)
  if (!link) return null
  return (
    <button
      type="button"
      onClick={async () => {
        if (!(await copiarTexto(link))) return
        setCopiado(true)
        setTimeout(() => setCopiado(false), 2500)
      }}
      className={classeBotaoGrande('escuro', 'mt-4 w-full')}
    >
      {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copiado ? 'Link copiado!' : 'Copiar link da caixa'}</span>
    </button>
  )
}

function Heroi({ rotulo, titulo, texto }: { rotulo: string; titulo: string; texto: string }) {
  return (
    <section className="rounded-[28px] bg-volt px-6 py-8 text-center">
      <p className="tipo-rotulo text-ink/70">{rotulo}</p>
      <h1 className="tipo-h1 mt-1">{titulo}</h1>
      <p className="mt-2 text-[17px] text-ink/80">{texto}</p>
    </section>
  )
}
