import { z } from 'zod'

import { texto } from '@/lib/validacao'

import { validarMensagem } from './mensagem'

const opcional = (max: number, mensagem: string) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().max(max, mensagem).nullable())

const id = (rotulo: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/\s/g, '') : v),
    z.string({ error: `Cole a ${rotulo}.` }).regex(/^\d{5,25}$/, `A ${rotulo} tem só números — confira se copiou inteira.`),
  )

/** Formulário da conexão com a Meta (Configurações › WhatsApp oficial). */
export const esquemaConexaoMeta = z.object({
  app_id: id('identificação do app'),
  phone_number_id: id('identificação do número'),
  waba_id: id('identificação da conta do WhatsApp Business'),
  // Vazios mantêm o token e a chave já salvos.
  token: opcional(1000, 'Token grande demais — confira se copiou só o token.'),
  app_secret: opcional(100, 'Chave secreta grande demais — confira o que foi copiado.'),
  // Só para registrar o número na API (não fica salvo).
  pin: z.preprocess((v) => (typeof v === 'string' && v.trim() ? v.trim() : null), z.string().regex(/^\d{6}$/, 'O PIN tem 6 números.').nullable()),
})

/** Campanha nova, enviada pelo navegador ao disparar. */
export const esquemaCampanha = z
  .object({
    // Gerado no navegador: repetir o envio (ex.: queda de conexão) não cria outra campanha.
    id: z.uuid(),
    nome: texto('Dê um nome para a campanha.').max(80, 'Use no máximo 80 caracteres.'),
    texto: z.string().trim(),
    nome_padrao: z.string().trim(),
    rodape: z.string().trim(),
    botao_texto: z.string().trim().nullable(),
    botao_url: z.string().trim().nullable(),
    botao_sair: z.boolean(),
    imagem_path: z.string().regex(/^[0-9a-f-]{36}\.(jpg|png)$/).nullable(),
    origem: z.enum(['arquivo', 'leads', 'colar']),
    origem_descricao: opcional(200, 'Descrição grande demais.'),
    lista_id: z.uuid().nullable(),
    agendada_para: z.iso.datetime({ offset: true }).nullable(),
  })
  .superRefine((c, ctx) => {
    const erros = validarMensagem({
      texto: c.texto,
      nomePadrao: c.nome_padrao,
      rodape: c.rodape,
      botaoLink: c.botao_texto !== null || c.botao_url !== null ? { texto: c.botao_texto ?? '', url: c.botao_url ?? '' } : null,
      botaoSair: c.botao_sair,
    })
    for (const [campo, mensagem] of Object.entries(erros)) ctx.addIssue({ code: 'custom', path: [campo], message: mensagem })
    if (c.origem === 'leads' && !c.lista_id) ctx.addIssue({ code: 'custom', path: ['lista_id'], message: 'Escolha a lista do Banco de Leads.' })
  })

export type DadosCampanha = z.input<typeof esquemaCampanha>

/** Contatos por envio (o banco aceita até 5.000; 2.000 mantém cada requisição pequena). */
export const CONTATOS_POR_LOTE = 2000

export const esquemaLoteContatos = z
  .array(z.object({ whatsapp: z.string().max(20), nome: z.string().max(200).nullable() }))
  .min(1)
  .max(CONTATOS_POR_LOTE)
