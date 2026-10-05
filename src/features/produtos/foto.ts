/**
 * Foto da cerveja: enquadramento quadrado + compressão no navegador, antes do envio.
 * Fotos de celular passam fácil de 4 MB (limite do envio); aqui viram um quadrado
 * de 1200 px em JPEG com poucas centenas de KB.
 *
 * Enquadramento (independe do tamanho da tela):
 *   zoom = 1 → a foto preenche o quadrado; zoom < 1 → aparece inteira, com fundo desfocado.
 *   x, y  → deslocamento do centro da foto, em frações do lado do quadrado.
 */

export type Enquadramento = { zoom: number; x: number; y: number }

export const TAMANHO_FOTO = 1200
export const ZOOM_MAXIMO = 3
export const ENQUADRAMENTO_PADRAO: Enquadramento = { zoom: 1, x: 0, y: 0 }

/** Menor zoom: a foto inteira cabe no quadrado. */
export const zoomMinimo = (largura: number, altura: number) => Math.min(largura, altura) / Math.max(largura, altura)

/** Tamanho da foto relativo ao lado do quadrado (1 = mesmo tamanho). */
export function proporcoes(largura: number, altura: number, zoom: number) {
  const menor = Math.min(largura, altura)
  return { rl: (zoom * largura) / menor, ra: (zoom * altura) / menor }
}

/** Mantém a foto cobrindo o quadrado (ou dentro dele, quando menor). */
export function limitar(e: Enquadramento, largura: number, altura: number): Enquadramento {
  const zoom = Math.min(Math.max(e.zoom, zoomMinimo(largura, altura)), ZOOM_MAXIMO)
  const { rl, ra } = proporcoes(largura, altura, zoom)
  const folgaX = Math.abs(rl - 1) / 2
  const folgaY = Math.abs(ra - 1) / 2
  return { zoom, x: Math.min(Math.max(e.x, -folgaX), folgaX), y: Math.min(Math.max(e.y, -folgaY), folgaY) }
}

/** Posição da foto dentro do quadrado, em % (para o CSS da prévia). */
export function estiloDaFoto(e: Enquadramento, largura: number, altura: number) {
  const { rl, ra } = proporcoes(largura, altura, e.zoom)
  return {
    width: `${rl * 100}%`,
    height: `${ra * 100}%`,
    left: `${(0.5 + e.x - rl / 2) * 100}%`,
    top: `${(0.5 + e.y - ra / 2) * 100}%`,
  }
}

export function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não foi possível abrir esta imagem. Use uma foto JPG, PNG ou WEBP.'))
    img.src = url
  })
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, qualidade))
}

/** Gera o arquivo final (quadrado de 1200 px). Fundo desfocado quando a foto não cobre tudo. */
export async function exportarFoto(img: HTMLImageElement, e: Enquadramento): Promise<File> {
  const N = TAMANHO_FOTO
  const canvas = document.createElement('canvas')
  canvas.width = N
  canvas.height = N
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Seu navegador não conseguiu processar a foto.')
  const { naturalWidth: w, naturalHeight: h } = img
  const { rl, ra } = proporcoes(w, h, e.zoom)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  if (rl < 1 || ra < 1) {
    // Desfoque que funciona em qualquer navegador: reduz para 24 px e amplia de volta.
    const mini = document.createElement('canvas')
    mini.width = 24
    mini.height = 24
    const m = mini.getContext('2d')
    if (m) {
      const escala = Math.max(24 / w, 24 / h)
      m.drawImage(img, (24 - w * escala) / 2, (24 - h * escala) / 2, w * escala, h * escala)
      ctx.drawImage(mini, -N * 0.1, -N * 0.1, N * 1.2, N * 1.2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.18)'
      ctx.fillRect(0, 0, N, N)
    }
  }

  ctx.drawImage(img, (0.5 + e.x - rl / 2) * N, (0.5 + e.y - ra / 2) * N, rl * N, ra * N)

  // JPEG: funciona em todo lugar, inclusive na prévia do link no WhatsApp (que não lida bem com WEBP).
  const blob = await paraBlob(canvas, 'image/jpeg', 0.86)
  if (!blob) throw new Error('Não foi possível gerar a foto.')
  return new File([blob], 'cerveja.jpg', { type: 'image/jpeg' })
}
