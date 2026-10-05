'use client'

import { Beer, ImagePlus, Pencil, Plus } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { ActionForm, SubmitButton, type AcaoFormulario } from '@/components/form/action-form'
import { Field, FormActions, FormSection, Input, Select, Textarea } from '@/components/form/fields'
import { Button, ButtonLink } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { CervejaSalva } from '@/features/produtos/actions'
import { FotoProduto } from '@/features/produtos/components/foto-produto'
import { JanelaCerveja } from '@/features/produtos/components/janela-cerveja'
import { formatarMoeda, lerDinheiro, valorParaInput } from '@/lib/format'
import { CANAIS } from '@/lib/rotulos'
import { cn } from '@/lib/utils'
import type { CanalVenda, PreVenda } from '@/types'

type Produto = CervejaSalva

type ItemInicial = {
  produto_id: string
  preco: number
  limite_por_cliente: number | null
  quantidade_disponivel: number | null
  ordem: number
}

type LinhaItem = { incluido: boolean; preco: string; limite: string; estoque: string; ordem: number }

export function FormularioPreVenda({
  acao,
  produtos,
  preVenda,
  itensIniciais = [],
  encerraEmLocal,
}: {
  acao: AcaoFormulario
  produtos: Produto[]
  preVenda?: PreVenda | null
  itensIniciais?: ItemInicial[]
  encerraEmLocal?: string
}) {
  // Estado inicial calculado uma única vez: linhas por produto + ordem de exibição
  // (incluídos primeiro, na ordem salva). A ordem não muda enquanto o usuário marca itens.
  const [inicial] = useState(() => {
    const linhasIniciais: Record<string, LinhaItem> = Object.fromEntries(
      produtos.map((p) => {
        const item = itensIniciais.find((i) => i.produto_id === p.id)
        return [
          p.id,
          {
            incluido: Boolean(item),
            preco: valorParaInput(item?.preco ?? p.preco),
            limite: item?.limite_por_cliente ? String(item.limite_por_cliente) : '',
            estoque: item?.quantidade_disponivel ? String(item.quantidade_disponivel) : '',
            ordem: item?.ordem ?? 999,
          },
        ]
      }),
    )
    const ordem = [...produtos].sort((a, b) => {
      const la = linhasIniciais[a.id]
      const lb = linhasIniciais[b.id]
      return Number(lb.incluido) - Number(la.incluido) || la.ordem - lb.ordem || a.nome.localeCompare(b.nome)
    })
    return { linhasIniciais, ordem }
  })
  const [catalogo, setCatalogo] = useState(produtos)
  const [linhas, setLinhas] = useState(inicial.linhasIniciais)
  const [ordem, setOrdem] = useState(() => inicial.ordem.map((p) => p.id))
  const [janela, setJanela] = useState<{ cerveja?: Produto } | null>(null)
  const porId = new Map(catalogo.map((p) => [p.id, p]))
  const ordenados = ordem.flatMap((id) => porId.get(id) ?? [])

  const selecionados = ordenados.filter((p) => linhas[p.id].incluido)
  const itensJson = JSON.stringify(
    selecionados.map((p) => ({
      produto_id: p.id,
      preco: lerDinheiro(linhas[p.id].preco || '0'),
      limite_por_cliente: linhas[p.id].limite || null,
      quantidade_disponivel: linhas[p.id].estoque || null,
    })),
  )

  const alterar = (id: string, campo: keyof LinhaItem, valor: string | boolean) =>
    setLinhas((atual) => ({ ...atual, [id]: { ...atual[id], [campo]: valor } }))

  /** Cerveja cadastrada na janela: entra no catálogo já marcada (depois das já incluídas). */
  function aoSalvarCerveja(cerveja: Produto) {
    if (porId.has(cerveja.id)) {
      setCatalogo((atual) => atual.map((p) => (p.id === cerveja.id ? cerveja : p)))
      return
    }
    setCatalogo((atual) => [...atual, cerveja])
    setLinhas((atual) => ({
      ...atual,
      [cerveja.id]: { incluido: true, preco: valorParaInput(cerveja.preco), limite: '', estoque: '', ordem: 999 },
    }))
    setOrdem((atual) => [...atual.filter((id) => linhas[id]?.incluido), cerveja.id, ...atual.filter((id) => !linhas[id]?.incluido)])
  }

  return (
    <Card className="px-5 pt-6 sm:px-6">
      <ActionForm action={acao}>
        <input type="hidden" name="itens" value={itensJson} />

        <FormSection titulo="Campanha" descricao="Aparece no topo da página que o cliente abre.">
          <Field label="Título" name="titulo" obrigatorio className="sm:col-span-6">
            <Input name="titulo" defaultValue={preVenda?.titulo} placeholder="Ex.: Drop de Outubro" autoFocus={!preVenda} />
          </Field>
          <Field label="Descrição" name="descricao" className="sm:col-span-6">
            <Textarea name="descricao" defaultValue={preVenda?.descricao ?? ''} placeholder="Conte o que tem de especial, prazo de entrega, regras..." />
          </Field>
          <Field label="Canal" name="canal" className="sm:col-span-2" dica="Grupo VIP marca o comprador como VIP.">
            <Select name="canal" defaultValue={preVenda?.canal ?? 'grupo_vip'}>
              {(Object.keys(CANAIS) as CanalVenda[]).map((c) => (
                <option key={c} value={c}>
                  {CANAIS[c].rotulo}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Situação" name="status" className="sm:col-span-2">
            <Select name="status" defaultValue={preVenda?.status ?? 'ativa'}>
              <option value="ativa">Ativa (aceitando pedidos)</option>
              <option value="rascunho">Rascunho</option>
              <option value="encerrada">Encerrada</option>
            </Select>
          </Field>
          <Field label="Link personalizado" name="slug" className="sm:col-span-2" dica="Opcional. Ex.: drop-outubro">
            <Input name="slug" defaultValue={preVenda?.slug ?? ''} placeholder="gerado pelo título" />
          </Field>
        </FormSection>

        <FormSection titulo="Prazos e entrega">
          <Field label="Encerra em" name="encerra_em" className="sm:col-span-2" dica="Depois disso o link para de aceitar pedidos.">
            <Input name="encerra_em" type="datetime-local" defaultValue={encerraEmLocal ?? ''} />
          </Field>
          <Field label="Previsão de entrega" name="previsao_entrega" className="sm:col-span-2">
            <Input name="previsao_entrega" type="date" defaultValue={preVenda?.previsao_entrega ?? ''} />
          </Field>
          <div className="rounded-xl bg-papel p-3 text-[13px] text-suave sm:col-span-2">
            <p className="font-semibold text-ink">Frete do link</p>
            Valor fixo para os CEPs da lista VIP; os demais ficam “a cotar”.{' '}
            <Link href="/configuracoes/frete" className="font-semibold text-volt-700 hover:text-ink">
              Configurar
            </Link>
          </div>
        </FormSection>

        <FormSection
          titulo="Cervejas"
          descricao={`${selecionados.length} selecionada(s). Cadastre aqui mesmo, com foto e descrição. Preço da pré-venda, limite por cliente e quantidade total são opcionais.`}
        >
          <Field label="Cervejas da pré-venda" name="itens" className="sm:col-span-6">
            {catalogo.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-linha-forte px-6 py-10 text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-volt-50 text-volt-700">
                  <Beer className="size-6" aria-hidden />
                </span>
                <p className="font-semibold">Nenhuma cerveja cadastrada ainda</p>
                <p className="max-w-sm text-sm text-suave">Cadastre com foto e descrição — ela já entra nesta pré-venda e fica salva no catálogo.</p>
                <Button variante="escuro" onClick={() => setJanela({})}>
                  <Plus /> Cadastrar a primeira cerveja
                </Button>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-linha rounded-xl border border-linha">
                  {ordenados.map((p) => {
                    const linha = linhas[p.id]
                    const incompleta = !p.imagem_url || !p.descricao
                    return (
                      <li key={p.id} className={cn('grid gap-3 p-3 sm:grid-cols-[1fr_auto] sm:items-center', linha.incluido && 'bg-volt-50')}>
                        <div className="flex min-w-0 items-center gap-3">
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                            <input
                              type="checkbox"
                              checked={linha.incluido}
                              onChange={(e) => alterar(p.id, 'incluido', e.target.checked)}
                              className="size-[18px] shrink-0 accent-[#0a0e14]"
                            />
                            <FotoProduto url={p.imagem_url} nome={p.nome} className="size-12" />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">{p.nome}</span>
                              <span className="block truncate text-[12px] text-suave">
                                {[p.estilo, p.volume_ml ? `${p.volume_ml} ml` : null].filter(Boolean).join(' · ') || 'Sem detalhes'} · catálogo{' '}
                                {formatarMoeda(p.preco)}
                              </span>
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setJanela({ cerveja: p })}
                            className={cn(
                              'inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-semibold hover:bg-ink/5',
                              incompleta && linha.incluido ? 'text-alerta' : 'text-volt-700',
                            )}
                          >
                            {incompleta ? <ImagePlus className="size-3.5" aria-hidden /> : <Pencil className="size-3.5" aria-hidden />}
                            {incompleta ? (p.imagem_url ? 'Pôr descrição' : 'Pôr foto') : 'Editar'}
                          </button>
                        </div>
                        {linha.incluido && (
                          <div className="grid grid-cols-3 gap-2 sm:w-[360px]">
                            <label className="text-[11px] font-semibold text-suave">
                              Preço
                              <input
                                value={linha.preco}
                                onChange={(e) => alterar(p.id, 'preco', e.target.value)}
                                inputMode="decimal"
                                className="tipo-dado mt-1 h-9 w-full rounded-lg border border-linha bg-superficie px-2 text-ink"
                              />
                            </label>
                            <label className="text-[11px] font-semibold text-suave">
                              Limite/cliente
                              <input
                                value={linha.limite}
                                onChange={(e) => alterar(p.id, 'limite', e.target.value.replace(/\D/g, ''))}
                                inputMode="numeric"
                                placeholder="∞"
                                className="tipo-dado mt-1 h-9 w-full rounded-lg border border-linha bg-superficie px-2 text-ink"
                              />
                            </label>
                            <label className="text-[11px] font-semibold text-suave">
                              Qtd. total
                              <input
                                value={linha.estoque}
                                onChange={(e) => alterar(p.id, 'estoque', e.target.value.replace(/\D/g, ''))}
                                inputMode="numeric"
                                placeholder="∞"
                                className="tipo-dado mt-1 h-9 w-full rounded-lg border border-linha bg-superficie px-2 text-ink"
                              />
                            </label>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <Button className="mt-3 max-sm:w-full" onClick={() => setJanela({})}>
                  <Plus /> Cadastrar nova cerveja
                </Button>
              </>
            )}
          </Field>
        </FormSection>

        <FormActions>
          <ButtonLink href={preVenda ? `/pre-vendas/${preVenda.id}` : '/pre-vendas'} variante="fantasma">
            Cancelar
          </ButtonLink>
          <SubmitButton>{preVenda ? 'Salvar pré-venda' : 'Criar pré-venda e gerar link'}</SubmitButton>
        </FormActions>
      </ActionForm>
      {janela && (
        <JanelaCerveja
          cerveja={janela.cerveja}
          precoNaPreVenda={janela.cerveja ? lerDinheiro(linhas[janela.cerveja.id]?.preco || '0') || janela.cerveja.preco : undefined}
          aoSalvar={aoSalvarCerveja}
          aoFechar={() => setJanela(null)}
        />
      )}
    </Card>
  )
}
