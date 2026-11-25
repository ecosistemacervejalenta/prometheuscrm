import type { Metadata } from 'next'
import { LogOut } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Cupom } from '@/features/influenciadores/components/selos'
import { sairDoPortal } from '@/features/influenciadores/portal/actions'
import { FormularioContaDoPortal, FormularioSenhaDoPortal } from '@/features/influenciadores/portal/components/formularios'
import { exigirInfluenciador } from '@/features/influenciadores/portal/sessao'
import { formatarPercentual } from '@/features/influenciadores/rotulos'

export const metadata: Metadata = { title: 'Minha conta' }

export default async function PaginaContaDoPortal() {
  const { influenciador: eu } = await exigirInfluenciador()

  return (
    <div className="mx-auto max-w-2xl space-y-5 lg:space-y-6">
      <header>
        <p className="tipo-dado text-[13px] text-suave">{eu.email}</p>
        <h1 className="tipo-h2 sm:tipo-h1 mt-0.5">Minha conta</h1>
      </header>

      <Card>
        <CardHeader titulo="Sua parceria" descricao={`Definida pela ${eu.loja_nome}. Para mudar o nome, o e-mail, o cupom ou a comissão, fale com a loja.`} />
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-papel p-4 text-[14px]">
            <div className="col-span-2 min-w-0">
              <dt className="tipo-rotulo text-suave">Nome</dt>
              <dd className="mt-0.5 break-words font-medium">{eu.nome}</dd>
            </div>
            <div className="min-w-0">
              <dt className="tipo-rotulo text-suave">Cupom</dt>
              <dd className="mt-1"><Cupom codigo={eu.cupom} apagado={!eu.cupom_ativo} /></dd>
            </div>
            <div className="min-w-0">
              <dt className="tipo-rotulo text-suave">Comissão</dt>
              <dd className="tipo-dado mt-0.5">{formatarPercentual(eu.comissao_percentual)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="tipo-rotulo text-suave">Desconto do cupom</dt>
              <dd className="tipo-dado mt-0.5">{formatarPercentual(eu.desconto_percentual)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="tipo-rotulo text-suave">Liberação</dt>
              <dd className="mt-0.5">{eu.carencia_dias === 0 ? 'no pagamento do pedido' : `${eu.carencia_dias} dia(s) após o pedido`}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader titulo="Contato e PIX" descricao="Mantenha em dia: é por aqui que a loja fala com você e paga as comissões." />
        <CardContent>
          <FormularioContaDoPortal eu={eu} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader titulo="Senha" descricao="Troque a senha de acesso ao Portal quando quiser." />
        <CardContent>
          <FormularioSenhaDoPortal />
        </CardContent>
      </Card>

      <form action={sairDoPortal}>
        <Button type="submit" variante="secundario" bloco tamanho="lg">
          <LogOut aria-hidden /> Sair do Portal
        </Button>
      </form>
    </div>
  )
}
