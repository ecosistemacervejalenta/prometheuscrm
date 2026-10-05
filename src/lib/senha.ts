import 'server-only'

import { randomInt } from 'node:crypto'

// Sem caracteres ambíguos (0/O, 1/l/I) para quem vai digitar a senha lendo do WhatsApp.
const MINUSCULAS = 'abcdefghjkmnpqrstuvwxyz'
const MAIUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITOS = '23456789'
const TODOS = MINUSCULAS + MAIUSCULAS + DIGITOS

/** Senha temporária aleatória no formato `xxxx-xxxx-xxxx` (letras maiúsculas, minúsculas e números). */
export function gerarSenhaTemporaria(): string {
  for (;;) {
    const caracteres = Array.from({ length: 12 }, () => TODOS[randomInt(TODOS.length)])
    const senha = [0, 4, 8].map((i) => caracteres.slice(i, i + 4).join('')).join('-')
    if ([MINUSCULAS, MAIUSCULAS, DIGITOS].every((grupo) => caracteres.some((c) => grupo.includes(c)))) return senha
  }
}
