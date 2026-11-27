'use client'

import { Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'

import { useAvisos } from '@/components/ui/toaster'

import { classificarColecao } from '../actions'
import { TIPOS_DE_COLECAO, type TipoColecao } from '../classificacao'

/** Tipo de uma collection; grava ao trocar (e a leitura da loja não desfaz). */
export function SeletorDeTipo({ id, titulo, tipo }: { id: string; titulo: string; tipo: TipoColecao }) {
  const [valor, setValor] = useState(tipo)
  const [pendente, iniciar] = useTransition()
  const avisar = useAvisos()

  return (
    <span className="inline-flex items-center gap-2">
      <select
        aria-label={`Tipo de ${titulo}`}
        value={valor}
        disabled={pendente}
        onChange={(e) => {
          const novo = e.target.value as TipoColecao
          const anterior = valor
          setValor(novo)
          iniciar(async () => {
            const r = await classificarColecao(id, novo)
            if (r.ok === false) {
              setValor(anterior)
              avisar(r.mensagem ?? 'Não foi possível trocar o tipo.', 'erro')
            }
          })
        }}
        className="h-9 rounded-lg border border-linha bg-superficie px-2 text-sm font-medium outline-none focus:border-ink"
      >
        {TIPOS_DE_COLECAO.map((t) => (
          <option key={t.valor} value={t.valor}>
            {t.rotulo}
          </option>
        ))}
      </select>
      {pendente && <Loader2 className="size-4 animate-spin text-suave" aria-label="Salvando" />}
    </span>
  )
}
