import { Calculator } from 'lucide-react'

import { ActionButton } from '@/components/ui/action-button'
import { Dado, Dados } from '@/features/configuracoes/components/blocos'
import { formatarDataHora, formatarMoeda } from '@/lib/format'

import { calcularFreteDoPedido } from '../actions'
import { nomeDaTransportadora, type CotacaoDoPedido } from '../cotacao'

const peso = (kg: number) => `${kg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`

/**
 * Frete calculado sozinho (Olist Envios pela Shopify), na ficha do pedido: qual serviço saiu mais
 * barato, para quantas cervejas e as outras opções — é o que a equipe usa na hora de comprar a
 * etiqueta na Olist. Só aparece quando o cálculo vale para a caixa de agora.
 */
export function FreteCalculadoDoPedido({ cotacao }: { cotacao: CotacaoDoPedido | null }) {
  if (cotacao?.situacao !== 'ok') return null
  const outras = cotacao.opcoes.filter((o) => o.servico !== cotacao.servico)
  return (
    <div className="space-y-2">
      <Dados colunas={3}>
        <Dado rotulo="Serviço mais barato" largo>
          <span className="font-semibold">{nomeDaTransportadora(cotacao.servico)}</span> · {formatarMoeda(cotacao.valor)}
        </Dado>
        <Dado rotulo="Caixa">
          <span className="tipo-dado">
            {cotacao.unidades} un{cotacao.pesoKg ? ` · ${peso(cotacao.pesoKg)}` : ''}
          </span>
        </Dado>
        <Dado rotulo="Calculado em">{cotacao.quando ? formatarDataHora(cotacao.quando) : '—'}</Dado>
      </Dados>
      <p className="text-[13px] text-suave">
        Peso contado a 500 g por cerveja. Na hora de comprar a etiqueta na Olist, confira se este serviço continua sendo o mais barato.
        {outras.length > 0 && <> Outras opções na hora do cálculo: {outras.map((o) => `${nomeDaTransportadora(o.servico)} ${formatarMoeda(o.valor)}`).join(' · ')}.</>}
      </p>
    </div>
  )
}

/** "Calcular pelo Olist Envios": pedido com frete a cotar e a Shopify conectada. */
export function BotaoCalcularFrete({ pedidoId }: { pedidoId: string }) {
  return (
    <ActionButton acao={calcularFreteDoPedido.bind(null, pedidoId)} variante="escuro" titulo="Calcular o frete pelo Olist Envios (opção mais barata)">
      <Calculator /> Calcular pelo Olist Envios
    </ActionButton>
  )
}
