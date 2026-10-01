import Image from 'next/image'

import { cn } from '@/lib/utils'

/**
 * Elementos da marca Prometheus.
 * O logotipo é um desenho próprio: sempre use os arquivos de /public/brand,
 * nunca redigite "PROMETHEUS" com fonte (regra do Brand Kit).
 */

const CAMINHO_QUADRO =
  'M67.0 0.8L76.3 0.0L232.3 0.0L240.3 0.4L247.3 1.4L252.3 2.5L261.3 5.5L271.3 10.5L277.3 14.4L284.0 19.8L289.3 25.1L296.6 33.8L299.8 38.8L304.3 47.8L307.7 56.8L310.3 68.8L311.0 76.8L311.0 233.8L310.7 240.8L309.5 248.8L306.6 258.8L301.7 269.8L294.4 280.8L288.1 287.8L278.3 296.2L272.3 300.2L265.3 304.0L254.3 308.1L243.3 310.4L235.3 311.2L76.3 311.2L65.3 310.2L56.3 308.0L48.3 305.1L38.3 300.1L32.3 296.1L25.3 290.2L18.1 282.8L9.9 270.8L5.1 260.8L2.1 251.8L1.1 246.8L0.1 235.8L0.0 79.8L1.2 65.8L4.0 54.8L9.1 42.8L16.0 31.8L24.3 22.4L35.3 13.4L43.3 8.7L55.3 3.6Z'

const CAMINHO_RAIO =
  'M164.9 63.8L169.3 63.6L172.3 64.5L175.3 66.3L177.8 68.8L179.0 70.8L180.0 73.8L180.3 76.8L179.6 81.8L165.1 126.8L164.0 130.8L164.1 131.8L165.3 132.2L223.3 132.2L227.3 132.5L232.3 134.4L235.3 136.6L237.5 138.8L239.7 142.8L240.5 145.8L240.7 149.8L239.5 154.8L237.1 158.8L150.8 246.8L149.3 248.1L146.3 249.5L141.3 250.0L138.3 249.2L135.3 247.5L132.8 244.8L131.2 241.8L130.1 235.8L131.3 229.8L144.7 188.8L146.5 182.8L146.4 181.8L145.3 181.4L87.3 181.4L83.3 181.0L80.3 179.9L77.3 178.0L73.3 173.6L71.1 168.8L70.7 162.8L71.1 159.8L72.3 156.8L75.2 152.8L159.3 66.7L162.3 64.5Z'

const CORES_ICONE = {
  cor: { quadro: '#2BDE94', raio: '#0A0E14' },
  escuro: { quadro: '#0A0E14', raio: '#2BDE94' },
  'mono-preto': { quadro: '#0A0E14', raio: '#FFFFFF' },
  'mono-branco': { quadro: '#FFFFFF', raio: '#0A0E14' },
} as const

/** Ícone isolado (mínimo 16 px). */
export function Icone({
  variante = 'cor',
  tamanho = 32,
  className,
}: {
  variante?: keyof typeof CORES_ICONE
  tamanho?: number
  className?: string
}) {
  const cores = CORES_ICONE[variante]
  return (
    <svg
      viewBox="0 0 311.1 311.2"
      width={Math.max(tamanho, 16)}
      height={Math.max(tamanho, 16)}
      className={cn('shrink-0', className)}
      role="img"
      aria-label="Prometheus"
    >
      <path fill={cores.quadro} d={CAMINHO_QUADRO} />
      <path fill={cores.raio} d={CAMINHO_RAIO} />
    </svg>
  )
}

const ARQUIVOS_LOGO = {
  cor: '/brand/logo-cor.png', // fundo claro
  negativa: '/brand/logo-negativa.png', // fundo escuro
  'sobre-volt': '/brand/logo-sobre-volt.png', // fundo Volt
  'mono-preto': '/brand/logo-mono-preto.png',
  'mono-branco': '/brand/logo-mono-branco.png',
} as const

/** Logotipo completo (largura mínima 120 px — abaixo disso use só o ícone). */
export function Logo({
  variante = 'cor',
  largura = 140,
  className,
  prioridade,
}: {
  variante?: keyof typeof ARQUIVOS_LOGO
  largura?: number
  className?: string
  prioridade?: boolean
}) {
  const l = Math.max(largura, 120)
  return (
    <Image
      src={ARQUIVOS_LOGO[variante]}
      alt="Prometheus"
      width={l}
      height={Math.round((l * 215) / 1200)}
      loading={prioridade ? 'eager' : undefined}
      className={cn('h-auto select-none', className)}
    />
  )
}
