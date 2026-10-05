import { AtSign, Phone, Type, User, type LucideIcon } from 'lucide-react'

import type { TipoColuna } from '../planilha'

/** Ícone de cada tipo de coluna (cabeçalhos da prévia e da lista). */
export const ICONE_TIPO: Record<TipoColuna, LucideIcon> = { nome: User, telefone: Phone, email: AtSign, texto: Type }
