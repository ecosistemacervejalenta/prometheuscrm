'use client'

import { useRef, useTransition } from 'react'
import { PackageOpen, X } from 'lucide-react'

import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAvisos } from '@/components/ui/toaster'
import { formatarNumero } from '@/lib/format'

import { devolverEstoqueOlistPreVenda } from '../actions'

export type BaixadoNaOlist = { olist_id: number; nome: string; unidades: number }

/**
 * Botão "Devolver estoque à Olist" da pré-venda. Abre uma janela que explica o que acontece
 * e lista as cervejas; só devolve depois da confirmação.
 */
export function DevolverEstoquePreVenda({ preVendaId, titulo, baixado }: { preVendaId: string; titulo: string; baixado: BaixadoNaOlist[] }) {
  const janela = useRef<HTMLDialogElement>(null)
  const [pendente, iniciar] = useTransition()
  const avisar = useAvisos()
  const total = baixado.reduce((s, b) => s + b.unidades, 0)

  return (
    <>
      <Button variante="secundario" tamanho="md" disabled={total === 0} onClick={() => janela.current?.showModal()}>
        <PackageOpen aria-hidden /> Devolver estoque à Olist
      </Button>
      <dialog
        ref={janela}
        aria-label="Devolver o estoque desta pré-venda à Olist"
        className="m-auto w-[min(520px,calc(100vw-32px))] rounded-cartao bg-superficie p-5 text-ink shadow-flutuante backdrop:bg-ink/50"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="tipo-h3">Devolver o estoque à Olist?</h2>
            <p className="mt-1 text-[13px] text-suave">Pré-venda “{titulo}”</p>
          </div>
          <Button variante="fantasma" tamanho="icone" aria-label="Fechar" onClick={() => janela.current?.close()}>
            <X aria-hidden />
          </Button>
        </div>

        <Alert tom="alerta" titulo="Esta ação devolve o estoque na Olist de verdade">
          <p>
            {formatarNumero(total)} unidade(s) que esta pré-venda baixou voltam para o estoque da Olist. Na Olist, o lançamento fica registrado
            nas observações como <strong>DEVOLUÇÃO MANUAL</strong> feita por você pelo botão da pré-venda, e não como venda nem como devolução
            automática.
          </p>
        </Alert>

        <ul className="mt-4 divide-y divide-linha rounded-xl border border-linha">
          {baixado.map((b) => (
            <li key={b.olist_id} className="flex items-baseline justify-between gap-3 px-3 py-2 text-[14px]">
              <span className="min-w-0 truncate">{b.nome}</span>
              <span className="tipo-dado shrink-0 font-semibold">+{formatarNumero(b.unidades)}</span>
            </li>
          ))}
        </ul>

        <ul className="mt-4 list-disc space-y-1 pl-5 text-[13px] text-suave">
          <li>Os pedidos e as Caixas VIP continuam como estão no CRM.</li>
          <li>Essas unidades não voltam a ser baixadas: cancelar ou excluir esses pedidos depois não devolve de novo.</li>
          <li>Se o link estiver aberto, as vendas novas continuam baixando o estoque normalmente.</li>
          <li>Só o estoque muda na Olist. Cadastro, preço de custo e preço de venda não são tocados.</li>
        </ul>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variante="secundario" tamanho="md" onClick={() => janela.current?.close()}>
            Cancelar
          </Button>
          <Button
            variante="perigo"
            tamanho="md"
            carregando={pendente}
            onClick={() =>
              iniciar(async () => {
                const resultado = await devolverEstoqueOlistPreVenda(preVendaId)
                if (resultado.mensagem) avisar(resultado.mensagem, resultado.ok === false ? 'erro' : 'sucesso')
                if (resultado.ok !== false) janela.current?.close()
              })
            }
          >
            <PackageOpen aria-hidden /> Sim, devolver {formatarNumero(total)} unidade(s)
          </Button>
        </div>
      </dialog>
    </>
  )
}
