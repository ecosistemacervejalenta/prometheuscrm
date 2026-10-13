'use client'

import { ImagePlus, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState, useTransition, type ClipboardEvent, type FormEvent, type ReactNode } from 'react'

import { classesControle } from '@/components/form/fields'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAvisos } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'
import type { PrioridadeTarefa } from '@/types'

import { criarTarefa, registrarAnexos } from '../actions'
import { filtrarImagens, subirImagens } from '../imagens'
import type { Pessoa } from '../queries'
import { MAX_IMAGENS_POR_ENVIO } from '../schema'
import { Painel } from './painel'
import { EscolhaPrioridade, SeletorPessoas } from './selos'

type Previa = { chave: string; arquivo: File; url: string }

/** Botão "Nova tarefa" + painel de cadastro (título, responsáveis, prazo, prioridade, descrição e imagens). */
export function NovaTarefa({ equipe, meuId }: { equipe: Pessoa[]; meuId: string }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Button variante="primario" onClick={() => setAberto(true)}>
        <Plus aria-hidden /> Nova tarefa
      </Button>
      {aberto && <FormularioNovaTarefa equipe={equipe} meuId={meuId} aoFechar={() => setAberto(false)} />}
    </>
  )
}

function FormularioNovaTarefa({ equipe, meuId, aoFechar }: { equipe: Pessoa[]; meuId: string; aoFechar: () => void }) {
  const avisar = useAvisos()
  const [salvando, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [prioridade, setPrioridade] = useState<PrioridadeTarefa>('media')
  const [prazo, setPrazo] = useState('')
  const [responsaveis, setResponsaveis] = useState<string[]>([])
  const [imagens, setImagens] = useState<Previa[]>([])
  const seletor = useRef<HTMLInputElement>(null)
  const urls = useRef<string[]>([])

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  function adicionarImagens(arquivos: File[]) {
    if (!arquivos.length) return
    const vagas = MAX_IMAGENS_POR_ENVIO - imagens.length
    if (arquivos.length > vagas) setErro(`Anexe até ${MAX_IMAGENS_POR_ENVIO} imagens agora; dá para colocar mais depois, no cartão.`)
    const novas = arquivos.slice(0, Math.max(vagas, 0)).map((arquivo) => {
      const url = URL.createObjectURL(arquivo)
      urls.current.push(url)
      return { chave: url, arquivo, url }
    })
    setImagens((atual) => [...atual, ...novas])
  }

  function colar(e: ClipboardEvent) {
    const arquivos = filtrarImagens(e.clipboardData.files)
    if (!arquivos.length) return
    e.preventDefault()
    adicionarImagens(arquivos)
  }

  function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    iniciar(async () => {
      const r = await criarTarefa({ titulo, descricao, prioridade, prazo: prazo || null, status: 'a_fazer', responsaveis })
      if (!r.ok || !r.id) {
        setErro(r.mensagem ?? 'Não foi possível criar a tarefa.')
        return
      }
      if (imagens.length) {
        const { enviadas, erro: erroEnvio } = await subirImagens(r.id, imagens.map((i) => i.arquivo))
        const registro = enviadas.length ? await registrarAnexos(r.id, enviadas) : null
        const falhou = erroEnvio ?? (registro?.ok === false ? registro.mensagem : null)
        if (falhou) avisar(`Tarefa criada, mas: ${falhou}`, 'erro')
      }
      avisar(r.mensagem ?? 'Tarefa criada.')
      aoFechar()
    })
  }

  return (
    <Painel rotulo="Nova tarefa" aoFechar={() => !salvando && aoFechar()}>
      <form onSubmit={salvar} onPaste={colar} noValidate className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-linha bg-superficie px-5 py-3.5 lg:px-6">
          <div>
            <h2 className="tipo-h3">Nova tarefa</h2>
            <p className="text-[13px] text-suave">Quem for marcado recebe o aviso no próprio login.</p>
          </div>
          <Button variante="fantasma" tamanho="icone" onClick={aoFechar} aria-label="Fechar" disabled={salvando}>
            <X aria-hidden />
          </Button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 lg:px-6">
          {erro && <Alert tom="erro">{erro}</Alert>}

          <Campo rotulo="O que precisa ser feito?" obrigatorio htmlFor="nova-titulo">
            <input
              id="nova-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={160}
              autoFocus
              placeholder="Ex.: Fechar pedido de lúpulo com o fornecedor"
              className={cn(classesControle, 'h-11')}
            />
          </Campo>

          <Campo rotulo="Responsáveis" obrigatorio dica="Marque uma ou mais pessoas.">
            <SeletorPessoas
              pessoas={equipe}
              selecionados={responsaveis}
              meuId={meuId}
              aoAlternar={(id, marcar) => setResponsaveis((atual) => (marcar ? [...atual, id] : atual.filter((r) => r !== id)))}
            />
          </Campo>

          <div className="grid gap-5">
            <Campo rotulo="Prazo de entrega" htmlFor="nova-prazo" dica="Data e hora (horário de Brasília).">
              <input
                id="nova-prazo"
                type="datetime-local"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                className={cn(classesControle, 'h-11 sm:max-w-80')}
              />
            </Campo>
            <Campo rotulo="Prioridade">
              <EscolhaPrioridade valor={prioridade} aoEscolher={setPrioridade} />
            </Campo>
          </div>

          <Campo rotulo="Detalhes" htmlFor="nova-descricao">
            <textarea
              id="nova-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={5}
              maxLength={10000}
              placeholder="Contexto, passo a passo, links, o que é considerado pronto…"
              className={cn(classesControle, 'py-2.5 leading-6')}
            />
          </Campo>

          <Campo rotulo="Imagens" dica="Fotos ou prints. Dá para colar (Ctrl+V) um print aqui.">
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {imagens.map((img) => (
                <div key={img.chave} className="relative aspect-square overflow-hidden rounded-xl border border-linha bg-papel">
                  {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
                  <img src={img.url} alt={img.arquivo.name} className="size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImagens((atual) => atual.filter((i) => i.chave !== img.chave))}
                    className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-ink/70 text-white hover:bg-ink"
                    aria-label={`Tirar ${img.arquivo.name}`}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
              ))}
              {imagens.length < MAX_IMAGENS_POR_ENVIO && (
                <button
                  type="button"
                  onClick={() => seletor.current?.click()}
                  className="grid aspect-square place-items-center rounded-xl border border-dashed border-linha-forte bg-superficie text-suave hover:border-ink hover:text-ink"
                >
                  <span className="flex flex-col items-center gap-1 text-[12px] font-semibold">
                    <ImagePlus className="size-5" aria-hidden /> Adicionar
                  </span>
                </button>
              )}
            </div>
            <input
              ref={seletor}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                adicionarImagens(filtrarImagens(e.target.files))
                e.target.value = ''
              }}
            />
          </Campo>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-linha bg-superficie px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] *:grow sm:*:grow-0 lg:px-6">
          <Button variante="secundario" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" variante="escuro" carregando={salvando}>
            {imagens.length && salvando ? 'Enviando imagens…' : 'Criar tarefa'}
          </Button>
        </footer>
      </form>
    </Painel>
  )
}

function Campo({
  rotulo,
  htmlFor,
  obrigatorio,
  dica,
  children,
}: {
  rotulo: string
  htmlFor?: string
  obrigatorio?: boolean
  dica?: string
  children: ReactNode
}) {
  const texto = (
    <>
      {rotulo}
      {obrigatorio && <span className="ml-0.5 text-perigo" aria-hidden>*</span>}
    </>
  )
  return (
    <div className="min-w-0">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-semibold text-ink">
          {texto}
        </label>
      ) : (
        <p className="mb-1.5 block text-[13px] font-semibold text-ink">{texto}</p>
      )}
      {children}
      {dica && <p className="mt-1.5 text-[13px] text-suave">{dica}</p>}
    </div>
  )
}
