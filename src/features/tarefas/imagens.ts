import { createClient } from '@/lib/supabase/client'

import { BUCKET_TAREFAS, MAX_IMAGENS_POR_ENVIO, type DadosAnexo } from './schema'

/**
 * Imagens da tarefa (fotos, prints): preparadas no navegador e enviadas direto
 * para o bucket privado "tarefas" (sem passar pelo limite de 4,5 MB da Vercel).
 *   • Foto de celular grande → no máximo 2000 px no maior lado, em JPEG.
 *   • Print (PNG) pequeno fica como está, para o texto continuar nítido.
 *   • GIF vai como está (animação), até 10 MB.
 */

const LADO_MAXIMO = 2000
const MANTER_ATE = 3 * 1024 * 1024
const LIMITE_BUCKET = 10 * 1024 * 1024
const LIMITE_ORIGINAL = 40 * 1024 * 1024
const ACEITOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type MimeAceito = (typeof ACEITOS)[number]

const EXTENSAO: Record<MimeAceito, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

type ImagemPronta = { blob: Blob; mime: MimeAceito; nome: string; largura: number | null; altura: number | null }

function abrir(url: string, nome: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Não foi possível abrir "${nome}". Use JPG, PNG, WEBP ou GIF.`))
    img.src = url
  })
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, qualidade))
}

function trocarExtensao(nome: string, extensao: string) {
  const base = nome.replace(/\.[a-z0-9]{1,8}$/i, '').trim() || 'imagem'
  return `${base.slice(0, 180)}.${extensao}`
}

async function preparar(arquivo: File): Promise<ImagemPronta> {
  const nome = arquivo.name || 'print.png'
  if (arquivo.size > LIMITE_ORIGINAL) throw new Error(`"${nome}" é grande demais (máximo de 40 MB).`)

  const url = URL.createObjectURL(arquivo)
  try {
    const img = await abrir(url, nome)
    const largura = img.naturalWidth
    const altura = img.naturalHeight
    const tipo = ACEITOS.find((m) => m === arquivo.type)

    if (tipo === 'image/gif') {
      if (arquivo.size > LIMITE_BUCKET) throw new Error(`O GIF "${nome}" passa de 10 MB.`)
      return { blob: arquivo, mime: tipo, nome, largura, altura }
    }

    const escala = Math.min(1, LADO_MAXIMO / Math.max(largura, altura))
    if (tipo && escala === 1 && arquivo.size <= MANTER_ATE) {
      return { blob: arquivo, mime: tipo, nome: trocarExtensao(nome, EXTENSAO[tipo]), largura, altura }
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(largura * escala)
    canvas.height = Math.round(altura * escala)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Seu navegador não conseguiu processar a imagem.')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Print continua PNG (texto nítido) se couber; o resto vira JPEG com fundo branco.
    if (tipo === 'image/png') {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const png = await paraBlob(canvas, 'image/png')
      if (png && png.size <= MANTER_ATE) {
        return { blob: png, mime: 'image/png', nome: trocarExtensao(nome, 'png'), largura: canvas.width, altura: canvas.height }
      }
    }
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const jpeg = await paraBlob(canvas, 'image/jpeg', 0.85)
    if (!jpeg) throw new Error(`Não foi possível preparar "${nome}".`)
    if (jpeg.size > LIMITE_BUCKET) throw new Error(`"${nome}" continua grande demais depois de reduzida.`)
    return { blob: jpeg, mime: 'image/jpeg', nome: trocarExtensao(nome, 'jpg'), largura: canvas.width, altura: canvas.height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Só os arquivos de imagem (de um input, de um "colar" ou de arrastar e soltar). */
export function filtrarImagens(arquivos: FileList | File[] | null | undefined): File[] {
  return [...(arquivos ?? [])].filter((a) => a.type.startsWith('image/'))
}

/**
 * Prepara e sobe as imagens para <tarefaId>/ no bucket. Devolve as que subiram
 * (para registrar com registrarAnexos) e o erro da primeira que falhou, se houver.
 */
export async function subirImagens(tarefaId: string, arquivos: File[]) {
  const supabase = createClient()
  const enviadas: DadosAnexo[] = []
  let erro: string | null = arquivos.length > MAX_IMAGENS_POR_ENVIO ? `Envie no máximo ${MAX_IMAGENS_POR_ENVIO} imagens por vez.` : null

  await Promise.all(
    arquivos.slice(0, MAX_IMAGENS_POR_ENVIO).map(async (arquivo) => {
      try {
        const imagem = await preparar(arquivo)
        const caminho = `${tarefaId}/${crypto.randomUUID()}.${EXTENSAO[imagem.mime]}`
        const { error } = await supabase.storage
          .from(BUCKET_TAREFAS)
          .upload(caminho, imagem.blob, { contentType: imagem.mime, upsert: false })
        if (error) throw new Error(`Não foi possível enviar "${imagem.nome}". Tente de novo.`)
        enviadas.push({
          caminho,
          nome: imagem.nome,
          mime: imagem.mime,
          tamanho: imagem.blob.size,
          largura: imagem.largura,
          altura: imagem.altura,
        })
      } catch (e) {
        erro ??= e instanceof Error ? e.message : 'Não foi possível enviar uma das imagens.'
      }
    }),
  )
  return { enviadas, erro }
}
