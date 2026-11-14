import 'server-only'

import sharp from 'sharp'

import type { exigirEquipe } from '@/lib/auth'

type Supabase = Awaited<ReturnType<typeof exigirEquipe>>['supabase']

const LADO = 1200
const MAXIMO_BYTES = 15 * 1024 * 1024

/**
 * Copia a foto principal do produto da Olist para o bucket "produtos" do CRM, no mesmo padrão
 * das fotos enviadas pela equipe: quadrado de 1200 px em JPEG, com fundo desfocado quando a
 * foto não é quadrada. Assim o link não depende do endereço da imagem na Olist.
 * Devolve a URL pública, ou null se a foto não puder ser baixada (a equipe põe depois).
 */
export async function copiarFotoDaOlist(supabase: Supabase, url: string): Promise<string | null> {
  try {
    const resposta = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    const tipo = resposta.headers.get('content-type') ?? ''
    if (!resposta.ok || (tipo && !tipo.startsWith('image/') && !tipo.includes('octet-stream'))) return null
    const original = Buffer.from(await resposta.arrayBuffer())
    if (original.byteLength === 0 || original.byteLength > MAXIMO_BYTES) return null

    // Desfoque barato do fundo: reduz bastante, desfoca e amplia de volta.
    const pequeno = await sharp(original).rotate().resize(32, 32, { fit: 'cover' }).blur(2).toBuffer()
    const fundo = await sharp(pequeno).resize(LADO, LADO).toBuffer()
    const frente = await sharp(original).rotate().resize(LADO, LADO, { fit: 'inside' }).toBuffer()
    const foto = await sharp(fundo)
      .composite([
        { input: { create: { width: LADO, height: LADO, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0.18 } } } },
        { input: frente, gravity: 'center' },
      ])
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer()

    const caminho = `${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage.from('produtos').upload(caminho, foto, {
      contentType: 'image/jpeg',
      cacheControl: '31536000',
      upsert: false,
    })
    if (error) {
      console.error('[olist] foto do produto', error.message)
      return null
    }
    return supabase.storage.from('produtos').getPublicUrl(caminho).data.publicUrl
  } catch (erro) {
    console.error('[olist] não foi possível copiar a foto', erro instanceof Error ? erro.message : erro)
    return null
  }
}
