import { cn } from '@/lib/utils'

/** Botões e campos do link público: grandes, para o polegar (o cliente VIP compra pelo celular). */
const BASE_BOTAO =
  'inline-flex h-14 select-none items-center justify-center gap-2 rounded-2xl px-6 text-[17px] max-[360px]:px-4 font-semibold whitespace-nowrap transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-5 [&_svg]:shrink-0'

const VARIANTES = {
  volt: 'bg-volt text-ink hover:bg-volt-600',
  escuro: 'bg-ink text-white hover:bg-ink-700',
  whatsapp: 'bg-whatsapp text-white hover:bg-whatsapp-700',
  claro: 'border border-linha bg-superficie text-ink hover:bg-papel',
}

export function classeBotaoGrande(variante: keyof typeof VARIANTES = 'volt', className?: string) {
  return cn(BASE_BOTAO, VARIANTES[variante], className)
}

/** Resposta digitada em letra grande, com sublinhado (estilo Typeform). */
export const CLASSE_RESPOSTA =
  'campo-resposta block w-full rounded-none border-0 border-b-2 border-ink/15 bg-transparent px-0 pt-1 pb-3 text-[28px] leading-tight font-semibold text-ink outline-none transition-colors placeholder:font-medium placeholder:text-ink/20 focus:border-ink sm:text-[34px]'

/** Campo de apoio (rua, bairro...) — menor que a resposta principal, ainda confortável no celular. */
export const CLASSE_CAMPO =
  'campo-resposta block h-14 w-full rounded-2xl border border-linha bg-superficie px-4 text-[18px] text-ink outline-none transition-colors placeholder:text-sutil focus:border-ink focus:ring-4 focus:ring-volt/25'

/** Copia texto; usa o método antigo como reserva (navegadores embutidos de alguns apps). */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    const campo = document.createElement('textarea')
    campo.value = texto
    campo.setAttribute('readonly', '')
    campo.style.position = 'fixed'
    campo.style.opacity = '0'
    document.body.appendChild(campo)
    campo.select()
    const ok = document.execCommand('copy')
    campo.remove()
    return ok
  }
}
