import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Prometheus CRM',
    short_name: 'Prometheus',
    description: 'CRM integrado: Shopify · App · Grupo VIP.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0e14',
    theme_color: '#0a0e14',
    lang: 'pt-BR',
    icons: [
      { src: '/brand/android-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/android-icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/ios-app-icon-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
