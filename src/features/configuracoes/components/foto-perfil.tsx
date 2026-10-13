'use client'

import { Camera, ImagePlus, Move, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useRef, useState, useTransition, type PointerEvent } from 'react'

import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useAvisos } from '@/components/ui/toaster'
import { carregarImagem, ENQUADRAMENTO_PADRAO, estiloDaFoto, ZOOM_MAXIMO, type Enquadramento } from '@/features/produtos/foto'

import { removerFotoPerfil, salvarFotoPerfil } from '../actions'
import { exportarFotoPerfil, limitarFotoPerfil, MAX_ARQUIVO_ORIGINAL } from '../foto-perfil'

type FotoEscolhida = { url: string; img: HTMLImageElement; largura: number; altura: number }

/** A foto recortada como vai ficar, posicionada dentro de um quadrado (o círculo vem do contêiner). */
function FotoRecortada({ foto, enquadramento }: { foto: FotoEscolhida; enquadramento: Enquadramento }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:)
    <img
      src={foto.url}
      alt=""
      aria-hidden
      draggable={false}
      className="absolute max-w-none select-none"
      style={estiloDaFoto(enquadramento, foto.largura, foto.altura)}
    />
  )
}

/**
 * Foto de perfil da pessoa logada: escolher, ajustar no círculo (arrastar + zoom) e salvar.
 * O recorte e a compressão acontecem no navegador; o servidor só recebe um JPEG de 512 px.
 */
export function FotoPerfil({ nome, foto }: { nome: string; foto: string | null }) {
  const entrada = useRef<HTMLInputElement>(null)
  const janela = useRef<HTMLDialogElement>(null)
  const arrasto = useRef<{ id: number; x: number; y: number; inicio: Enquadramento } | null>(null)
  const [escolhida, setEscolhida] = useState<FotoEscolhida | null>(null)
  const [enquadramento, setEnquadramento] = useState<Enquadramento>(ENQUADRAMENTO_PADRAO)
  const [salvando, iniciarSalvar] = useTransition()
  const [removendo, iniciarRemover] = useTransition()
  const avisar = useAvisos()

  useEffect(() => {
    if (escolhida) janela.current?.showModal()
  }, [escolhida])

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return
    if (!arquivo.type.startsWith('image/')) return avisar('Escolha um arquivo de imagem (JPG, PNG ou WEBP).', 'erro')
    if (arquivo.size > MAX_ARQUIVO_ORIGINAL) return avisar('Essa foto é grande demais. Escolha outra.', 'erro')
    const url = URL.createObjectURL(arquivo)
    try {
      const img = await carregarImagem(url)
      setEnquadramento(ENQUADRAMENTO_PADRAO)
      setEscolhida({ url, img, largura: img.naturalWidth, altura: img.naturalHeight })
    } catch (erro) {
      URL.revokeObjectURL(url)
      avisar(erro instanceof Error ? erro.message : 'Não foi possível abrir esta imagem.', 'erro')
    }
  }

  function fecharJanela() {
    if (escolhida) URL.revokeObjectURL(escolhida.url)
    setEscolhida(null)
  }

  function ajustar(e: Enquadramento) {
    if (escolhida) setEnquadramento(limitarFotoPerfil(e, escolhida.largura, escolhida.altura))
  }

  function mover(evento: PointerEvent<HTMLDivElement>) {
    const a = arrasto.current
    if (!a || a.id !== evento.pointerId) return
    const lado = evento.currentTarget.clientWidth
    ajustar({ ...a.inicio, x: a.inicio.x + (evento.clientX - a.x) / lado, y: a.inicio.y + (evento.clientY - a.y) / lado })
  }

  function salvar() {
    if (!escolhida) return
    iniciarSalvar(async () => {
      try {
        const dados = new FormData()
        dados.append('foto', await exportarFotoPerfil(escolhida.img, enquadramento))
        const resultado = await salvarFotoPerfil(dados)
        if (resultado.mensagem) avisar(resultado.mensagem, resultado.ok ? 'sucesso' : 'erro')
        if (resultado.ok) janela.current?.close()
      } catch (erro) {
        avisar(erro instanceof Error ? erro.message : 'Não foi possível salvar a foto.', 'erro')
      }
    })
  }

  function remover() {
    if (!window.confirm('Remover a sua foto de perfil? No lugar dela aparecem as suas iniciais.')) return
    iniciarRemover(async () => {
      const resultado = await removerFotoPerfil()
      if (resultado.mensagem) avisar(resultado.mensagem, resultado.ok ? 'sucesso' : 'erro')
    })
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        className="group relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        aria-label={foto ? 'Trocar foto de perfil' : 'Adicionar foto de perfil'}
      >
        <Avatar nome={nome} foto={foto} tamanho="xl" variante="volt" />
        <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/45 text-white opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
          <Camera className="size-6" />
        </span>
        <span className="absolute right-0 bottom-0 grid size-8 place-items-center rounded-full bg-ink text-white ring-[3px] ring-superficie" aria-hidden>
          <Camera className="size-4" />
        </span>
      </button>

      <div className="min-w-0">
        <p className="font-semibold">Foto de perfil</p>
        <p className="text-[13px] text-suave">Aparece no menu e na lista da equipe.</p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button variante="secundario" tamanho="sm" onClick={() => entrada.current?.click()}>
            <ImagePlus aria-hidden /> {foto ? 'Trocar foto' : 'Escolher foto'}
          </Button>
          {foto && (
            <Button variante="fantasma" tamanho="sm" className="text-perigo" carregando={removendo} onClick={remover}>
              <Trash2 aria-hidden /> Remover
            </Button>
          )}
        </div>
      </div>

      <input
        ref={entrada}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void escolher(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      <dialog
        ref={janela}
        onClose={fecharJanela}
        aria-labelledby="titulo-foto-perfil"
        className="m-auto w-[min(420px,calc(100vw-32px))] rounded-cartao bg-superficie p-5 text-ink shadow-flutuante backdrop:bg-ink/50"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="titulo-foto-perfil" className="tipo-h3">Ajustar foto</h2>
            <p className="mt-1 text-[13px] text-suave">Arraste para centralizar e use o zoom para aproximar.</p>
          </div>
          <Button variante="fantasma" tamanho="icone" aria-label="Fechar" onClick={() => janela.current?.close()}>
            <X aria-hidden />
          </Button>
        </div>

        {escolhida && (
          <>
            <div
              className="relative aspect-square w-full cursor-grab touch-none overflow-hidden rounded-2xl bg-ink select-none active:cursor-grabbing"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                arrasto.current = { id: e.pointerId, x: e.clientX, y: e.clientY, inicio: enquadramento }
              }}
              onPointerMove={mover}
              onPointerUp={() => (arrasto.current = null)}
              onPointerCancel={() => (arrasto.current = null)}
              role="img"
              aria-label="Recorte da foto. Arraste para posicionar."
            >
              <FotoRecortada foto={escolhida} enquadramento={enquadramento} />
              {/* Fora do círculo escurece: é exatamente o que aparece no CRM. */}
              <span
                className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(10,14,20,0.6)] ring-2 ring-white/90"
                aria-hidden
              />
              <span className="pointer-events-none absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink/70 px-3 py-1 text-[12px] font-semibold text-white">
                <Move className="size-3.5" aria-hidden /> Arraste para ajustar
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <ZoomOut className="size-4 shrink-0 text-suave" aria-hidden />
              <input
                type="range"
                min={1}
                max={ZOOM_MAXIMO}
                step={0.01}
                value={enquadramento.zoom}
                onChange={(e) => ajustar({ ...enquadramento, zoom: Number(e.target.value) })}
                aria-label="Zoom da foto"
                className="h-2 min-w-0 flex-1 cursor-pointer accent-[#0a0e14]"
              />
              <ZoomIn className="size-4 shrink-0 text-suave" aria-hidden />
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-papel p-3">
              {(['size-16', 'size-9'] as const).map((tamanho) => (
                <span key={tamanho} className={`relative shrink-0 overflow-hidden rounded-full ring-1 ring-linha ${tamanho}`}>
                  <FotoRecortada foto={escolhida} enquadramento={enquadramento} />
                </span>
              ))}
              <p className="min-w-0 text-[13px] text-suave">Assim a foto aparece no menu e na lista da equipe.</p>
            </div>
          </>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variante="secundario" onClick={() => janela.current?.close()} disabled={salvando}>
            Cancelar
          </Button>
          <Button variante="primario" onClick={salvar} carregando={salvando}>
            Salvar foto
          </Button>
        </div>
      </dialog>
    </div>
  )
}
