import { CornerUpLeft, ExternalLink, ImageIcon } from 'lucide-react'

import { Icone } from '@/components/marca/marca'
import { TextoWhatsapp } from '@/features/atendimento/components/texto-whatsapp'

import { TEXTO_BOTAO_SAIR, textoParaContato, type MensagemCampanha } from '../mensagem'

/** Como o contato vê a mensagem no WhatsApp (conversa com a conta comercial da loja). */
export function PreviaWhatsapp({
  mensagem,
  imagem,
  nomeLoja,
  nomeContato,
}: {
  mensagem: MensagemCampanha
  /** URL local da imagem escolhida (prévia antes do envio). */
  imagem: string | null
  nomeLoja: string
  nomeContato: string | null
}) {
  const texto = textoParaContato(mensagem.texto.trim(), nomeContato, mensagem.nomePadrao)
  const botoes = [
    mensagem.botaoLink?.texto.trim() && { icone: ExternalLink, texto: mensagem.botaoLink.texto.trim() },
    mensagem.botaoSair && { icone: CornerUpLeft, texto: TEXTO_BOTAO_SAIR },
  ].filter(Boolean) as Array<{ icone: typeof ExternalLink; texto: string }>

  return (
    <div className="overflow-hidden rounded-[22px] border border-linha bg-superficie shadow-cartao">
      <div className="flex items-center gap-2.5 border-b border-linha px-3.5 py-2.5">
        <Icone tamanho={32} />
        <div className="min-w-0">
          <p className="truncate text-[14px] leading-5 font-semibold">{nomeLoja}</p>
          <p className="text-[11px] leading-4 text-suave">Conta comercial</p>
        </div>
      </div>

      <div className="min-h-64 bg-papel px-3 py-4">
        <div className="max-w-[88%] overflow-hidden rounded-2xl rounded-tl-md bg-superficie shadow-cartao ring-1 ring-linha">
          {imagem ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL local (blob:) da imagem escolhida
            <img src={imagem} alt="Imagem da mensagem" className="max-h-56 w-full object-cover" />
          ) : null}
          <div className="px-3 py-2 text-[14px] leading-[21px]">
            {texto ? (
              <TextoWhatsapp texto={texto} />
            ) : (
              <span className="text-sutil">Sua mensagem aparece aqui…</span>
            )}
            {mensagem.rodape.trim() && <p className="mt-1 text-[12px] leading-4 text-suave">{mensagem.rodape.trim()}</p>}
            <p className="tipo-dado mt-1 text-right text-[11px] text-sutil">10:30</p>
          </div>
          {botoes.map((b) => (
            <div
              key={b.texto}
              className="flex items-center justify-center gap-1.5 border-t border-linha px-3 py-2 text-[14px] font-medium text-shopify-700"
            >
              <b.icone className="size-3.5" aria-hidden /> {b.texto}
            </div>
          ))}
        </div>
        {!imagem && !texto && (
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-sutil">
            <ImageIcon className="size-3.5" aria-hidden /> Foto, texto e botões aparecem como o cliente vai ver.
          </p>
        )}
      </div>
    </div>
  )
}
