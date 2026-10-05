import 'server-only'

import { ImageResponse } from 'next/og'
import sharp from 'sharp'

import { formatarMoeda } from '@/lib/format'
import { urlDoSite } from '@/lib/url'

import type { PreVendaPublica } from './queries'

/**
 * Imagem da prévia do link (WhatsApp, Instagram...): 1200×630 com a foto das
 * cervejas da pré-venda, o título e os preços. Sai em JPEG (leve e aceito em
 * todo lugar — o WhatsApp ignora imagens pesadas ou em WEBP).
 */

export const TAMANHO_IMAGEM = { width: 1200, height: 630 }

const INK = '#0a0e14'
const VOLT = '#2bde94'

const cortar = (texto: string, max: number) => (texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto)

/** Foto quadrada já recortada (aceita JPEG, PNG, WEBP, AVIF) → data URI JPEG. */
async function fotoQuadrada(url: string, lado: number): Promise<string | null> {
  try {
    const resposta = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!resposta.ok) return null
    const jpeg = await sharp(Buffer.from(await resposta.arrayBuffer()))
      .rotate()
      .resize(lado, lado, { fit: 'cover' })
      .jpeg({ quality: 88 })
      .toBuffer()
    return `data:image/jpeg;base64,${jpeg.toString('base64')}`
  } catch {
    return null
  }
}

async function arquivoPublico(caminho: string): Promise<string | null> {
  try {
    const resposta = await fetch(`${await urlDoSite()}${caminho}`, { signal: AbortSignal.timeout(4000) })
    if (!resposta.ok) return null
    return `data:image/png;base64,${Buffer.from(await resposta.arrayBuffer()).toString('base64')}`
  } catch {
    return null
  }
}

/** Archivo (fonte de títulos da marca) direto do Google Fonts; sem ela, usa a fonte padrão. */
let fonteTitulo: Promise<ArrayBuffer | null> | null = null
function carregarFonteTitulo() {
  fonteTitulo ??= (async () => {
    try {
      const css = await (await fetch('https://fonts.googleapis.com/css2?family=Archivo:wght@800', { signal: AbortSignal.timeout(4000) })).text()
      const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1]
      return url ? await (await fetch(url, { signal: AbortSignal.timeout(4000) })).arrayBuffer() : null
    } catch {
      fonteTitulo = null // tenta de novo na próxima
      return null
    }
  })()
  return fonteTitulo
}

export async function gerarImagemCompartilhamento({ preVenda, itens }: PreVendaPublica): Promise<Response> {
  const comFoto = itens.filter((i) => i.imagem_url).slice(0, 4)
  const ladoFoto = comFoto.length === 1 ? 630 : 315
  const [fotos, logo, fonte] = await Promise.all([
    Promise.all(comFoto.map((i) => fotoQuadrada(i.imagem_url as string, ladoFoto))).then((l) => l.filter((f): f is string => Boolean(f))),
    arquivoPublico('/brand/logo-negativa.png'),
    carregarFonteTitulo(),
  ])

  const titulo = cortar(preVenda.titulo, 70)
  const tamanhoTitulo = titulo.length <= 22 ? 66 : titulo.length <= 44 ? 54 : 44
  const largura = fotos.length > 0 ? 570 : 1200
  const lista = itens.slice(0, fotos.length > 0 ? 3 : 4)

  const png = await new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: INK }}>
        {fotos.length > 0 && (
          <div style={{ width: 630, height: 630, display: 'flex', flexWrap: 'wrap', background: '#161c26' }}>
            {fotos.map((foto, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- imagem do ImageResponse (Satori)
              <img key={i} src={foto} width={ladoFoto} height={ladoFoto} alt="" />
            ))}
            {fotos.length === 3 && <div style={{ width: 315, height: 315, display: 'flex', background: VOLT }} />}
          </div>
        )}

        <div
          style={{
            width: largura,
            height: 630,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: fotos.length > 0 ? '48px 48px 44px' : '64px 80px 56px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', color: VOLT, fontSize: 19, fontWeight: 700, letterSpacing: 2 }}>
              {preVenda.grupoVip ? 'PRÉ-VENDA EXCLUSIVA · GRUPO VIP' : 'PRÉ-VENDA EXCLUSIVA'}
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: 18,
                color: 'white',
                fontFamily: fonte ? 'Archivo' : undefined,
                fontSize: tamanhoTitulo,
                fontWeight: 800,
                lineHeight: 1.05,
                letterSpacing: -1,
              }}
            >
              {titulo}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28 }}>
              {lista.map((item) => (
                <div
                  key={item.produto_id}
                  style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 26, color: 'rgba(255,255,255,0.82)' }}
                >
                  <span>{cortar(item.nome, fotos.length > 0 ? 24 : 48)}</span>
                  <span style={{ color: 'white', fontWeight: 700, marginLeft: 16 }}>{formatarMoeda(item.preco)}</span>
                </div>
              ))}
              {itens.length > lista.length && (
                <div style={{ display: 'flex', marginTop: 10, fontSize: 22, color: 'rgba(255,255,255,0.55)' }}>
                  + {itens.length - lista.length} cerveja(s)
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- imagem do ImageResponse (Satori)
              <img src={logo} width={200} height={36} alt="" />
            ) : (
              <div style={{ display: 'flex' }} />
            )}
            <div style={{ display: 'flex', background: VOLT, color: INK, borderRadius: 999, padding: '12px 26px', fontSize: 24, fontWeight: 800 }}>
              Garanta a sua →
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...TAMANHO_IMAGEM,
      fonts: fonte ? [{ name: 'Archivo', data: fonte, weight: 800, style: 'normal' }] : undefined,
    },
  ).arrayBuffer()

  const jpeg = await sharp(Buffer.from(png)).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
  return new Response(new Uint8Array(jpeg), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400',
    },
  })
}
