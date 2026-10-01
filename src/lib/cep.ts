/** Consulta de CEP na ViaCEP (gratuita, sem chave). Usada no navegador. */
export type EnderecoCep = {
  logradouro: string
  bairro: string
  cidade: string
  uf: string
}

export function mascararCep(valor: string) {
  const d = valor.replace(/\D/g, '').slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

export async function buscarCep(cep: string): Promise<EnderecoCep | null> {
  const digitos = cep.replace(/\D/g, '')
  if (digitos.length !== 8) return null
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`, { signal: AbortSignal.timeout(6000) })
    if (!resposta.ok) return null
    const dados = (await resposta.json()) as {
      erro?: boolean
      logradouro?: string
      bairro?: string
      localidade?: string
      uf?: string
    }
    if (dados.erro) return null
    return {
      logradouro: dados.logradouro ?? '',
      bairro: dados.bairro ?? '',
      cidade: dados.localidade ?? '',
      uf: dados.uf ?? '',
    }
  } catch {
    return null
  }
}
