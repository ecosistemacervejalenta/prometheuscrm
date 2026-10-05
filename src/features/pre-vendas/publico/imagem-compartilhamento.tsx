import 'server-only'

import { ImageResponse } from 'next/og'
import sharp from 'sharp'

import { formatarMoeda } from '@/lib/format'
import { urlDoSite } from '@/lib/url'

import type { PreVendaPublica } from './queries'

/**
 * Imagem da prévia do link (WhatsApp, Instagram...), 1200×630 em JPEG (leve e
 * aceito em todo lugar — o WhatsApp ignora imagens pesadas ou em WEBP).
 *
 * Com foto: SÓ a foto da cerveja, inteira no centro (quadrado de 630) e as laterais
 * com a própria foto desfocada. Quando o WhatsApp recorta a prévia em quadrado,
 * sobra exatamente a foto. Com 2 a 4 cervejas com foto, o centro vira um mosaico.
 * Sem nenhuma foto: cartão da marca com o título e os preços.
 */

const LARGURA = 1200
const ALTURA = 630
const INK = '#0a0e14'
const VOLT = '#2bde94'

const CABECALHOS = {
  'Content-Type': 'image/jpeg',
  'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=86400',
}

async function baixar(url: string): Promise<Buffer | null> {
  try {
    const resposta = await fetch(url, { signal: AbortSignal.timeout(6000) })
    return resposta.ok ? Buffer.from(await resposta.arrayBuffer()) : null
  } catch {
    return null
  }
}

/** Foto(s) no centro + fundo desfocado da primeira (aceita JPEG, PNG, WEBP, AVIF). */
async function soAFoto(fotos: Buffer[]): Promise<Buffer> {
  const quadrado = (foto: Buffer, lado: number) => sharp(foto).rotate().resize(lado, lado, { fit: 'cover' }).toBuffer()
  const meio = ALTURA / 2

  const centro =
    fotos.length === 1
      ? await quadrado(fotos[0], ALTURA)
      : await sharp({ create: { width: ALTURA, height: ALTURA, channels: 3, background: INK } })
          .composite(
            await Promise.all(
              fotos.slice(0, 4).map(async (foto, i) => ({ input: await quadrado(foto, meio), left: (i % 2) * meio, top: Math.floor(i / 2) * meio })),
            ),
          )
          .png()
          .toBuffer()

  // Desfoque barato: reduz bastante, desfoca e amplia de volta.
  const pequeno = await sharp(fotos[0]).rotate().resize(120, 63, { fit: 'cover' }).blur(3).modulate({ brightness: 0.85 }).toBuffer()
  const fundo = await sharp(pequeno).resize(LARGURA, ALTURA).toBuffer()

  return sharp(fundo)
    .composite([{ input: centro, left: (LARGURA - ALTURA) / 2, top: 0 }])
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer()
}

async function logoNegativo(): Promise<string | null> {
  const logo = await baixar(`${await urlDoSite()}/brand/logo-negativa.png`)
  return logo ? `data:image/png;base64,${logo.toString('base64')}` : null
}

const cortar = (texto: string, max: number) => (texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto)

/** Reserva para pré-venda sem nenhuma foto: cartão escuro com título e preços. */
async function cartaoSemFoto({ preVenda, itens }: PreVendaPublica): Promise<Buffer> {
  const logo = await logoNegativo()
  const titulo = cortar(preVenda.titulo, 70)
  const png = await new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 80px 56px',
          background: INK,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', color: VOLT, fontSize: 22, fontWeight: 700, letterSpacing: 3 }}>
            {preVenda.grupoVip ? 'PRÉ-VENDA EXCLUSIVA · GRUPO VIP' : 'PRÉ-VENDA EXCLUSIVA'}
          </div>
          <div style={{ display: 'flex', marginTop: 20, color: 'white', fontSize: titulo.length <= 30 ? 76 : 58, fontWeight: 800, lineHeight: 1.05 }}>
            {titulo}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28 }}>
            {itens.slice(0, 4).map((item) => (
              <div key={item.produto_id} style={{ display: 'flex', marginTop: 10, fontSize: 28, color: 'rgba(255,255,255,0.82)' }}>
                {cortar(item.nome, 48)} · {formatarMoeda(item.preco)}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem do ImageResponse (Satori)
            <img src={logo} width={220} height={39} alt="" />
          ) : (
            <div style={{ display: 'flex' }} />
          )}
          <div style={{ display: 'flex', background: VOLT, color: INK, borderRadius: 999, padding: '12px 26px', fontSize: 26, fontWeight: 800 }}>
            Garanta a sua →
          </div>
        </div>
      </div>
    ),
    { width: LARGURA, height: ALTURA },
  ).arrayBuffer()
  return sharp(Buffer.from(png)).jpeg({ quality: 84, mozjpeg: true }).toBuffer()
}

export async function gerarImagemCompartilhamento(dados: PreVendaPublica): Promise<Response> {
  const urls = dados.itens.flatMap((i) => (i.imagem_url ? [i.imagem_url] : [])).slice(0, 4)
  const fotos = (await Promise.all(urls.map(baixar))).filter((f): f is Buffer => f !== null)
  const jpeg = fotos.length > 0 ? await soAFoto(fotos) : await cartaoSemFoto(dados)
  return new Response(new Uint8Array(jpeg), { headers: CABECALHOS })
}
