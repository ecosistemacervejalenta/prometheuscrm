'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { errosDeValidacao, falha, traduzirErro, type EstadoAcao } from '@/lib/acoes'
import { exigirEquipe } from '@/lib/auth'
import { formParaObjeto } from '@/lib/validacao'

import { esquemaProduto, TAMANHO_MAXIMO_IMAGEM, TIPOS_IMAGEM } from './schema'

const BUCKET = 'produtos'

export async function salvarProduto(id: string | null, _: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const { supabase } = await exigirEquipe()

  const arquivo = formData.get('imagem')
  formData.delete('imagem')
  const dados = esquemaProduto.safeParse(formParaObjeto(formData))
  if (!dados.success) return errosDeValidacao(dados.error)

  // Upload opcional da imagem para o Supabase Storage (bucket público "produtos").
  if (arquivo instanceof File && arquivo.size > 0) {
    if (!TIPOS_IMAGEM.includes(arquivo.type)) return { ok: false, erros: { imagem: ['Use PNG, JPG, WEBP ou AVIF.'] } }
    if (arquivo.size > TAMANHO_MAXIMO_IMAGEM) return { ok: false, erros: { imagem: ['Imagem acima de 4 MB.'] } }

    const extensao = arquivo.name.split('.').pop()?.toLowerCase() || 'jpg'
    const caminho = `${crypto.randomUUID()}.${extensao}`
    const envio = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
      contentType: arquivo.type,
      cacheControl: '31536000',
    })
    if (envio.error) return falha(`Não foi possível enviar a imagem: ${envio.error.message}`)
    dados.data.imagem_url = supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl
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
