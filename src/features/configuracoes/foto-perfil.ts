import { limitar, proporcoes, type Enquadramento } from '@/features/produtos/foto'

/**
 * Foto de perfil: recorte quadrado + compressão no navegador, antes do envio.
 * O CRM mostra a foto num círculo inscrito nesse quadrado; aqui a foto sempre
 * cobre o quadrado inteiro (zoom ≥ 1), para o círculo não ter bordas vazias.
 */

export const TAMANHO_FOTO_PERFIL = 512
/** Limite do arquivo original escolhido (o enviado tem poucas dezenas de KB). */
export const MAX_ARQUIVO_ORIGINAL = 25 * 1024 * 1024

/** Mantém a foto cobrindo o círculo (sem o modo "foto inteira" das fotos de produto). */
export function limitarFotoPerfil(e: Enquadramento, largura: number, altura: number): Enquadramento {
  return limitar({ ...e, zoom: Math.max(e.zoom, 1) }, largura, altura)
}

/** Gera o arquivo final: quadrado de 512 px em JPEG. */
export async function exportarFotoPerfil(img: HTMLImageElement, e: Enquadramento): Promise<File> {
  const N = TAMANHO_FOTO_PERFIL
  const canvas = document.createElement('canvas')
  canvas.width = N
  canvas.height = N
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Seu navegador não conseguiu processar a foto.')
  const { rl, ra } = proporcoes(img.naturalWidth, img.naturalHeight, e.zoom)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // Fundo branco: PNG com transparência não vira preto no JPEG.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, N, N)
  ctx.drawImage(img, (0.5 + e.x - rl / 2) * N, (0.5 + e.y - ra / 2) * N, rl * N, ra * N)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
  if (!blob) throw new Error('Não foi possível gerar a foto.')
  return new File([blob], 'perfil.jpg', { type: 'image/jpeg' })
}
