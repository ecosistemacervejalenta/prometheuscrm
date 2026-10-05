'use client'

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Beer, ImagePlus, Package, Plus, Smartphone, Star, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { classesControle } from '@/components/form/fields'
import { Button } from '@/components/ui/button'
import { AberturaPreVenda, type PreVendaDoLink } from '@/features/pre-vendas/publico/abertura'
import { CartaoCervejaLink, textosDaEscolha, type CervejaDoLink } from '@/features/pre-vendas/publico/cartao-cerveja'
import { CelularPrevia } from '@/features/pre-vendas/publico/celular-previa'
import { lerDinheiro } from '@/lib/format'
import { cn } from '@/lib/utils'

import { salvarCervejaRapida, type CervejaSalva } from '../actions'
import { enviarFotoProduto } from '../envio-fotos'
import { carregarImagem, ENQUADRAMENTO_PADRAO, exportarFoto, zoomMinimo, type Enquadramento } from '../foto'
import { MAX_CERVEJAS_NO_KIT, MAX_FOTOS, type CervejaDoKit } from '../kit'
import { EditorFoto, FotoEnquadrada, type FotoEscolhida } from './editor-foto'

const MAX_DESCRICAO = 1200

/** O que a pré-venda já tem, para o mockup mostrar o link como o cliente vai ver. */
export type ContextoDoLink = {
  preVenda: PreVendaDoLink
  nomeLoja: string
  freteVip: number
  /** Cervejas já marcadas na pré-venda (com o preço da pré-venda). */
  cervejas: Array<CervejaDoLink & { id: string }>
}

type FotoDaGaleria =
  | { chave: string; tipo: 'salva'; url: string }
  | { chave: string; tipo: 'nova'; foto: FotoEscolhida; img: HTMLImageElement; enquadramento: Enquadramento }

type LinhaKit = {
  chave: string
  nome: string
  cervejaria: string
  estilo: string
  teor_alcoolico: string
  volume_ml: string
  quantidade: string
  descricao: string
}

let sequencia = 0
const novaChave = () => `c${++sequencia}`
const linhaVazia = (): LinhaKit => ({ chave: novaChave(), nome: '', cervejaria: '', estilo: '', teor_alcoolico: '', volume_ml: '', quantidade: '1', descricao: '' })
const paraLinha = (k: CervejaDoKit): LinhaKit => ({
  chave: novaChave(),
  nome: k.nome,
  cervejaria: k.cervejaria ?? '',
  estilo: k.estilo ?? '',
  teor_alcoolico: k.teor_alcoolico ? String(k.teor_alcoolico).replace('.', ',') : '',
  volume_ml: k.volume_ml ? String(k.volume_ml) : '',
  quantidade: String(k.quantidade),
  descricao: k.descricao ?? '',
})
const numero = (v: string) => Number(v.replace(',', '.')) || null
const paraKit = (l: LinhaKit): CervejaDoKit => ({
  nome: l.nome.trim(),
  cervejaria: l.cervejaria.trim() || null,
  estilo: l.estilo.trim() || null,
  teor_alcoolico: numero(l.teor_alcoolico),
  volume_ml: numero(l.volume_ml),
  quantidade: Math.max(1, Number(l.quantidade) || 1),
  descricao: l.descricao.trim() || null,
})

const BOTAO_PEQUENO =
  'inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-linha bg-superficie px-3 text-[13px] font-semibold hover:bg-papel disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5'
const BOTAO_ICONE = 'grid size-8 place-items-center rounded-lg text-suave hover:bg-ink/5 hover:text-ink disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-4'

/**
 * Cadastro (ou edição) da cerveja — ou de um kit com várias cervejas, de marcas diferentes —
 * sem sair da pré-venda: galeria de fotos enquadradas, dados, descrição e, ao lado, um
 * iPhone com o link exatamente como o cliente vai ver. Abre como <dialog> num portal
 * (fica fora do <form> da pré-venda).
 */
export function JanelaCerveja({
  cerveja,
  precoNaPreVenda,
  contexto,
  aoSalvar,
  aoFechar,
}: {
  cerveja?: CervejaSalva
  precoNaPreVenda?: number
  contexto: ContextoDoLink
  aoSalvar: (cerveja: CervejaSalva) => void
  aoFechar: () => void
}) {
  const janela = useRef<HTMLDialogElement>(null)
  const urlsLocais = useRef<string[]>([])
  const [campos, setCampos] = useState({
    nome: cerveja?.nome ?? '',
    cervejaria: cerveja?.cervejaria ?? '',
    estilo: cerveja?.estilo ?? '',
    volume_ml: cerveja?.volume_ml ? String(cerveja.volume_ml) : '',
    teor_alcoolico: cerveja?.teor_alcoolico ? String(cerveja.teor_alcoolico).replace('.', ',') : '',
    preco: '',
    descricao: cerveja?.descricao ?? '',
  })
  const [modo, setModo] = useState<'cerveja' | 'kit'>(cerveja?.cervejas_do_kit.length ? 'kit' : 'cerveja')
  const [kit, setKit] = useState<LinhaKit[]>(() => cerveja?.cervejas_do_kit.map(paraLinha) ?? [])
  const [galeria, setGaleria] = useState<FotoDaGaleria[]>(() =>
    (cerveja?.fotos.length ? cerveja.fotos : cerveja?.imagem_url ? [cerveja.imagem_url] : []).map((url) => ({ chave: novaChave(), tipo: 'salva', url })),
  )
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [lendoFoto, setLendoFoto] = useState(false)
  const [erros, setErros] = useState<Record<string, string[] | undefined>>({})
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()

  useEffect(() => {
    janela.current?.showModal()
  }, [])
  useEffect(() => () => urlsLocais.current.forEach((url) => URL.revokeObjectURL(url)), [])

  const alterar = (campo: keyof typeof campos) => (valor: string) => setCampos((c) => ({ ...c, [campo]: valor }))
  const fechar = () => janela.current?.close()
  const foto = galeria.find((f) => f.chave === selecionada) ?? galeria[0] ?? null
  const posicao = foto ? galeria.indexOf(foto) : -1

  // Fotos ----------------------------------------------------------------------
  async function adicionarFotos(lista: FileList | null) {
    if (!lista?.length) return
    setMensagem(null)
    const vagas = MAX_FOTOS - galeria.length
    if (lista.length > vagas) setMensagem(`Cabem no máximo ${MAX_FOTOS} fotos.`)
    setLendoFoto(true)
    const novas: FotoDaGaleria[] = []
    for (const arquivo of [...lista].slice(0, vagas)) {
      const url = URL.createObjectURL(arquivo)
      try {
        const img = await carregarImagem(url)
        urlsLocais.current.push(url)
        const { naturalWidth: largura, naturalHeight: altura } = img
        // Foto quase quadrada preenche; foto bem alta (garrafa) ou larga aparece inteira.
        const razao = largura / altura
        const enquadramento = razao > 0.8 && razao < 1.25 ? ENQUADRAMENTO_PADRAO : { zoom: zoomMinimo(largura, altura), x: 0, y: 0 }
        novas.push({ chave: novaChave(), tipo: 'nova', img, foto: { url, largura, altura }, enquadramento })
      } catch {
        URL.revokeObjectURL(url)
        setMensagem('Uma das fotos não abriu. Use JPG, PNG ou WEBP.')
      }
    }
    setLendoFoto(false)
    if (novas.length) {
      setGaleria((g) => [...g, ...novas])
      setSelecionada(novas[0].chave)
    }
  }

  const moverFoto = (delta: number) =>
    setGaleria((g) => {
      const j = posicao + delta
      if (posicao < 0 || j < 0 || j >= g.length) return g
      const nova = [...g]
      ;[nova[posicao], nova[j]] = [nova[j], nova[posicao]]
      return nova
    })
  const tornarCapa = () => foto && setGaleria((g) => [foto, ...g.filter((f) => f.chave !== foto.chave)])
  const removerFoto = () => {
    if (!foto) return
    setGaleria((g) => g.filter((f) => f.chave !== foto.chave))
    setSelecionada(galeria[posicao + 1]?.chave ?? galeria[posicao - 1]?.chave ?? null)
  }
  const enquadrar = (chave: string, e: Enquadramento) =>
    setGaleria((g) => g.map((f) => (f.chave === chave && f.tipo === 'nova' ? { ...f, enquadramento: e } : f)))
  const slide = (f: FotoDaGaleria) =>
    f.tipo === 'salva' ? (
      // eslint-disable-next-line @next/next/no-img-element -- imagem pública do Storage
      <img src={f.url} alt="" className="absolute inset-0 size-full object-cover" draggable={false} />
    ) : (
      <FotoEnquadrada foto={f.foto} enquadramento={f.enquadramento} />
    )

  // Kit ------------------------------------------------------------------------
  function mudarModo(proximo: 'cerveja' | 'kit') {
    setModo(proximo)
    if (proximo === 'kit' && kit.length === 0) {
      // Quem começou a cadastrar uma cerveja e virou kit não perde o que digitou.
      const primeira = campos.nome.trim()
        ? { ...linhaVazia(), nome: campos.nome, cervejaria: campos.cervejaria, estilo: campos.estilo, teor_alcoolico: campos.teor_alcoolico, volume_ml: campos.volume_ml }
        : linhaVazia()
      setKit([primeira, linhaVazia()])
    }
  }
  const alterarLinha = (chave: string, campo: keyof LinhaKit, valor: string) =>
    setKit((k) => k.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)))
  const moverLinha = (i: number, delta: number) =>
    setKit((k) => {
      const j = i + delta
      if (j < 0 || j >= k.length) return k
      const nova = [...k]
      ;[nova[i], nova[j]] = [nova[j], nova[i]]
      return nova
    })

  // Salvar -----------------------------------------------------------------------
  function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    evento.stopPropagation() // o portal repassa o evento ao <form> da pré-venda no React
    setMensagem(null)
    setErros({})
    if (modo === 'kit' && kit.length === 0) return setMensagem('Adicione pelo menos uma cerveja ao kit.')
    if (modo === 'kit' && kit.some((l) => !l.nome.trim())) return setMensagem('Dê um nome a cada cerveja do kit.')

    iniciar(async () => {
      try {
        // 1. Fotos novas: enquadra, comprime e envia direto para o Storage (na ordem da galeria).
        const total = galeria.filter((f) => f.tipo === 'nova').length
        let enviadas = 0
        const urls: string[] = []
        for (const f of galeria) {
          if (f.tipo === 'salva') {
            urls.push(f.url)
            continue
          }
          setProgresso(`Enviando foto ${++enviadas} de ${total}…`)
          urls.push(await enviarFotoProduto(await exportarFoto(f.img, f.enquadramento)))
        }
        // Já enviadas: se o salvamento falhar, uma nova tentativa não manda de novo.
        setGaleria((g) => g.map((f, i) => (f.tipo === 'nova' && urls[i] ? { chave: f.chave, tipo: 'salva', url: urls[i] } : f)))

        // 2. Dados.
        setProgresso('Salvando…')
        const dados = new FormData()
        dados.set('nome', campos.nome)
        dados.set('descricao', campos.descricao)
        const avulsa = modo === 'cerveja'
        dados.set('cervejaria', avulsa ? campos.cervejaria : '')
        dados.set('estilo', avulsa ? campos.estilo : '')
        dados.set('volume_ml', avulsa ? campos.volume_ml : '')
        dados.set('teor_alcoolico', avulsa ? campos.teor_alcoolico : '')
        if (!cerveja) dados.set('preco', campos.preco)
        dados.set('fotos', JSON.stringify(urls))
        dados.set('cervejas_do_kit', JSON.stringify(avulsa ? [] : kit.map(paraKit)))
        const r = await salvarCervejaRapida(cerveja?.id ?? null, dados)
        if (!r.ok) {
          setErros(r.erros ?? {})
          setMensagem(r.mensagem)
          return
        }
        aoSalvar(r.cerveja)
        fechar()
      } catch (erro) {
        setMensagem(erro instanceof Error ? erro.message : 'Não foi possível salvar. Confira a internet e tente de novo.')
      } finally {
        setProgresso(null)
      }
    })
  }

  // Prévia (iPhone) ----------------------------------------------------------------
  const ehKit = modo === 'kit'
  const capaLocal = galeria[0] ? (galeria[0].tipo === 'salva' ? galeria[0].url : galeria[0].foto.url) : null
  const previa: CervejaDoLink = {
    nome: campos.nome.trim() || (ehKit ? 'Nome do kit' : 'Nome da cerveja'),
    cervejaria: ehKit ? null : campos.cervejaria.trim() || null,
    estilo: ehKit ? null : campos.estilo.trim() || null,
    volume_ml: ehKit ? null : Number(campos.volume_ml) || null,
    teor_alcoolico: ehKit ? null : numero(campos.teor_alcoolico),
    descricao: campos.descricao.trim() || null,
    imagem_url: capaLocal,
    fotos: galeria.map((f) => (f.tipo === 'salva' ? f.url : f.foto.url)),
    cervejas_do_kit: ehKit ? kit.filter((l) => l.nome.trim()).map(paraKit) : [],
    preco: cerveja ? (precoNaPreVenda ?? cerveja.preco) : lerDinheiro(campos.preco || '0'),
  }
  const naPreVenda = contexto.cervejas.some((c) => c.id === cerveja?.id)
  const lista: CervejaDoLink[] = naPreVenda ? contexto.cervejas.map((c) => (c.id === cerveja?.id ? previa : c)) : [...contexto.cervejas, previa]
  const capaNoLink =
    lista.find((c) => c.imagem_url) === previa && galeria[0]?.tipo === 'nova' ? (
      <FotoEnquadrada foto={galeria[0].foto} enquadramento={galeria[0].enquadramento} />
    ) : undefined
  const escolha = textosDaEscolha(lista)
  const unidadesKit = kit.reduce((s, l) => s + (Number(l.quantidade) || 1), 0)

  return createPortal(
    <dialog
      ref={janela}
      onClose={aoFechar}
      onClick={(e) => e.target === e.currentTarget && fechar()}
      aria-labelledby="titulo-janela-cerveja"
      className="m-0 h-dvh max-h-none w-full max-w-none bg-papel p-0 text-ink backdrop:bg-ink/50 lg:m-auto lg:h-auto lg:max-h-[94dvh] lg:w-[min(1080px,calc(100vw-48px))] lg:rounded-cartao lg:shadow-flutuante"
    >
      <form onSubmit={salvar} noValidate className="flex h-dvh flex-col lg:h-auto lg:max-h-[94dvh]">
        <header className="flex items-center justify-between gap-3 border-b border-linha bg-superficie px-5 pt-[max(14px,env(safe-area-inset-top))] pb-3.5">
          <div className="min-w-0">
            <h2 id="titulo-janela-cerveja" className="tipo-h3">
              {cerveja ? `Editar ${cerveja.cervejas_do_kit.length ? 'kit' : 'cerveja'}` : 'Nova cerveja ou kit'}
            </h2>
            <p className="text-[13px] text-suave">
              {cerveja ? 'As mudanças valem para o catálogo e para o link.' : 'Fica salvo no catálogo e já entra nesta pré-venda.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => document.getElementById('previa-no-celular')?.scrollIntoView({ behavior: 'smooth' })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-volt-700 lg:hidden"
          >
            <Smartphone className="size-4" aria-hidden /> Prévia
          </button>
          <button type="button" onClick={fechar} aria-label="Fechar" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-ink/5">
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <fieldset disabled={salvando} className="grid gap-8 p-5 lg:grid-cols-[1fr_330px] lg:p-6">
            <div className="min-w-0 space-y-6">
              {/* Fotos ------------------------------------------------------------ */}
              <section>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <p className="text-[13px] font-semibold">Fotos</p>
                  <p className="text-[12px] text-suave">
                    {galeria.length}/{MAX_FOTOS} · a 1ª é a capa
                  </p>
                </div>

                {galeria.length === 0 ? (
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-linha-forte bg-superficie px-6 py-10 text-center transition-colors hover:border-ink/40">
                    <span className="grid size-12 place-items-center rounded-2xl bg-superficie text-ink shadow-cartao">
                      <ImagePlus className="size-5" aria-hidden />
                    </span>
                    <span className="text-[15px] font-semibold">{lendoFoto ? 'Abrindo as fotos…' : 'Adicionar fotos'}</span>
                    <span className="text-[13px] text-suave">Pode escolher várias de uma vez (kit, cada lata, rótulo…). Você ajusta o enquadramento de cada uma.</span>
                    <input type="file" accept="image/*" multiple className="sr-only" disabled={lendoFoto} onChange={(e) => adicionarFotos(e.target.files)} />
                  </label>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,320px)_1fr]">
                    <div>
                      {foto?.tipo === 'nova' ? (
                        <EditorFoto foto={foto.foto} enquadramento={foto.enquadramento} aoMudar={(e) => enquadrar(foto.chave, e)} />
                      ) : (
                        foto && <div className="relative aspect-square overflow-hidden rounded-2xl ring-1 ring-linha">{slide(foto)}</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <ul className="flex flex-wrap gap-2">
                        {galeria.map((f, i) => (
                          <li key={f.chave}>
                            <button
                              type="button"
                              onClick={() => setSelecionada(f.chave)}
                              aria-label={`Foto ${i + 1}${i === 0 ? ' (capa)' : ''}`}
                              className={cn('relative block size-16 overflow-hidden rounded-xl ring-2 transition', f === foto ? 'ring-ink' : 'ring-transparent hover:ring-linha-forte')}
                            >
                              {slide(f)}
                              {i === 0 && <span className="absolute inset-x-0 bottom-0 bg-ink/75 py-0.5 text-center text-[10px] font-semibold text-white">Capa</span>}
                            </button>
                          </li>
                        ))}
                        {galeria.length < MAX_FOTOS && (
                          <li>
                            <label className="grid size-16 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-linha-forte text-suave hover:border-ink/40 hover:text-ink" aria-label="Adicionar fotos">
                              <Plus className="size-5" aria-hidden />
                              <input type="file" accept="image/*" multiple className="sr-only" disabled={lendoFoto} onChange={(e) => adicionarFotos(e.target.files)} />
                            </label>
                          </li>
                        )}
                      </ul>
                      {foto && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button type="button" onClick={() => moverFoto(-1)} disabled={posicao <= 0} className={BOTAO_PEQUENO}>
                            <ArrowLeft aria-hidden /> Antes
                          </button>
                          <button type="button" onClick={() => moverFoto(1)} disabled={posicao >= galeria.length - 1} className={BOTAO_PEQUENO}>
                            Depois <ArrowRight aria-hidden />
                          </button>
                          <button type="button" onClick={tornarCapa} disabled={posicao === 0} className={BOTAO_PEQUENO}>
                            <Star aria-hidden /> Tornar capa
                          </button>
                          <button type="button" onClick={removerFoto} className={cn(BOTAO_PEQUENO, 'text-perigo')}>
                            <Trash2 aria-hidden /> Remover
                          </button>
                        </div>
                      )}
                      <p className="mt-3 text-[12px] text-suave">No link, as fotos viram um carrossel para deslizar com o dedo.</p>
                    </div>
                  </div>
                )}
              </section>

              {/* Tipo ------------------------------------------------------------- */}
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink/[0.06] p-1" role="tablist" aria-label="Tipo de cadastro">
                {(
                  [
                    ['cerveja', 'Uma cerveja', Beer],
                    ['kit', 'Kit com várias cervejas', Package],
                  ] as const
                ).map(([valor, rotulo, Icone]) => (
                  <button
                    key={valor}
                    type="button"
                    role="tab"
                    aria-selected={modo === valor}
                    onClick={() => mudarModo(valor)}
                    className={cn(
                      'inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-semibold transition-colors',
                      modo === valor ? 'bg-superficie text-ink shadow-sm' : 'text-suave hover:text-ink',
                    )}
                  >
                    <Icone className="size-4 shrink-0" aria-hidden /> {rotulo}
                  </button>
                ))}
              </div>

              {/* Dados ------------------------------------------------------------ */}
              <div className="grid gap-4 sm:grid-cols-6">
                <Campo rotulo={ehKit ? 'Nome do kit' : 'Nome'} obrigatorio id="cerveja-nome" erro={erros.nome} className="sm:col-span-6">
                  <input
                    id="cerveja-nome"
                    value={campos.nome}
                    onChange={(e) => alterar('nome')(e.target.value)}
                    placeholder={ehKit ? 'Ex.: Kit Croma + Bodebrown' : 'Ex.: Trooper Brasil IPA'}
                    maxLength={120}
                    autoFocus={!cerveja}
                    className={cn(classesControle, 'h-11')}
                  />
                </Campo>
                {!ehKit && (
                  <>
                    <Campo rotulo="Cervejaria / marca" id="cerveja-cervejaria" erro={erros.cervejaria} className="sm:col-span-3">
                      <input id="cerveja-cervejaria" value={campos.cervejaria} onChange={(e) => alterar('cervejaria')(e.target.value)} placeholder="Bodebrown" maxLength={80} className={cn(classesControle, 'h-11')} />
                    </Campo>
                    <Campo rotulo="Estilo" id="cerveja-estilo" erro={erros.estilo} className="sm:col-span-3">
                      <input id="cerveja-estilo" value={campos.estilo} onChange={(e) => alterar('estilo')(e.target.value)} placeholder="American IPA" maxLength={80} className={cn(classesControle, 'h-11')} />
                    </Campo>
                    <Campo rotulo="Volume (ml)" id="cerveja-volume" erro={erros.volume_ml} className="sm:col-span-2">
                      <input
                        id="cerveja-volume"
                        inputMode="numeric"
                        value={campos.volume_ml}
                        onChange={(e) => alterar('volume_ml')(e.target.value.replace(/\D/g, '').slice(0, 5))}
                        placeholder="473"
                        className={cn(classesControle, 'tipo-dado h-11')}
                      />
                    </Campo>
                    <Campo rotulo="Teor alcoólico (%)" id="cerveja-teor" erro={erros.teor_alcoolico} className="sm:col-span-2">
                      <input
                        id="cerveja-teor"
                        inputMode="decimal"
                        value={campos.teor_alcoolico}
                        onChange={(e) => alterar('teor_alcoolico')(e.target.value.replace(/[^\d,.]/g, '').slice(0, 5))}
                        placeholder="6,5"
                        className={cn(classesControle, 'tipo-dado h-11')}
                      />
                    </Campo>
                  </>
                )}
                {!cerveja && (
                  <Campo rotulo={ehKit ? 'Preço do kit' : 'Preço na pré-venda'} obrigatorio id="cerveja-preco" erro={erros.preco} className="sm:col-span-2">
                    <div className="relative">
                      <span className="tipo-dado pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-suave">R$</span>
                      <input
                        id="cerveja-preco"
                        inputMode="decimal"
                        value={campos.preco}
                        onChange={(e) => alterar('preco')(e.target.value)}
                        placeholder="0,00"
                        className={cn(classesControle, 'tipo-dado h-11 pl-10')}
                      />
                    </div>
                  </Campo>
                )}
                <Campo
                  rotulo={ehKit ? 'Descrição do kit' : 'Descrição'}
                  id="cerveja-descricao"
                  erro={erros.descricao}
                  className="sm:col-span-6"
                  dica={
                    <span className="flex justify-between gap-3">
                      <span>{ehKit ? 'O que torna o kit especial. Cada cerveja tem a própria descrição abaixo.' : 'Aroma, sabor, harmonização…'} Use *negrito* como no WhatsApp.</span>
                      <span className="tipo-dado shrink-0">
                        {campos.descricao.length}/{MAX_DESCRICAO}
                      </span>
                    </span>
                  }
                >
                  <textarea
                    id="cerveja-descricao"
                    rows={ehKit ? 3 : 5}
                    maxLength={MAX_DESCRICAO}
                    value={campos.descricao}
                    onChange={(e) => alterar('descricao')(e.target.value)}
                    placeholder={
                      ehKit
                        ? 'Lançamento exclusivo: quatro rótulos da Croma e da Bodebrown, direto da fábrica.'
                        : 'Lupulada e cítrica, com notas de maracujá e pinho.\nAmargor firme e final seco.\n\nHarmoniza com hambúrguer e queijos curados.'
                    }
                    className={cn(classesControle, 'py-2.5 leading-6')}
                  />
                </Campo>
              </div>

              {/* Cervejas do kit ------------------------------------------------------ */}
              {ehKit && (
                <section>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[13px] font-semibold">Cervejas do kit</p>
                    <p className="text-[12px] text-suave">
                      {kit.length} {kit.length === 1 ? 'rótulo' : 'rótulos'} · {unidadesKit} {unidadesKit === 1 ? 'unidade' : 'unidades'}
                    </p>
                  </div>
                  <ol className="mt-2 space-y-3">
                    {kit.map((l, i) => (
                      <li key={l.chave} className="rounded-2xl border border-linha bg-superficie p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span className="tipo-rotulo text-suave">Cerveja {i + 1}</span>
                          <div className="flex gap-0.5">
                            <button type="button" onClick={() => moverLinha(i, -1)} disabled={i === 0} aria-label="Subir" className={BOTAO_ICONE}>
                              <ArrowUp aria-hidden />
                            </button>
                            <button type="button" onClick={() => moverLinha(i, 1)} disabled={i === kit.length - 1} aria-label="Descer" className={BOTAO_ICONE}>
                              <ArrowDown aria-hidden />
                            </button>
                            <button
                              type="button"
                              onClick={() => setKit((k) => k.filter((x) => x.chave !== l.chave))}
                              aria-label={`Tirar ${l.nome || 'esta cerveja'} do kit`}
                              className={cn(BOTAO_ICONE, 'hover:text-perigo')}
                            >
                              <Trash2 aria-hidden />
                            </button>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-6">
                          <Campo rotulo="Nome" obrigatorio id={`kit-${l.chave}-nome`} className="sm:col-span-4">
                            <input id={`kit-${l.chave}-nome`} value={l.nome} onChange={(e) => alterarLinha(l.chave, 'nome', e.target.value)} placeholder="Golden Pulp Theory" maxLength={120} className={cn(classesControle, 'h-10')} />
                          </Campo>
                          <Campo rotulo="Qtd. no kit" id={`kit-${l.chave}-qtd`} className="sm:col-span-2">
                            <input
                              id={`kit-${l.chave}-qtd`}
                              inputMode="numeric"
                              value={l.quantidade}
                              onChange={(e) => alterarLinha(l.chave, 'quantidade', e.target.value.replace(/\D/g, '').slice(0, 2))}
                              className={cn(classesControle, 'tipo-dado h-10')}
                            />
                          </Campo>
                          <Campo rotulo="Marca" id={`kit-${l.chave}-marca`} className="sm:col-span-3">
                            <input id={`kit-${l.chave}-marca`} value={l.cervejaria} onChange={(e) => alterarLinha(l.chave, 'cervejaria', e.target.value)} placeholder="Croma" maxLength={80} className={cn(classesControle, 'h-10')} />
                          </Campo>
                          <Campo rotulo="Estilo" id={`kit-${l.chave}-estilo`} className="sm:col-span-3">
                            <input id={`kit-${l.chave}-estilo`} value={l.estilo} onChange={(e) => alterarLinha(l.chave, 'estilo', e.target.value)} placeholder="Juicy IPA" maxLength={80} className={cn(classesControle, 'h-10')} />
                          </Campo>
                          <Campo rotulo="Teor (%)" id={`kit-${l.chave}-teor`} className="sm:col-span-3">
                            <input
                              id={`kit-${l.chave}-teor`}
                              inputMode="decimal"
                              value={l.teor_alcoolico}
                              onChange={(e) => alterarLinha(l.chave, 'teor_alcoolico', e.target.value.replace(/[^\d,.]/g, '').slice(0, 5))}
                              placeholder="6,5"
                              className={cn(classesControle, 'tipo-dado h-10')}
                            />
                          </Campo>
                          <Campo rotulo="Volume (ml)" id={`kit-${l.chave}-volume`} className="sm:col-span-3">
                            <input
                              id={`kit-${l.chave}-volume`}
                              inputMode="numeric"
                              value={l.volume_ml}
                              onChange={(e) => alterarLinha(l.chave, 'volume_ml', e.target.value.replace(/\D/g, '').slice(0, 5))}
                              placeholder="473"
                              className={cn(classesControle, 'tipo-dado h-10')}
                            />
                          </Campo>
                          <Campo rotulo="Descrição" id={`kit-${l.chave}-descricao`} className="sm:col-span-6">
                            <textarea
                              id={`kit-${l.chave}-descricao`}
                              rows={2}
                              maxLength={500}
                              value={l.descricao}
                              onChange={(e) => alterarLinha(l.chave, 'descricao', e.target.value)}
                              placeholder="Aromática e suculenta, com Citra, Cascade e Krush."
                              className={cn(classesControle, 'py-2 leading-6')}
                            />
                          </Campo>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {kit.length < MAX_CERVEJAS_NO_KIT && (
                    <Button className="mt-3 max-sm:w-full" onClick={() => setKit((k) => [...k, linhaVazia()])}>
                      <Plus /> Adicionar cerveja ao kit
                    </Button>
                  )}
                </section>
              )}
            </div>

            {/* Prévia no iPhone -------------------------------------------------------- */}
            <aside id="previa-no-celular" className="min-w-0 scroll-mt-4 lg:sticky lg:top-0 lg:self-start">
              <p className="tipo-rotulo mb-3 text-center text-suave">Como fica no link</p>
              <CelularPrevia largura={300} className="mx-auto">
                <AberturaPreVenda preVenda={contexto.preVenda} itens={lista} nomeLoja={contexto.nomeLoja} freteVip={contexto.freteVip} capa={capaNoLink} />
                <div className="mt-12">
                  <p className="tipo-rotulo text-volt-700">Sua escolha</p>
                  <h2 className="tipo-h2 mt-2 text-balance">{escolha.titulo}</h2>
                  <p className="mt-2 text-[16px] text-suave">{escolha.descricao}</p>
                  <ul className="mt-6">
                    <CartaoCervejaLink cerveja={previa} fotos={galeria.map(slide)} />
                  </ul>
                </div>
              </CelularPrevia>
              <p className="mt-3 text-center text-[12px] text-suave">
                Role a tela do celular para ver tudo.{cerveja ? ' O preço desta pré-venda é ajustado na lista de cervejas.' : ''}
              </p>
            </aside>
          </fieldset>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-linha bg-superficie px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {(mensagem || progresso) && (
            <p role={mensagem ? 'alert' : 'status'} className={cn('w-full text-[13px] font-medium sm:mr-auto sm:w-auto', mensagem ? 'text-perigo' : 'text-suave')}>
              {mensagem ?? progresso}
            </p>
          )}
          <Button variante="fantasma" onClick={fechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" variante="primario" carregando={salvando} disabled={lendoFoto}>
            {cerveja ? 'Salvar alterações' : 'Cadastrar e incluir'}
          </Button>
        </footer>
      </form>
    </dialog>,
    document.body,
  )
}

function Campo({
  rotulo,
  id,
  obrigatorio,
  erro,
  dica,
  className,
  children,
}: {
  rotulo: string
  id: string
  obrigatorio?: boolean
  erro?: string[]
  dica?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold">
        {rotulo}
        {obrigatorio && (
          <span className="ml-0.5 text-perigo" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {erro?.length ? <p className="mt-1.5 text-[13px] font-medium text-perigo">{erro[0]}</p> : dica && <div className="mt-1.5 text-[13px] text-suave">{dica}</div>}
    </div>
  )
}
