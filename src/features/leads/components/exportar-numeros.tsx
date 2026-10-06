'use client'

import { FileSpreadsheet, FileText } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { useAvisos } from '@/components/ui/toaster'
import { formatarNumero } from '@/lib/format'

import { buscarNumerosParaExportar } from '../actions'
import { NUMEROS_POR_PAGINA, type LinhaExportacao } from '../schema'

type Formato = 'xlsx' | 'csv'

function nomeDoArquivo(base: string, ddd: string | null, formato: Formato) {
  const slug =
    base
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'leads'
  return `${slug}-${ddd ? `ddd-${ddd}` : 'todos'}.${formato}`
}

const celulaCsv = (valor: string) => (/[;"\r\n]/.test(valor) ? `"${valor.replaceAll('"', '""')}"` : valor)

function baixar(arquivo: Blob, nome: string) {
  const url = URL.createObjectURL(arquivo)
  Object.assign(document.createElement('a'), { href: url, download: nome }).click()
  URL.revokeObjectURL(url)
}

/**
 * Baixa os números da pasta ou da lista (todos ou só de um DDD) em Excel ou CSV.
 * Busca em páginas de 5.000 e monta o arquivo no navegador. O WhatsApp sai só com
 * dígitos e DDI (5511987654321), como as ferramentas de disparo esperam.
 */
export function ExportarNumeros({
  pastaId,
  listaId,
  ddd,
  total,
  nome,
}: {
  pastaId?: string
  listaId?: string
  ddd: string | null
  total: number
  nome: string
}) {
  const avisar = useAvisos()
  const [gerando, setGerando] = useState<Formato | null>(null)
  const [lidos, setLidos] = useState(0)

  async function exportar(formato: Formato) {
    setGerando(formato)
    setLidos(0)
    try {
      const linhas: LinhaExportacao[] = []
      let apos: string | null = null
      for (;;) {
        const pagina = await buscarNumerosParaExportar({ pasta_id: pastaId ?? null, lista_id: listaId ?? null, ddd, apos })
        if (!pagina.ok) throw new Error(pagina.mensagem)
        linhas.push(...pagina.linhas)
        setLidos(linhas.length)
        if (pagina.linhas.length < NUMEROS_POR_PAGINA) break
        apos = pagina.linhas[pagina.linhas.length - 1][0]
      }
      if (linhas.length === 0) throw new Error('Nenhum número para exportar.')

      // Na pasta, a coluna "Lista" diz de qual lista veio cada número.
      const comLista = Boolean(pastaId)
      const cabecalho = ['Nome', 'WhatsApp', 'DDD', 'E-mail', ...(comLista ? ['Lista'] : [])]
      const tabela = linhas.map(([whatsapp, nomeLead, email, dddLead, lista]) => [
        nomeLead ?? '',
        whatsapp,
        dddLead ?? '',
        email ?? '',
        ...(comLista ? [lista] : []),
      ])
      const arquivo = nomeDoArquivo(nome, ddd, formato)

      if (formato === 'xlsx') {
        const xlsx = await import('xlsx')
        // Células de texto: o Excel não transforma o número em 5,51199E+12.
        const planilha = xlsx.utils.aoa_to_sheet([cabecalho, ...tabela])
        planilha['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 6 }, { wch: 30 }, { wch: 32 }]
        const pasta = xlsx.utils.book_new()
        xlsx.utils.book_append_sheet(pasta, planilha, ddd ? `DDD ${ddd}` : 'Números')
        xlsx.writeFile(pasta, arquivo, { compression: true })
      } else {
        const conteudo = '\uFEFF' + [cabecalho, ...tabela].map((linha) => linha.map(celulaCsv).join(';')).join('\r\n') + '\r\n'
        baixar(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }), arquivo)
      }
      avisar(`${formatarNumero(linhas.length)} número(s) exportado(s).`)
    } catch (erro) {
      console.error(erro)
      avisar(erro instanceof Error && erro.message ? erro.message : 'Não foi possível exportar. Tente de novo.', 'erro')
    } finally {
      setGerando(null)
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => exportar('xlsx')} carregando={gerando === 'xlsx'} disabled={total === 0 || gerando !== null}>
          {gerando !== 'xlsx' && <FileSpreadsheet />} Baixar Excel
        </Button>
        <Button onClick={() => exportar('csv')} carregando={gerando === 'csv'} disabled={total === 0 || gerando !== null}>
          {gerando !== 'csv' && <FileText />} Baixar CSV
        </Button>
      </div>
      {gerando && (
        <p className="tipo-dado text-[12px] text-suave" aria-live="polite">
          Preparando {formatarNumero(lidos)} de {formatarNumero(total)}…
        </p>
      )}
    </div>
  )
}
