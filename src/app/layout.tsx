import type { Metadata, Viewport } from 'next'
import { Archivo, Geist, Geist_Mono } from 'next/font/google'

import './globals.css'

const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
})

const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})

const urlBase =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')

export const metadata: Metadata = {
  metadataBase: new URL(urlBase),
  title: {
    default: 'Prometheus CRM',
    template: '%s · Prometheus',
  },
  description: 'CRM integrado: Shopify · App · Grupo VIP.',
  applicationName: 'Prometheus CRM',
  robots: { index: false, follow: false },
  // iPhone: "Adicionar à Tela de Início" abre como app (sem barra do Safari).
  appleWebApp: { capable: true, title: 'Prometheus', statusBarStyle: 'default' },
  // Evita que o iOS transforme números (WhatsApp, CEP, valores) em links azuis.
  formatDetection: { telephone: false, address: false, email: false, date: false },
}

export const viewport: Viewport = {
  // Mobile usa o fundo claro do app; desktop mantém a cor escura da barra lateral.
  themeColor: [
    { media: '(max-width: 1023.98px)', color: '#f5f6f8' },
    { media: '(min-width: 1024px)', color: '#0a0e14' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Ocupa a tela inteira do iPhone (notch / Dynamic Island); o layout respeita as safe areas.
  viewportFit: 'cover',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={`${archivo.variable} ${geist.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
