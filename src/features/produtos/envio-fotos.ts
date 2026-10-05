import { createClient } from '@/lib/supabase/client'

/**
 * Envia a foto (já enquadrada e comprimida) direto do navegador para o Storage
 * (bucket público "produtos"; a política só aceita membros da equipe).
 * Assim várias fotos não esbarram no limite de 4,5 MB das Server Actions.
 */
export async function enviarFotoProduto(arquivo: File): Promise<string> {
  const supabase = createClient()
  const caminho = `${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('produtos').upload(caminho, arquivo, {
    contentType: arquivo.type || 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  })
  if (error) throw new Error(`Não foi possível enviar a foto: ${error.message}`)
  return supabase.storage.from('produtos').getPublicUrl(caminho).data.publicUrl
}
