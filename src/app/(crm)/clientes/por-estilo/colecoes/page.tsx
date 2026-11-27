import type { Metadata } from 'next'
import { Hop } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar, SearchField } from '@/components/ui/filter-bar'
import { ItemMobile, ListaMobile } from '@/components/ui/lista-mobile'
import { PageHeader } from '@/components/ui/page-header'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { TabsLinks } from '@/components/ui/tabs'
import { semAcento, TIPOS_DE_COLECAO, type TipoColecao } from '@/features/estilos/classificacao'
import { SeletorDeTipo } from '@/features/estilos/components/seletor-de-tipo'
import { colecoesDaLoja } from '@/features/estilos/queries'
import { formatarNumero } from '@/lib/format'
import { param } from '@/lib/utils'

export const metadata: Metadata = { title: 'Organizar collections' }

export default async function PaginaOrganizarColecoes({ searchParams }: PageProps<'/clientes/por-estilo/colecoes'>) {
  const busca = await searchParams
  const ver = (TIPOS_DE_COLECAO.find((t) => t.valor === param(busca.ver))?.valor ?? 'todas') as TipoColecao | 'todas'
  const q = param(busca.q) ?? ''
  const colecoes = await colecoesDaLoja()

  const termo = semAcento(q)
  const visiveis = colecoes.filter((c) => (ver === 'todas' || c.tipo === ver) && (!termo || semAcento(c.titulo).includes(termo)))
  const href = (tipo: string) => {
    const p = new URLSearchParams()
    if (tipo !== 'todas') p.set('ver', tipo)
    if (q) p.set('q', q)
    const s = p.toString()
    return s ? `/clientes/por-estilo/colecoes?${s}` : '/clientes/por-estilo/colecoes'
  }

  return (
    <>
      <PageHeader
        titulo="Organizar collections"
        contexto="Clientes por estilo"
        descricao="O CRM sugere o tipo de cada collection da loja. Corrija o que estiver errado: estilos e cervejarias aparecem para montar o público; “Ignorar” tira a collection (copos, acessórios)."
        voltar={{ href: '/clientes/por-estilo', rotulo: 'Clientes por estilo' }}
      />

      <TabsLinks
        ativa={ver}
        abas={[
          { chave: 'todas', rotulo: 'Todas', href: href('todas'), contagem: colecoes.length },
          ...TIPOS_DE_COLECAO.map((t) => ({ chave: t.valor, rotulo: t.plural, href: href(t.valor), contagem: colecoes.filter((c) => c.tipo === t.valor).length })),
        ]}
      />

      <FilterBar caminho="/clientes/por-estilo/colecoes" className="mb-4">
        {ver !== 'todas' && <input type="hidden" name="ver" value={ver} />}
        <SearchField valor={q} placeholder="Buscar collection" />
      </FilterBar>

      <Card className="min-w-0">
        {visiveis.length === 0 ? (
          <EmptyState
            icone={Hop}
            titulo={colecoes.length === 0 ? 'Nenhuma collection lida ainda' : 'Nenhuma collection aqui'}
            descricao={colecoes.length === 0 ? 'Em Clientes por estilo, clique em “Atualizar agora” para ler a loja.' : undefined}
          />
        ) : (
          <>
            <Table somenteDesktop>
              <THead>
                <TR>
                  <TH>Collection</TH>
                  <TH className="text-right">Produtos</TH>
                  <TH>Tipo</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {visiveis.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-semibold">{c.titulo}</TD>
                    <TD className="tipo-dado text-right">{formatarNumero(c.produtos)}</TD>
                    <TD>
                      <SeletorDeTipo id={c.id} titulo={c.titulo} tipo={c.tipo} />
                    </TD>
                    <TD className="space-x-1.5 text-right whitespace-nowrap">
                      {!c.ativa && <Badge tom="alerta">fora da loja</Badge>}
                      <Badge tom={c.tipo_manual ? 'escuro' : 'neutro'}>{c.tipo_manual ? 'escolhido pela equipe' : 'sugestão do CRM'}</Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <ListaMobile>
              {visiveis.map((c) => (
                <ItemMobile
                  key={c.id}
                  titulo={c.titulo}
                  subtitulo={`${formatarNumero(c.produtos)} produtos · ${c.tipo_manual ? 'escolhido pela equipe' : 'sugestão do CRM'}${c.ativa ? '' : ' · fora da loja'}`}
                  fim={<SeletorDeTipo id={c.id} titulo={c.titulo} tipo={c.tipo} />}
                />
              ))}
            </ListaMobile>
          </>
        )}
      </Card>
    </>
  )
}
