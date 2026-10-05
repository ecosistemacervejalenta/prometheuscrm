'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { errosDeValidacao, falha, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { envPublico } from '@/lib/env'
import { formParaObjeto } from '@/lib/validacao'

import { esquemaKit, lerKit, MAX_FOTOS, type CervejaDoKit } from './kit'
import { esquemaCerveja, esquemaCervejaNova, esquemaProduto, TAMANHO_MAXIMO_IMAGEM, TIPOS_IMAGEM } from './schema'

const BUCKET = 'produtos'
const CAMPOS_CERVEJA = 'id, nome, estilo, cervejaria, volume_ml, teor_alcoolico, descricao, preco, imagem_url, fotos, cervejas_do_kit'

type Supabase = Awaited<ReturnType<typeof exigirEquipe>>['supabase']

/** Upload da imagem para o Supabase Storage (bucket público "produtos"). */
async function enviarImagem(supabase: Supabase, arquivo: File): Promise<{ url: string } | { erro: string }> {
  if (!TIPOS_IMAGEM.includes(arquivo.type)) return { erro: 'Use PNG, JPG, WEBP ou AVIF.' }
  if (arquivo.size > TAMANHO_MAXIMO_IMAGEM) return { erro: 'Imagem acima de 4 MB.' }

  const extensao = arquivo.name.split('.').pop()?.toLowerCase() || 'jpg'
  const caminho = `${crypto.randomUUID()}.${extensao}`
  const envio = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
    contentType: arquivo.type,
    cacheControl: '31536000',
  })
  if (envio.error) return { erro: `Não foi possível enviar a imagem: ${envio.error.message}` }
  return { url: supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl }
}

export async function salvarProduto(id: string | null, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()

  const arquivo = formData.get('imagem')
  formData.delete('imagem')
  const dados = esquemaProduto.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  if (arquivo instanceof File && arquivo.size > 0) {
    const envio = await enviarImagem(supabase, arquivo)
    if ('erro' in envio) return { ok: false, mensagem: envio.erro, erros: { imagem: [envio.erro] } }
    dados.data.imagem_url = envio.url
  }

  const { error } = id
    ? await supabase.from('produtos').update(dados.data).eq('id', id)
    : await supabase.from('produtos').insert(dados.data)
  if (error) return falha(traduzirErro(error))

  revalidatePath('/produtos')
  redirect('/produtos')
}

export async function excluirProduto(id: string): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()
  const { error } = await supabase.from('produtos').delete().eq('id', id)
  if (error) {
    return falha(
      error.code === '23503'
        ? 'Este produto está em pré-vendas. Desative-o em vez de excluir.'
        : traduzirErro(error),
    )
  }
  revalidatePath('/produtos')
  redirect('/produtos')
}

export type CervejaSalva = {
  id: string
  nome: string
  estilo: string | null
  cervejaria: string | null
  volume_ml: number | null
  teor_alcoolico: number | null
  descricao: string | null
  preco: number
  imagem_url: string | null
  fotos: string[]
  cervejas_do_kit: CervejaDoKit[]
}

export type ResultadoCerveja =
  | { ok: true; cerveja: CervejaSalva }
  | { ok: false; mensagem: string; erros?: Record<string, string[] | undefined> }

/** Só aceita fotos do nosso bucket público "produtos" (enviadas pelo navegador). */
const prefixoFotos = () => `${envPublico.supabaseUrl}/storage/v1/object/public/produtos/`

function lerJson(valor: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(valor ?? '[]'))
  } catch {
    return null
  }
}

/**
 * Cadastro/edição rápida de cerveja (ou kit) dentro da pré-venda, sem sair da tela.
 * Cria no catálogo já ativa; na edição, o preço da pré-venda fica no formulário dela.
 * Campos: nome, estilo, cervejaria, volume_ml, teor_alcoolico, descricao, preco (só ao criar),
 * fotos (JSON com as URLs já enviadas, na ordem; a 1ª é a capa) e cervejas_do_kit (JSON).
 */
export async function salvarCervejaRapida(id: string | null, formData: FormData): Promise<ResultadoCerveja> {
  const { supabase } = await exigirEquipe()

  const fotos = lerJson(formData.get('fotos'))
  const kit = esquemaKit.safeParse(lerJson(formData.get('cervejas_do_kit')))
  formData.delete('fotos')
  formData.delete('cervejas_do_kit')

  const prefixo = prefixoFotos()
  if (!Array.isArray(fotos) || fotos.length > MAX_FOTOS || !fotos.every((f) => typeof f === 'string' && f.startsWith(prefixo))) {
    return { ok: false, mensagem: 'Fotos inválidas. Tente enviar de novo.' }
  }
  if (!kit.success) return { ok: false, mensagem: kit.error.issues[0]?.message ?? 'Revise as cervejas do kit.' }

  const dados = (id ? esquemaCerveja : esquemaCervejaNova).safeParse(formParaObjeto(formData))
  if (!dados.success) {
    const { mensagem, erros } = errosDeValidacao(dados.error)
    return { ok: false, mensagem: mensagem ?? 'Revise os campos destacados.', erros }
  }

  const registro = { ...dados.data, fotos: fotos as string[], cervejas_do_kit: kit.data }
  const { data, error } = id
    ? await supabase.from('produtos').update(registro).eq('id', id).select(CAMPOS_CERVEJA).single()
    : await supabase
        .from('produtos')
        .insert({ ...registro, ativo: true })
        .select(CAMPOS_CERVEJA)
        .single()
  if (error) return { ok: false, mensagem: traduzirErro(error) }

  revalidatePath('/produtos')
  return {
    ok: true,
    cerveja: {
      ...data,
      preco: Number(data.preco),
      teor_alcoolico: data.teor_alcoolico === null ? null : Number(data.teor_alcoolico),
      fotos: data.fotos ?? [],
      cervejas_do_kit: lerKit(data.cervejas_do_kit),
    },
  }
}
