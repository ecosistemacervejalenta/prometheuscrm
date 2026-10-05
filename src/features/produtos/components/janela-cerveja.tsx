'use client'

import { ImagePlus, RefreshCw, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { classesControle } from '@/components/form/fields'
import { Button } from '@/components/ui/button'
import { CartaoCervejaLink, type CervejaDoLink } from '@/features/pre-vendas/publico/cartao-cerveja'
import { lerDinheiro } from '@/lib/format'
import { cn } from '@/lib/utils'

import { salvarCervejaRapida, type CervejaSalva } from '../actions'
import { carregarImagem, ENQUADRAMENTO_PADRAO, exportarFoto, zoomMinimo, type Enquadramento } from '../foto'
import { EditorFoto, FotoEnquadrada, type FotoEscolhida } from './editor-foto'

const MAX_DESCRICAO = 800

/**
 * Cadastro (ou edição) da cerveja sem sair da pré-venda: foto enquadrada,
 * dados e descrição, com a prévia ao vivo de como fica no link.
 * Abre como <dialog> num portal — fica fora do <form> da pré-venda.
 */
export function JanelaCerveja({
  cerveja,
  precoNaPreVenda,
  aoSalvar,
  aoFechar,
}: {
  cerveja?: CervejaSalva
  precoNaPreVenda?: number
  aoSalvar: (cerveja: CervejaSalva) => void
  aoFechar: () => void
}) {
  const janela = useRef<HTMLDialogElement>(null)
  const imagem = useRef<HTMLImageElement | null>(null)
  const [campos, setCampos] = useState({
    nome: cerveja?.nome ?? '',
    cervejaria: cerveja?.cervejaria ?? '',
    estilo: cerveja?.estilo ?? '',
    volume_ml: cerveja?.volume_ml ? String(cerveja.volume_ml) : '',
    teor_alcoolico: cerveja?.teor_alcoolico ? String(cerveja.teor_alcoolico).replace('.', ',') : '',
    preco: '',
    descricao: cerveja?.descricao ?? '',
  })
  const [foto, setFoto] = useState<FotoEscolhida | null>(null)
  const [enquadramento, setEnquadramento] = useState<Enquadramento>(ENQUADRAMENTO_PADRAO)
  const [removerFoto, setRemoverFoto] = useState(false)
  const [lendoFoto, setLendoFoto] = useState(false)
  const [erros, setErros] = useState<Record<string, string[] | undefined>>({})
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [salvando, iniciar] = useTransition()

  useEffect(() => {
    janela.current?.showModal()
  }, [])

  // Libera a prévia local (blob:) ao trocar de foto ou fechar.
  useEffect(() => () => (foto ? URL.revokeObjectURL(foto.url) : undefined), [foto])

  const alterar = (campo: keyof typeof campos) => (valor: string) => setCampos((c) => ({ ...c, [campo]: valor }))
  const fechar = () => janela.current?.close()

  async function escolherFoto(arquivo: File | undefined) {
    if (!arquivo) return
    setMensagem(null)
    setLendoFoto(true)
    const url = URL.createObjectURL(arquivo)
    try {
      const img = await carregarImagem(url)
      imagem.current = img
      const { naturalWidth: largura, naturalHeight: altura } = img
      // Foto quase quadrada preenche; foto bem alta (garrafa) ou larga aparece inteira.
      const razao = largura / altura
      setEnquadramento(razao > 0.8 && razao < 1.25 ? ENQUADRAMENTO_PADRAO : { zoom: zoomMinimo(largura, altura), x: 0, y: 0 })
      setFoto({ url, largura, altura })
      setRemoverFoto(false)
    } catch (erro) {
      URL.revokeObjectURL(url)
      setMensagem(erro instanceof Error ? erro.message : 'Não foi possível abrir a foto.')
    } finally {
      setLendoFoto(false)
    }
  }

  function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    evento.stopPropagation() // o portal repassa o evento ao <form> da pré-venda no React
    setMensagem(null)
    setErros({})
    iniciar(async () => {
      try {
        const dados = new FormData()
        for (const [campo, valor] of Object.entries(campos)) if (campo !== 'preco' || !cerveja) dados.set(campo, valor)
        if (removerFoto) dados.set('remover_imagem', '1')
        if (foto && imagem.current) dados.set('imagem', await exportarFoto(imagem.current, enquadramento))
        const r = await salvarCervejaRapida(cerveja?.id ?? null, dados)
        if (!r.ok) {
          setErros(r.erros ?? {})
          setMensagem(r.mensagem)
          return
        }
        aoSalvar(r.cerveja)
        fechar()
      } catch {
        setMensagem('Não foi possível salvar. Confira a internet e tente de novo.')
      }
    })
  }

  const fotoAtual = !removerFoto ? (cerveja?.imagem_url ?? null) : null
  const previa: CervejaDoLink = {
    nome: campos.nome.trim() || 'Nome da cerveja',
    cervejaria: campos.cervejaria.trim() || null,
    estilo: campos.estilo.trim() || null,
    volume_ml: Number(campos.volume_ml) || null,
    teor_alcoolico: Number(campos.teor_alcoolico.replace(',', '.')) || null,
    descricao: campos.descricao.trim() || null,
    imagem_url: fotoAtual,
    preco: cerveja ? (precoNaPreVenda ?? cerveja.preco) : lerDinheiro(campos.preco || '0'),
  }

  const seletorFoto = (rotulo: ReactNode, className: string) => (
    <label className={className}>
      {rotulo}
      <input type="file" accept="image/*" className="sr-only" disabled={lendoFoto} onChange={(e) => escolherFoto(e.target.files?.[0])} />
    </label>
  )
  const botaoPequeno =
    'inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-linha bg-superficie px-3 text-[13px] font-semibold hover:bg-papel [&_svg]:size-3.5'

  return createPortal(
    <dialog
      ref={janela}
      onClose={aoFechar}
      onClick={(e) => e.target === e.currentTarget && fechar()}
      aria-labelledby="titulo-janela-cerveja"
      className="m-0 h-dvh max-h-none w-full max-w-none bg-papel p-0 text-ink backdrop:bg-ink/50 lg:m-auto lg:h-auto lg:max-h-[92dvh] lg:w-[min(1000px,calc(100vw-48px))] lg:rounded-cartao lg:shadow-flutuante"
    >
      <form onSubmit={salvar} noValidate className="flex h-dvh flex-col lg:h-auto lg:max-h-[92dvh]">
        <header className="flex items-center justify-between gap-3 border-b border-linha bg-superficie px-5 pt-[max(14px,env(safe-area-inset-top))] pb-3.5">
          <div className="min-w-0">
            <h2 id="titulo-janela-cerveja" className="tipo-h3">
              {cerveja ? 'Editar cerveja' : 'Nova cerveja'}
            </h2>
            <p className="text-[13px] text-suave">
              {cerveja ? 'As mudanças valem para o catálogo e para o link.' : 'Fica salva no catálogo e já entra nesta pré-venda.'}
            </p>
          </div>
          <button type="button" onClick={fechar} aria-label="Fechar" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-ink/5">
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="grid gap-6 p-5 lg:grid-cols-[1fr_340px] lg:gap-8 lg:p-6">
            <div className="min-w-0 space-y-5">
              <section>
                <p className="mb-2 text-[13px] font-semibold">Foto</p>
                {foto ? (
                  <div className="max-w-sm">
                    <EditorFoto foto={foto} enquadramento={enquadramento} aoMudar={setEnquadramento} />
                    <div className="mt-2 flex gap-2">
                      {seletorFoto(<><RefreshCw aria-hidden /> Trocar foto</>, botaoPequeno)}
                      <button type="button" onClick={() => setFoto(null)} className={botaoPequeno}>
                        <Trash2 aria-hidden /> Descartar
                      </button>
                    </div>
                  </div>
                ) : fotoAtual ? (
                  <div className="flex items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element -- imagem pública do Storage */}
                    <img src={fotoAtual} alt="" className="size-28 rounded-2xl object-cover ring-1 ring-linha" />
                    <div className="flex flex-col gap-2">
                      {seletorFoto(<><RefreshCw aria-hidden /> Trocar foto</>, botaoPequeno)}
                      <button type="button" onClick={() => setRemoverFoto(true)} className={botaoPequeno}>
                        <Trash2 aria-hidden /> Remover foto
                      </button>
                    </div>
                  </div>
                ) : (
                  seletorFoto(
                    <>
                      <span className="grid size-12 place-items-center rounded-2xl bg-superficie text-ink shadow-cartao">
                        <ImagePlus className="size-5" aria-hidden />
                      </span>
                      <span className="text-[15px] font-semibold">{lendoFoto ? 'Abrindo a foto…' : 'Adicionar foto'}</span>
                      <span className="text-[13px] text-suave">Tire na hora ou escolha da galeria. Você ajusta o enquadramento em seguida.</span>
                    </>,
                    'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-linha-forte bg-superficie px-6 py-10 text-center transition-colors hover:border-ink/40',
                  )
                )}
                <Erro mensagens={erros.imagem} />
              </section>

              <div className="grid gap-4 sm:grid-cols-6">
                <Campo rotulo="Nome" obrigatorio id="cerveja-nome" erro={erros.nome} className="sm:col-span-6">
                  <input
                    id="cerveja-nome"
                    value={campos.nome}
                    onChange={(e) => alterar('nome')(e.target.value)}
                    placeholder="Ex.: Trooper Brasil IPA"
                    maxLength={120}
                    autoFocus={!cerveja}
                    className={cn(classesControle, 'h-11')}
                  />
                </Campo>
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
                {!cerveja && (
                  <Campo rotulo="Preço na pré-venda" obrigatorio id="cerveja-preco" erro={erros.preco} className="sm:col-span-2">
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
                  rotulo="Descrição"
                  id="cerveja-descricao"
                  erro={erros.descricao}
                  className="sm:col-span-6"
                  dica={
                    <span className="flex justify-between gap-3">
                      <span>Aroma, sabor, harmonização… Quebras de linha aparecem no link.</span>
                      <span className="tipo-dado shrink-0">
                        {campos.descricao.length}/{MAX_DESCRICAO}
                      </span>
                    </span>
                  }
                >
                  <textarea
                    id="cerveja-descricao"
                    rows={5}
                    maxLength={MAX_DESCRICAO}
                    value={campos.descricao}
                    onChange={(e) => alterar('descricao')(e.target.value)}
                    placeholder={'Lupulada e cítrica, com notas de maracujá e pinho.\nAmargor firme e final seco.\n\nHarmoniza com hambúrguer e queijos curados.'}
                    className={cn(classesControle, 'py-2.5 leading-6')}
                  />
                </Campo>
              </div>
            </div>

            <aside className="min-w-0 lg:sticky lg:top-0 lg:self-start">
              <p className="tipo-rotulo mb-2 text-suave">Prévia no link</p>
              <div className="rounded-[32px] bg-ink/[0.05] p-3">
                <ul>
                  <CartaoCervejaLink cerveja={previa} foto={foto ? <FotoEnquadrada foto={foto} enquadramento={enquadramento} /> : undefined} />
                </ul>
              </div>
              {cerveja && <p className="mt-2 text-[12px] text-suave">O preço desta pré-venda é ajustado na lista de cervejas.</p>}
            </aside>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-linha bg-superficie px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {mensagem && (
            <p role="alert" className="w-full text-[13px] font-medium text-perigo sm:mr-auto sm:w-auto">
              {mensagem}
            </p>
          )}
          <Button variante="fantasma" onClick={fechar}>
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
      {erro?.length ? <Erro mensagens={erro} /> : dica && <div className="mt-1.5 text-[13px] text-suave">{dica}</div>}
    </div>
  )
}

function Erro({ mensagens }: { mensagens?: string[] }) {
  if (!mensagens?.length) return null
  return <p className="mt-1.5 text-[13px] font-medium text-perigo">{mensagens[0]}</p>
}

