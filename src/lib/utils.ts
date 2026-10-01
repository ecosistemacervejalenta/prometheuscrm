/** Junta classes CSS ignorando valores falsos. */
export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

/** Lê um parâmetro de busca (searchParams) como string única. */
export function param(valor: string | string[] | undefined): string | undefined {
  const v = Array.isArray(valor) ? valor[0] : valor
  return v && v.trim() !== '' ? v.trim() : undefined
}

/** Escapa caracteres especiais de filtros `ilike` do PostgREST. */
export function termoBusca(texto: string) {
  return texto.replace(/[%_,()]/g, ' ').trim()
}

/** "Drop de Outubro!" → "drop-de-outubro" */
export function slugificar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}
