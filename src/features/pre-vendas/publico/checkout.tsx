'use client'

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  LoaderCircle,
  Lock,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Truck,
  User,
} from 'lucide-react'
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

import { buscarCep, mascararCep } from '@/lib/cep'
import { formatarData, formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'
import { linkWhatsapp, mascararWhatsapp, whatsappValido } from '@/lib/whatsapp'

import { confirmarPedidoPreVenda, consultarFreteLink } from './actions'
import {
  CLIENTE_VAZIO,
  esquecerCliente,
  esquecerPedido,
  lembrarCliente,
  lembrarPedido,
  useArmazenado,
  type DadosCliente,
  type PedidoFeito,
} from './armazenamento'
import { CLASSE_CAMPO, CLASSE_RESPOSTA, classeBotaoGrande } from './estilos'
import { TelaPagamento } from './pagamento'
import { AberturaPreVenda, PerfilDaLoja } from './abertura'
import { CartaoCervejaLink, textosDaEscolha } from './cartao-cerveja'
import type { PreVendaPublica } from './queries'

type Etapa = 'inicio' | 'cervejas' | 'conferir' | 'nome' | 'sobrenome' | 'whatsapp' | 'cep' | 'numero' | 'revisao' | 'pago'
type Item = PreVendaPublica['itens'][number]
type ConsultaCep = { cep: string; buscando: boolean; naoEncontrado: boolean; vip: boolean | null }

/** Etapas que entram no histórico do navegador (#passo-nome...): o "voltar" do Android e o gesto do iPhone voltam uma pergunta. */
const NO_HISTORICO: Etapa[] = ['cervejas', 'conferir', 'nome', 'sobrenome', 'whatsapp', 'cep', 'numero', 'revisao']

/** Etapas que contam na barra de progresso. */
const PROGRESSO: Etapa[] = ['cervejas', 'nome', 'sobrenome', 'whatsapp', 'cep', 'numero', 'revisao']
const TOTAL_PERGUNTAS = 5
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
const BUSCA_CEP_CORREIOS = 'https://buscacepinter.correios.com.br/app/endereco/index.php'

const maximoDo = (i: Item) => Math.min(i.limite_por_cliente ?? Infinity, i.restante ?? Infinity, 99)

const avisosDo = (i: Item) =>
  [i.restante !== null && i.restante <= 30 ? `restam ${i.restante}` : null, i.limite_por_cliente ? `máx. ${i.limite_por_cliente} por pessoa` : null]
    .filter(Boolean)
    .join(' · ')

const linhasDoEndereco = (c: DadosCliente) => [
  `${c.logradouro}${c.numero ? `, ${c.numero}` : ''}${c.complemento ? ` — ${c.complemento}` : ''}`,
  `${c.bairro} · ${c.cidade}/${c.uf} · CEP ${c.cep}`,
]

/**
 * Link público da pré-venda, no estilo Typeform (mobile first):
 * boas-vindas → cervejas → nome → sobrenome → WhatsApp → CEP (endereço automático
 * + frete) → número/complemento → revisão → PIX e comprovante.
 * Quem já comprou neste aparelho só confere os dados.
 */
export function CheckoutPreVenda({ dados, whatsappInicial }: { dados: PreVendaPublica; whatsappInicial?: string }) {
  const { noNavegador, cliente, pedido } = useArmazenado(dados.preVenda.slug)

  if (!dados.preVenda.ativa && !pedido) return <PreVendaEncerrada dados={dados} />

  // Ao hidratar, remonta o fluxo já com o que está guardado no aparelho.
  return (
    <Fluxo
      key={noNavegador ? 'aparelho' : 'servidor'}
      dados={dados}
      clienteSalvo={cliente}
      pedidoSalvo={pedido}
      whatsappInicial={whatsappInicial}
    />
  )
}

function Fluxo({
  dados,
  clienteSalvo,
  pedidoSalvo,
  whatsappInicial,
}: {
  dados: PreVendaPublica
  clienteSalvo: DadosCliente | null
  pedidoSalvo: PedidoFeito | null
  whatsappInicial?: string
}) {
  const { preVenda, itens, loja } = dados
  const [etapa, setEtapa] = useState<Etapa>(pedidoSalvo ? 'pago' : 'inicio')
  const [pedido, setPedido] = useState<PedidoFeito | null>(pedidoSalvo)
  const [quantidades, setQuantidades] = useState<Record<string, number>>({})
  const [cliente, setCliente] = useState<DadosCliente>(
    () => clienteSalvo ?? { ...CLIENTE_VAZIO, whatsapp: whatsappInicial ? mascararWhatsapp(whatsappInicial.replace(/^55/, '')) : '' },
  )
  const [lembrado, setLembrado] = useState(clienteSalvo !== null)
  const [consulta, setConsulta] = useState<ConsultaCep | null>(null)
  const [editandoEndereco, setEditandoEndereco] = useState(false)
  const [observacoes, setObservacoes] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, iniciar] = useTransition()
  const ultimoCep = useRef('')
  const armadilha = useRef<HTMLInputElement>(null)

  const selecionados = itens.filter((i) => (quantidades[i.produto_id] ?? 0) > 0)
  const unidades = selecionados.reduce((s, i) => s + quantidades[i.produto_id], 0)
  const subtotal = selecionados.reduce((s, i) => s + i.preco * quantidades[i.produto_id], 0)
  const cepDigitos = cliente.cep.replace(/\D/g, '')
  const frete = consulta?.cep === cepDigitos ? consulta : null
  const freteVip = frete?.vip === true
  const total = subtotal + (freteVip ? loja.freteVip : 0)
  const enderecoCompleto = [cliente.logradouro, cliente.bairro, cliente.cidade, cliente.uf].every((v) => v.trim())
  const nomeCompleto = `${cliente.nome} ${cliente.sobrenome}`.trim().replace(/\s+/g, ' ')
  const escolha = textosDaEscolha(itens)
  const primeiroNome = cliente.nome.trim().split(/\s+/)[0] ?? ''

  const alterar = (campo: keyof DadosCliente) => (valor: string) => setCliente((c) => ({ ...c, [campo]: valor }))

  /**
   * Avança (ou volta) uma etapa. Cada pergunta vira uma entrada no histórico do navegador, e o
   * campo da próxima pergunta recebe o foco ainda dentro do toque — no iPhone é o único jeito
   * de o teclado continuar aberto entre uma pergunta e outra.
   */
  function ir(proxima: Etapa, { substituir = false } = {}) {
    flushSync(() => {
      setErro(null)
      setEtapa(proxima)
    })
    const url = NO_HISTORICO.includes(proxima) ? `#passo-${proxima}` : window.location.pathname + window.location.search
    if (substituir) window.history.replaceState(null, '', url)
    else window.history.pushState(null, '', url)
    window.scrollTo({ top: 0 })
    document.querySelector<HTMLElement>('[data-foco]')?.focus({ preventScroll: true })
  }

  // Botão "voltar" do Android / gesto do iPhone → etapa anterior (sem sair do link).
  const atual = useRef({ pedido, lembrado })
  useEffect(() => {
    atual.current = { pedido, lembrado }
  })
  useEffect(() => {
    if (window.location.hash.startsWith('#passo-')) window.history.replaceState(null, '', window.location.pathname + window.location.search)
    function aoNavegar() {
      const alvo = window.location.hash.replace('#passo-', '') as Etapa
      setErro(null)
      if (atual.current.pedido) setEtapa('pago')
      else if (!NO_HISTORICO.includes(alvo)) setEtapa('inicio')
      else setEtapa(alvo === 'conferir' && !atual.current.lembrado ? 'nome' : alvo)
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('popstate', aoNavegar)
    return () => window.removeEventListener('popstate', aoNavegar)
  }, [])

  // Android: "puxar para atualizar" recarregaria a página no meio do pedido.
  useEffect(() => {
    const raiz = document.documentElement
    raiz.style.overscrollBehaviorY = 'none'
    return () => {
      raiz.style.overscrollBehaviorY = ''
    }
  }, [])

  function definirQuantidade(item: Item, quantidade: number) {
    const valor = Math.max(0, Math.min(Number.isFinite(quantidade) ? quantidade : 0, maximoDo(item)))
    setQuantidades((atual) => ({ ...atual, [item.produto_id]: valor }))
  }

  /** Endereço pela ViaCEP + frete pela lista de CEPs VIP, ao mesmo tempo. */
  async function consultarCep(cep: string, buscarEndereco: boolean) {
    ultimoCep.current = cep
    setConsulta({ cep, buscando: true, naoEncontrado: false, vip: null })
    const [endereco, resposta] = await Promise.all([
      buscarEndereco ? buscarCep(cep) : Promise.resolve(null),
      consultarFreteLink(preVenda.slug, cep).catch(() => null),
    ])
    if (ultimoCep.current !== cep) return // o cliente já digitou outro CEP
    if (endereco) {
      setCliente((c) => ({
        ...c,
        logradouro: endereco.logradouro || c.logradouro,
        bairro: endereco.bairro || c.bairro,
        cidade: endereco.cidade || c.cidade,
        uf: endereco.uf || c.uf,
      }))
    }
    setConsulta({ cep, buscando: false, naoEncontrado: buscarEndereco && !endereco, vip: resposta?.ok ? resposta.vip : null })
    // CEP geral da cidade (sem rua) ou não encontrado: o cliente completa à mão.
    if (buscarEndereco) setEditandoEndereco(!endereco || !endereco.logradouro || !endereco.bairro)
  }

  function aoDigitarCep(valor: string) {
    const cep = mascararCep(valor)
    const digitos = cep.replace(/\D/g, '')
    if (digitos === cepDigitos) return setCliente((c) => ({ ...c, cep }))
    setErro(null)
    setCliente((c) => ({ ...c, cep, logradouro: '', bairro: '', cidade: '', uf: '' }))
    if (digitos.length === 8) {
      consultarCep(digitos, true)
    } else {
      ultimoCep.current = ''
      setConsulta(null)
      setEditandoEndereco(false)
    }
  }

  function aposPergunta(evento: FormEvent, valido: boolean, mensagem: string, proxima: Etapa) {
    evento.preventDefault()
    if (!valido) return setErro(mensagem)
    ir(proxima)
  }

  function aposWhatsapp(evento: FormEvent) {
    evento.preventDefault()
    if (!whatsappValido(cliente.whatsapp)) return setErro('Confira o número: DDD + celular, ex.: (11) 98765-4321.')
    if (cepDigitos.length === 8 && consulta?.cep !== cepDigitos) consultarCep(cepDigitos, !enderecoCompleto)
    ir('cep')
  }

  function aposCep(evento: FormEvent) {
    evento.preventDefault()
    if (cepDigitos.length !== 8) return setErro('Digite os 8 números do CEP.')
    if (frete?.buscando) return
    if (!enderecoCompleto) {
      setEditandoEndereco(true)
      return setErro('Complete o endereço: rua, bairro, cidade e UF.')
    }
    ir('numero')
  }

  function aposNumero(evento: FormEvent) {
    aposPergunta(evento, Boolean(cliente.numero.trim()), 'Digite o número da casa ou do prédio (ou toque em “Sem número”).', 'revisao')
  }

  function continuarConferido() {
    if (cepDigitos.length === 8 && consulta?.cep !== cepDigitos) consultarCep(cepDigitos, false)
    ir('revisao')
  }

  function corrigirDados() {
    ir('nome')
  }

  function naoSouEu() {
    esquecerCliente()
    setCliente(CLIENTE_VAZIO)
    setLembrado(false)
    setConsulta(null)
    ultimoCep.current = ''
    ir('nome')
  }

  function confirmar() {
    setErro(null)
    iniciar(async () => {
      try {
        const r = await confirmarPedidoPreVenda({
          slug: preVenda.slug,
          whatsapp: cliente.whatsapp,
          itens: selecionados.map((i) => ({ produto_id: i.produto_id, quantidade: quantidades[i.produto_id] })),
          observacoes: observacoes.trim() || undefined,
          armadilha: armadilha.current?.value || undefined,
          cliente: {
            nome: nomeCompleto,
            cep: cliente.cep,
            logradouro: cliente.logradouro,
            numero: cliente.numero,
            complemento: cliente.complemento || undefined,
            bairro: cliente.bairro,
            cidade: cliente.cidade,
            uf: cliente.uf,
          },
        })
        if (!r.ok) return setErro(r.mensagem)

        const feito: PedidoFeito = {
          numero: r.numero,
          total: r.total,
          subtotal: r.subtotal,
          taxaEntrega: r.taxaEntrega,
          frete: r.frete,
          nome: nomeCompleto,
          itens: selecionados.map((i) => ({ nome: i.nome, quantidade: quantidades[i.produto_id], total: i.preco * quantidades[i.produto_id] })),
        }
        lembrarCliente(cliente)
        lembrarPedido(preVenda.slug, feito)
        setPedido(feito)
        setLembrado(true)
        ir('pago', { substituir: true })
      } catch {
        setErro('Sem conexão com a internet. Confira e toque em “Confirmar pedido” de novo.')
      }
    })
  }

  function fazerOutroPedido() {
    esquecerPedido(preVenda.slug)
    setPedido(null)
    setQuantidades({})
    setObservacoes('')
    ir(preVenda.ativa ? 'inicio' : 'pago', { substituir: true })
  }

  // ---------------------------------------------------------------------------
  if (etapa === 'pago' && pedido) {
    return (
      <Moldura>
        <TelaPagamento pedido={pedido} loja={loja} previsaoEntrega={preVenda.previsao_entrega} aoFazerOutro={fazerOutroPedido} />
      </Moldura>
    )
  }

  if (!preVenda.ativa) return <PreVendaEncerrada dados={dados} />

  const indice = PROGRESSO.indexOf(etapa === 'conferir' ? 'numero' : etapa)

  return (
    <Moldura
      progresso={indice >= 0 ? (indice + 1) / PROGRESSO.length : undefined}
      aoVoltar={etapa === 'inicio' ? undefined : () => window.history.back()}
    >
      <div key={etapa} className="animar-passo">
        {/* Boas-vindas ------------------------------------------------------ */}
        {etapa === 'inicio' && (
          <AberturaPreVenda preVenda={preVenda} itens={itens} nomeLoja={loja.nome} freteVip={loja.freteVip} aoComecar={() => ir('cervejas')} />
        )}

        {/* Cervejas ---------------------------------------------------------- */}
        {etapa === 'cervejas' && (
          <div className="pb-32">
            <Titulo rotulo="Sua escolha" titulo={escolha.titulo} descricao={escolha.descricao} />
            <ul className="mt-6 space-y-3">
              {itens.map((item) => (
                <CartaoCervejaLink
                  key={item.produto_id}
                  cerveja={item}
                  quantidade={quantidades[item.produto_id] ?? 0}
                  aoDefinir={(n) => definirQuantidade(item, n)}
                  maximo={maximoDo(item)}
                  esgotado={item.restante !== null && item.restante <= 0}
                  avisos={avisosDo(item)}
                />
              ))}
            </ul>
            <BarraInferior erro={erro}>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-white/60">{unidades === 0 ? escolha.vazio : escolha.contar(unidades)}</p>
                <p className="tipo-numero text-2xl whitespace-nowrap text-white max-[360px]:text-lg">{formatarMoeda(subtotal)}</p>
              </div>
              <button type="button" disabled={unidades === 0} onClick={() => ir(lembrado ? 'conferir' : 'nome')} className={classeBotaoGrande('volt')}>
                Continuar <ArrowRight className="max-[360px]:hidden" aria-hidden />
              </button>
            </BarraInferior>
          </div>
        )}

        {/* Quem já comprou neste aparelho só confere ---------------------------- */}
        {etapa === 'conferir' && (
          <>
            <Titulo rotulo="Seus dados" titulo={`Que bom te ver de novo, ${primeiroNome}!`} descricao="Confira se está tudo certo para a entrega." />
            <div className="mt-6 space-y-3 rounded-[24px] border border-linha bg-superficie p-5 text-[16px]">
              <p className="flex items-center gap-3">
                <User className="size-5 shrink-0 text-suave" aria-hidden /> <span className="font-semibold">{nomeCompleto}</span>
              </p>
              <p className="flex items-center gap-3">
                <Phone className="size-5 shrink-0 text-suave" aria-hidden /> <span className="tipo-dado text-[16px]">{cliente.whatsapp}</span>
              </p>
              <p className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-suave" aria-hidden />
                <span>
                  {linhasDoEndereco(cliente).map((linha) => (
                    <span key={linha} className="block">
                      {linha}
                    </span>
                  ))}
                </span>
              </p>
            </div>
            <button type="button" onClick={continuarConferido} className={classeBotaoGrande('volt', 'mt-6 w-full')}>
              Está tudo certo <Check aria-hidden />
            </button>
            <button type="button" onClick={corrigirDados} className={classeBotaoGrande('claro', 'mt-3 w-full')}>
              <Pencil aria-hidden /> Corrigir meus dados
            </button>
            <button type="button" onClick={naoSouEu} className="mt-4 block w-full py-2 text-center text-[15px] font-semibold text-suave hover:text-ink">
              Não sou {primeiroNome}
            </button>
          </>
        )}

        {/* 1 · Nome ----------------------------------------------------------- */}
        {etapa === 'nome' && (
          <Pergunta
            numero={1}
            htmlFor="nome"
            titulo="Qual é o seu nome?"
            erro={erro}
            aoEnviar={(e) => aposPergunta(e, /[a-zA-ZÀ-ÿ]{2,}/.test(cliente.nome), 'Digite seu nome.', 'sobrenome')}
          >
            <input
              id="nome"
              autoFocus
              data-foco
              autoComplete="given-name"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              maxLength={60}
              placeholder="Digite aqui…"
              value={cliente.nome}
              onChange={(e) => alterar('nome')(e.target.value)}
              className={CLASSE_RESPOSTA}
            />
          </Pergunta>
        )}

        {/* 2 · Sobrenome ------------------------------------------------------ */}
        {etapa === 'sobrenome' && (
          <Pergunta
            numero={2}
            htmlFor="sobrenome"
            titulo={`Prazer, ${primeiroNome}! E o seu sobrenome?`}
            erro={erro}
            aoEnviar={(e) => aposPergunta(e, /[a-zA-ZÀ-ÿ]{2,}/.test(cliente.sobrenome), 'Digite seu sobrenome.', 'whatsapp')}
          >
            <input
              id="sobrenome"
              autoFocus
              data-foco
              autoComplete="family-name"
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="next"
              maxLength={60}
              placeholder="Digite aqui…"
              value={cliente.sobrenome}
              onChange={(e) => alterar('sobrenome')(e.target.value)}
              className={CLASSE_RESPOSTA}
            />
          </Pergunta>
        )}

        {/* 3 · WhatsApp ------------------------------------------------------- */}
        {etapa === 'whatsapp' && (
          <Pergunta
            numero={3}
            htmlFor="whatsapp"
            titulo="Qual é o seu WhatsApp?"
            descricao="Com DDD. É por ele que a gente fala sobre o seu pedido."
            erro={erro}
            aoEnviar={aposWhatsapp}
          >
            <input
              id="whatsapp"
              type="tel"
              inputMode="tel"
              autoFocus
              data-foco
              autoComplete="tel-national"
              enterKeyHint="next"
              placeholder="(11) 98765-4321"
              value={cliente.whatsapp}
              onChange={(e) => alterar('whatsapp')(mascararWhatsapp(e.target.value))}
              className={cn(CLASSE_RESPOSTA, 'tipo-dado')}
            />
          </Pergunta>
        )}

        {/* 4 · CEP → endereço automático + frete ---------------------------------- */}
        {etapa === 'cep' && (
          <Pergunta
            numero={4}
            htmlFor="cep"
            titulo="Qual é o CEP de entrega?"
            descricao="A gente preenche o endereço pra você."
            erro={erro}
            aoEnviar={aposCep}
            ocupado={frete?.buscando}
          >
            <input
              id="cep"
              inputMode="numeric"
              autoFocus
              data-foco
              autoComplete="postal-code"
              enterKeyHint="next"
              placeholder="00000-000"
              value={cliente.cep}
              onChange={(e) => aoDigitarCep(e.target.value)}
              className={cn(CLASSE_RESPOSTA, 'tipo-dado')}
            />
            <a href={BUSCA_CEP_CORREIOS} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-[14px] font-semibold text-volt-700 hover:text-ink">
              Não sei meu CEP
            </a>

            {frete?.buscando ? (
              <p className="mt-5 flex items-center gap-2 text-[16px] text-suave" role="status">
                <LoaderCircle className="size-5 animate-spin" aria-hidden /> Buscando endereço…
              </p>
            ) : (
              cepDigitos.length === 8 && (
                <div className="mt-5 space-y-3">
                  {frete?.naoEncontrado && (
                    <p className="text-[15px] text-alerta">Não achamos esse CEP. Confira os números ou preencha o endereço abaixo.</p>
                  )}
                  {editandoEndereco || !enderecoCompleto ? (
                    <CamposEndereco cliente={cliente} alterar={alterar} />
                  ) : (
                    <div className="flex items-start gap-3 rounded-[20px] bg-superficie p-4 ring-1 ring-linha">
                      <MapPin className="mt-0.5 size-5 shrink-0 text-volt-700" aria-hidden />
                      <div className="min-w-0 flex-1 text-[16px] leading-6">
                        <p className="font-semibold">{cliente.logradouro}</p>
                        <p className="text-suave">
                          {cliente.bairro} · {cliente.cidade}/{cliente.uf}
                        </p>
                      </div>
                      <button type="button" onClick={() => setEditandoEndereco(true)} className="shrink-0 text-[14px] font-semibold text-volt-700 hover:text-ink">
                        Editar
                      </button>
                    </div>
                  )}
                  <AvisoFrete vip={frete?.vip ?? null} valor={loja.freteVip} />
                </div>
              )
            )}
          </Pergunta>
        )}

        {/* 5 · Número e complemento --------------------------------------------- */}
        {etapa === 'numero' && (
          <Pergunta
            numero={5}
            htmlFor="numero"
            titulo="E o número?"
            descricao={`${cliente.logradouro} · ${cliente.bairro}`}
            erro={erro}
            aoEnviar={aposNumero}
          >
            <div className="flex items-end gap-3">
              <input
                id="numero"
                inputMode="numeric"
                autoFocus
                data-foco
                enterKeyHint="next"
                maxLength={20}
                placeholder="123"
                value={cliente.numero}
                onChange={(e) => alterar('numero')(e.target.value)}
                className={cn(CLASSE_RESPOSTA, 'tipo-dado')}
              />
              <button
                type="button"
                onClick={() => alterar('numero')('S/N')}
                className="mb-3 shrink-0 rounded-full border border-linha bg-superficie px-3 py-1.5 text-[14px] font-semibold hover:border-ink"
              >
                Sem número
              </button>
            </div>
            <label htmlFor="complemento" className="mt-8 block text-[15px] font-semibold">
              Complemento <span className="font-normal text-suave">(opcional)</span>
            </label>
            <input
              id="complemento"
              autoComplete="address-line2"
              enterKeyHint="done"
              maxLength={80}
              placeholder="Apto, bloco, casa…"
              value={cliente.complemento}
              onChange={(e) => alterar('complemento')(e.target.value)}
              className={cn(CLASSE_CAMPO, 'mt-2')}
            />
          </Pergunta>
        )}

        {/* Revisão e confirmação ------------------------------------------------ */}
        {etapa === 'revisao' && (
          <div className="pb-32">
            <Titulo rotulo="Quase lá" titulo="Confira seu pedido" />

            <section className="mt-6 rounded-[24px] border border-linha bg-superficie p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="tipo-h3">Seu pedido</h2>
                <button type="button" onClick={() => ir('cervejas')} className="text-[14px] font-semibold text-volt-700 hover:text-ink">
                  Alterar
                </button>
              </div>
              <ul className="mt-3 space-y-2 text-[16px]">
                {selecionados.map((i) => (
                  <li key={i.produto_id} className="flex justify-between gap-3">
                    <span>
                      <span className="tipo-dado font-semibold">{quantidades[i.produto_id]}×</span> {i.nome}
                    </span>
                    <span className="tipo-dado shrink-0">{formatarMoeda(i.preco * quantidades[i.produto_id])}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-3 text-suave">
                  <span>Frete</span>
                  <span className="tipo-dado shrink-0">
                    {frete?.buscando ? (
                      <LoaderCircle className="inline size-4 animate-spin" aria-label="Consultando frete" />
                    ) : freteVip ? (
                      formatarMoeda(loja.freteVip)
                    ) : (
                      'a cotar'
                    )}
                  </span>
                </li>
              </ul>
              {!frete?.buscando && !freteVip && (
                <p className="mt-3 rounded-2xl bg-alerta-50 p-3 text-[14px] leading-5 text-ink/80">
                  Seu CEP está fora da área de frete fixo. Vamos cotar o frete e te mandar no WhatsApp o mais rápido possível, antes do
                  fechamento do pedido.
                </p>
              )}
            </section>

            <section className="mt-4 rounded-[24px] border border-linha bg-superficie p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="tipo-h3">Entrega</h2>
                <button type="button" onClick={corrigirDados} className="text-[14px] font-semibold text-volt-700 hover:text-ink">
                  Alterar
                </button>
              </div>
              <p className="mt-2 text-[16px] font-semibold">{nomeCompleto}</p>
              <p className="tipo-dado text-[14px] text-suave">{cliente.whatsapp}</p>
              {linhasDoEndereco(cliente).map((linha) => (
                <p key={linha} className="text-[15px] text-suave">
                  {linha}
                </p>
              ))}
              {preVenda.previsao_entrega && (
                <p className="mt-2 text-[14px] text-suave">Previsão de entrega: {formatarData(preVenda.previsao_entrega)}</p>
              )}
            </section>

            <section className="mt-4 rounded-[24px] border border-linha bg-superficie p-5">
              <label htmlFor="observacoes" className="tipo-h3 block">
                Alguma observação? <span className="text-[15px] font-normal text-suave">(opcional)</span>
              </label>
              <textarea
                id="observacoes"
                rows={2}
                maxLength={500}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex.: entregar depois das 18h, interfone 32"
                className="mt-3 block w-full rounded-2xl border border-linha bg-papel px-4 py-3 text-[16px] outline-none focus:border-ink focus:ring-4 focus:ring-volt/25"
              />
            </section>

            {/* Campo invisível anti-robô */}
            <input ref={armadilha} type="text" name="site" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />

            <BarraInferior erro={erro}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-white/60">{freteVip ? 'Total com frete' : 'Total sem frete'}</p>
                <p className="tipo-numero text-2xl whitespace-nowrap text-white max-[360px]:text-lg">{formatarMoeda(total)}</p>
              </div>
              <button
                type="button"
                onClick={confirmar}
                disabled={enviando || frete?.buscando || unidades === 0}
                className={classeBotaoGrande('volt')}
              >
                {enviando ? <LoaderCircle className="animate-spin" aria-hidden /> : <Check className="max-[360px]:hidden" aria-hidden />}
                Confirmar<span className="max-sm:hidden"> pedido</span>
              </button>
            </BarraInferior>
          </div>
        )}
      </div>
    </Moldura>
  )
}

// -----------------------------------------------------------------------------
// Peças do fluxo
// -----------------------------------------------------------------------------

function Moldura({ progresso, aoVoltar, children }: { progresso?: number; aoVoltar?: () => void; children: ReactNode }) {
  const comCabecalho = Boolean(aoVoltar) || progresso !== undefined
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-[max(24px,env(safe-area-inset-bottom))]">
      {comCabecalho && (
        <header className="sticky top-0 z-30 -mx-5 flex items-center gap-3 bg-papel px-5 pt-[max(8px,env(safe-area-inset-top))] pb-2">
          {aoVoltar ? (
            <button type="button" onClick={aoVoltar} aria-label="Voltar" className="-ml-2.5 grid size-11 shrink-0 place-items-center rounded-full active:bg-ink/10 lg:hover:bg-ink/5">
              <ArrowLeft className="size-5" aria-hidden />
            </button>
          ) : (
            <span className="size-11 shrink-0" />
          )}
          {progresso !== undefined && (
            <div
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10"
              role="progressbar"
              aria-label="Progresso do pedido"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progresso * 100)}
            >
              <div className="h-full rounded-full bg-ink transition-[width] duration-500 ease-out" style={{ width: `${progresso * 100}%` }} />
            </div>
          )}
          <span className="w-2 shrink-0" />
        </header>
      )}
      <main className={cn('flex-1', comCabecalho ? 'pt-4' : 'pt-[max(16px,env(safe-area-inset-top))]')}>{children}</main>
    </div>
  )
}

function Titulo({ rotulo, titulo, descricao }: { rotulo: string; titulo: string; descricao?: string }) {
  return (
    <header>
      <p className="tipo-rotulo text-volt-700">{rotulo}</p>
      <h1 className="tipo-h2 mt-2 text-balance sm:tipo-h1">{titulo}</h1>
      {descricao && <p className="mt-2 text-[16px] text-suave">{descricao}</p>}
    </header>
  )
}

/** Uma pergunta por tela, com letra grande; Enter (ou OK) avança. */
function Pergunta({
  numero,
  htmlFor,
  titulo,
  descricao,
  erro,
  aoEnviar,
  ocupado,
  children,
}: {
  numero: number
  htmlFor: string
  titulo: string
  descricao?: string
  erro: string | null
  aoEnviar: (evento: FormEvent) => void
  ocupado?: boolean
  children: ReactNode
}) {
  return (
    <form onSubmit={aoEnviar} noValidate className="pt-[4vh] lg:pt-[10vh]">
      <p className="tipo-rotulo flex items-center gap-1.5 text-volt-700">
        Pergunta {numero} de {TOTAL_PERGUNTAS}
      </p>
      <h1 className="tipo-h2 mt-3 text-balance sm:tipo-h1">
        <label htmlFor={htmlFor}>{titulo}</label>
      </h1>
      {descricao && <p className="mt-2 text-[16px] text-suave">{descricao}</p>}
      <div className="mt-8">{children}</div>
      <MensagemErro erro={erro} />
      <div className="mt-8 flex items-center gap-4">
        <button type="submit" disabled={ocupado} className={classeBotaoGrande('volt', 'max-sm:w-full sm:min-w-40')}>
          OK <Check aria-hidden />
        </button>
        <span className="hidden text-[13px] text-suave lg:inline">
          ou aperte <b className="text-ink">Enter ↵</b>
        </span>
      </div>
    </form>
  )
}

function MensagemErro({ erro, className }: { erro: string | null; className?: string }) {
  if (!erro) return null
  return (
    <p role="alert" className={cn('mt-4 flex items-start gap-2 rounded-2xl bg-perigo-50 px-4 py-3 text-[15px] font-medium text-perigo', className)}>
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {erro}
    </p>
  )
}

function AvisoFrete({ vip, valor }: { vip: boolean | null; valor: number }) {
  if (vip === null) return null
  return vip ? (
    <p className="flex items-start gap-3 rounded-[20px] bg-volt-50 p-4 text-[16px] leading-6 text-ink">
      <Truck className="mt-0.5 size-5 shrink-0 text-volt-700" aria-hidden />
      <span>
        Seu CEP tem <b>frete fixo de {formatarMoeda(valor)}</b>.
      </span>
    </p>
  ) : (
    <p className="flex items-start gap-3 rounded-[20px] bg-alerta-50 p-4 text-[16px] leading-6 text-ink">
      <Truck className="mt-0.5 size-5 shrink-0 text-alerta" aria-hidden />
      <span>
        <b>Frete a cotar.</b> Vamos calcular e te mandar no WhatsApp o mais rápido possível, antes do fechamento do pedido.
      </span>
    </p>
  )
}

function CamposEndereco({ cliente, alterar }: { cliente: DadosCliente; alterar: (campo: keyof DadosCliente) => (valor: string) => void }) {
  const campo = (id: 'logradouro' | 'bairro' | 'cidade', rotulo: string, className: string, autoComplete?: string) => (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[14px] font-semibold">
        {rotulo}
      </label>
      <input id={id} autoComplete={autoComplete} value={cliente[id]} onChange={(e) => alterar(id)(e.target.value)} className={CLASSE_CAMPO} />
    </div>
  )
  return (
    <div className="grid grid-cols-6 gap-3">
      {campo('logradouro', 'Rua / Avenida', 'col-span-6', 'address-line1')}
      {campo('bairro', 'Bairro', 'col-span-6')}
      {campo('cidade', 'Cidade', 'col-span-4', 'address-level2')}
      <div className="col-span-2">
        <label htmlFor="uf" className="mb-1.5 block text-[14px] font-semibold">
          UF
        </label>
        <select id="uf" value={cliente.uf} onChange={(e) => alterar('uf')(e.target.value)} className={cn(CLASSE_CAMPO, 'px-3')}>
          <option value="">—</option>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/** Barra fixa no rodapé (total + ação). O erro aparece logo acima, sempre visível. */
function BarraInferior({ erro, children }: { erro: string | null; children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(16px,env(safe-area-inset-bottom))] max-lg:[body:has(:is(input,textarea):focus)_&]:hidden">
      <div className="mx-auto max-w-xl">
        {erro && (
          <div className="animar-passo mb-2 shadow-flutuante">
            <MensagemErro erro={erro} className="mt-0 bg-perigo-50" />
          </div>
        )}
        <div className="flex items-center gap-3 rounded-[24px] bg-ink py-3 pr-3 pl-5 shadow-flutuante">{children}</div>
      </div>
    </div>
  )
}

function PreVendaEncerrada({ dados }: { dados: PreVendaPublica }) {
  const { preVenda, loja } = dados
  return (
    <Moldura>
      <PerfilDaLoja className="mb-5" />
      <div className="animar-passo rounded-[28px] bg-ink p-8 text-center text-white">
        <Lock className="mx-auto size-10 text-volt" aria-hidden />
        <h1 className="tipo-h2 mt-4">{preVenda.titulo}</h1>
        <p className="mt-2 text-white/70">Esta pré-venda foi encerrada. Fique de olho no grupo para a próxima!</p>
        {loja.whatsapp && (
          <a
            href={linkWhatsapp(loja.whatsapp, `Oi! Vi a pré-venda "${preVenda.titulo}" e queria saber das próximas.`)}
            target="_blank"
            rel="noopener noreferrer"
            className={classeBotaoGrande('volt', 'mt-6 w-full')}
          >
            <MessageCircle aria-hidden /> Falar com a loja
          </a>
        )}
      </div>
    </Moldura>
  )
}
