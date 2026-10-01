import { z } from 'zod'

import {
  checkbox,
  dataOpcional,
  emailOpcional,
  listaPorVirgula,
  texto,
  textoOpcional,
  ufOpcional,
  whatsappOpcional,
} from '@/lib/validacao'

export const esquemaCliente = z.object({
  nome: texto('Informe o nome do cliente.'),
  whatsapp: whatsappOpcional,
  email: emailOpcional,
  cpf: textoOpcional,
  data_nascimento: dataOpcional,
  cep: textoOpcional,
  logradouro: textoOpcional,
  numero: textoOpcional,
  complemento: textoOpcional,
  bairro: textoOpcional,
  cidade: textoOpcional,
  uf: ufOpcional,
  referencia: textoOpcional,
  vip: checkbox,
  tags: listaPorVirgula,
  observacoes: textoOpcional,
})

export type DadosCliente = z.infer<typeof esquemaCliente>
