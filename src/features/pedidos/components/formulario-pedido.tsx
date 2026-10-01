'use client'

import { Minus, Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState, useTransition } from 'react'

import { ActionForm, SubmitButton, type AcaoFormulario } from '@/components/form/action-form'
import { Field, FormActions, FormSection, MoneyInput, Select, Textarea } from '@/components/form/fields'
import { ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { buscarClientes } from '@/features/clientes/actions'
import { formatarMoeda, formatarWhatsapp, valorParaInput } from '@/lib/format'
import { CANAIS } from '@/lib/rotulos'
import { cn } from '@/lib/utils'
import type { CanalVenda } from '@/types'

type ClienteOpcao = { id: string; nome: string; whatsapp: string | null; logradouro: string | null; vip: boolean }
type ProdutoOpcao = { produto_id: string; nome: string; detalhe: string; preco: number }
type PreVendaOpcao = { id: string; titulo: string; canal: CanalVenda; taxa_entrega: number; itens: ProdutoOpcao[] }

/** Busca de cliente com sugestões (server action). */
function SeletorCliente({ inicial }: { inicial: ClienteOpcao | null }) {
  const [selecionado, setSelecionado] = useState<ClienteOpcao | null>(inicial)
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<ClienteOpcao[]>([])
  const [, iniciar] = useTransition()

  useEffect(() => {
    if (texto.trim().length < 2) return
    const espera = setTimeout(() => {
      iniciar(async () => setResultados(await buscarClientes(texto)))
    }, 250)
    return () => clearTimeout(espera)
  }, [texto])

  if (selecionado) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-ink bg-volt-50 px-4 py-3">
        <input type="hidden" name="cliente_id" value={selecionado.id} />
        <div className="min-w-0">
          <p className="font-semibold">{selecionado.nome}</p>
          <p className="tipo-dado text-[13px] text-suave">
            {formatarWhatsapp(selecionado.whatsapp)}
            {!selecionado.logradouro && ' · sem endereço cadastrado'}
          </p>
        </div>
        <button type="button" onClick={() => setSelecionado(null)} className="grid size-8 place-items-center rounded-lg hover:bg-white" aria-label="Trocar cliente">
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-sutil" aria-hidden />
      <input
        id="cliente_id"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Digite o nome ou WhatsApp do cliente"
        autoComplete="off"
        className="h-11 w-full rounded-xl border border-linha bg-superficie pr-3 pl-10 text-[15px] outline-none focus:border-ink focus:ring-4 focus:ring-volt/25"
      />
      {texto.trim().length >= 2 && resultados.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-linha bg-superficie shadow-flutuante">
          {resultados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setSelecionado(c)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-papel"
              >
                <span className="font-medium">{c.nome}</span>
                <span className="tipo-dado text-[12px] text-suave">{formatarWhatsapp(c.whatsapp)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function FormularioPedido({
  acao,
  clienteInicial,
  preVendas,
  produtosAvulsos,
  preVendaInicial,
}: {
  acao: AcaoFormulario
  clienteInicial: ClienteOpcao | null
  preVendas: PreVendaOpcao[]
  produtosAvulsos: ProdutoOpcao[]
  preVendaInicial?: string
}) {
  const [preVendaId, setPreVendaId] = useState(preVendaInicial ?? '')
  const [quantidades, setQuantidades] = useState<Record<string, number>>({})
  const preVenda = preVendas.find((p) => p.id === preVendaId)
  const catalogo = preVenda ? preVenda.itens : produtosAvulsos
  const [canal, setCanal] = useState<CanalVenda>(preVenda?.canal ?? 'whatsapp')

  const itens = useMemo(
    () => Object.entries(quantidades).filter(([, q]) => q > 0).map(([produto_id, quantidade]) => ({ produto_id, quantidade })),
    [quantidades],
  )
  const subtotal = itens.reduce((s, i) => s + (catalogo.find((p) => p.produto_id === i.produto_id)?.preco ?? 0) * i.quantidade, 0)

  const alterar = (id: string, delta: number) =>
    setQuantidades((atual) => ({ ...atual, [id]: Math.max(0, (atual[id] ?? 0) + delta) }))

  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <input type="hidden" name="itens" value={JSON.stringify(itens)} />

        <FormSection titulo="Cliente">
          <Field label="Cliente" name="cliente_id" obrigatorio className="sm:col-span-6">
            <SeletorCliente inicial={clienteInicial} />
          </Field>
        </FormSection>

        <FormSection titulo="Origem" descricao="Vincule a uma pré-venda para usar os preços e limites dela.">
          <Field label="Pré-venda" name="pre_venda_id" className="sm:col-span-4">
            <Select
              name="pre_venda_id"
              value={preVendaId}
              onChange={(e) => {
                const nova = preVendas.find((p) => p.id === e.target.value)
                setPreVendaId(e.target.value)
                setQuantidades({})
                if (nova) setCanal(nova.canal)
              }}
            >
              <option value="">Venda avulsa (preço de catálogo)</option>
              {preVendas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Canal" name="canal" className="sm:col-span-2">
            <Select name="canal" value={canal} onChange={(e) => setCanal(e.target.value as CanalVenda)}>
              {(Object.keys(CANAIS) as CanalVenda[]).map((c) => (
                <option key={c} value={c}>
                  {CANAIS[c].rotulo}
                </option>
              ))}
            </Select>
          </Field>
        </FormSection>

        <FormSection titulo="Cervejas" descricao={`${itens.reduce((s, i) => s + i.quantidade, 0)} unidade(s) · ${formatarMoeda(subtotal)}`}>
          <Field label="Itens" name="itens" className="sm:col-span-6">
            <ul className="divide-y divide-linha rounded-xl border border-linha">
              {catalogo.length === 0 && <li className="p-4 text-sm text-suave">Nenhum produto disponível.</li>}
              {catalogo.map((p) => {
                const qtd = quantidades[p.produto_id] ?? 0
                return (
                  <li key={p.produto_id} className={cn('flex items-center gap-3 px-4 py-3', qtd > 0 && 'bg-volt-50')}>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{p.nome}</p>
                      <p className="text-[13px] text-suave">
                        {p.detalhe} · <span className="tipo-dado">{formatarMoeda(p.preco)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => alterar(p.produto_id, -1)} className="grid size-8 place-items-center rounded-lg border border-linha bg-superficie" aria-label={`Menos ${p.nome}`}>
                        <Minus className="size-4" />
                      </button>
                      <span className="tipo-dado w-8 text-center">{qtd}</span>
                      <button type="button" onClick={() => alterar(p.produto_id, 1)} className="grid size-8 place-items-center rounded-lg bg-ink text-white" aria-label={`Mais ${p.nome}`}>
                        <Plus className="size-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Field>
        </FormSection>

        <FormSection titulo="Valores">
          <Field label="Taxa de entrega" name="taxa_entrega" className="sm:col-span-3">
            <MoneyInput key={preVendaId} name="taxa_entrega" defaultValue={valorParaInput(preVenda?.taxa_entrega ?? 0)} />
          </Field>
          <Field label="Desconto" name="desconto" className="sm:col-span-3">
            <MoneyInput name="desconto" defaultValue="" />
          </Field>
          <Field label="Observações" name="observacoes" className="sm:col-span-6">
            <Textarea name="observacoes" placeholder="Ex.: entregar após as 18h" />
          </Field>
        </FormSection>

        <FormActions>
          <ButtonLink href="/pedidos" variante="fantasma">Cancelar</ButtonLink>
          <SubmitButton>Criar pedido · {formatarMoeda(subtotal)}</SubmitButton>
        </FormActions>
      </ActionForm>
    </Card>
  )
}
