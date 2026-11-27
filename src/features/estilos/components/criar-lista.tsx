'use client'

import { ListPlus, Megaphone } from 'lucide-react'
import { useState, useTransition } from 'react'

import { Alert } from '@/components/ui/alert'
import { Button, ButtonLink } from '@/components/ui/button'
import { formatarNumero } from '@/lib/format'

import { criarListaDoPublico } from '../actions'
import type { Periodo, SemCompra } from '../schema'

/**
 * Grava o público como lista do Banco de Leads (pasta "Clientes da loja"). Entram só os que
 * recebem campanha (com WhatsApp e sem descadastro); na campanha, a lista se comporta como
 * qualquer outra (DDD, repetidos e descadastros).
 */
export function CriarLista({
  colecoes,
  periodo,
  semCompra,
  nomeInicial,
  recebem,
}: {
  colecoes: string[]
  periodo: Periodo
  semCompra: SemCompra
  nomeInicial: string
  recebem: number
}) {
  const [nome, setNome] = useState(nomeInicial)
  const [pendente, iniciar] = useTransition()
  const [resultado, setResultado] = useState<Awaited<ReturnType<typeof criarListaDoPublico>> | null>(null)

  if (resultado?.ok) {
    return (
      <Alert tom="sucesso" titulo={resultado.mensagem}>
        <div className="mt-2 flex flex-wrap gap-2">
          {resultado.total > 0 && (
            <ButtonLink href={`/campanhas/nova?lista=${resultado.listaId}`} variante="primario" tamanho="sm">
              <Megaphone /> Criar campanha com esta lista
            </ButtonLink>
          )}
          <ButtonLink href={`/leads/listas/${resultado.listaId}`} variante="secundario" tamanho="sm">
            Ver no Banco de Leads
          </ButtonLink>
          <Button type="button" variante="fantasma" tamanho="sm" onClick={() => setResultado(null)}>
            Criar outra
          </Button>
        </div>
      </Alert>
    )
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        iniciar(async () => setResultado(await criarListaDoPublico({ nome, colecoes, periodo, semCompra })))
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-[240px] flex-1">
          <span className="tipo-rotulo mb-1 block text-suave">Nome da lista</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={110}
            required
            className="h-11 w-full rounded-xl border border-linha bg-superficie px-3 text-sm outline-none focus:border-ink focus:ring-4 focus:ring-volt/25 lg:h-10"
          />
        </label>
        <Button type="submit" variante="primario" carregando={pendente} disabled={recebem === 0} className="grow sm:grow-0">
          <ListPlus /> Criar lista para campanha
        </Button>
      </div>
      <p className="text-[12px] text-suave">
        {recebem === 0
          ? 'Ninguém deste público recebe campanha (sem WhatsApp ou descadastrado).'
          : `Entram ${formatarNumero(recebem)} ${recebem === 1 ? 'contato' : 'contatos'} com WhatsApp (quem pediu para sair das campanhas fica de fora). A lista vai para o Banco de Leads, pasta “Clientes da loja”.`}
      </p>
      {resultado && !resultado.ok && <Alert tom="erro">{resultado.mensagem}</Alert>}
    </form>
  )
}
