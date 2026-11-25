'use client'

import { Search } from 'lucide-react'
import { useState, useTransition, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { mascararCep } from '@/lib/cep'
import { formatarCep, formatarMoeda } from '@/lib/format'
import { cn } from '@/lib/utils'

import { testarFrete, type TesteDeFrete } from '../actions'
import { nomeDaTransportadora } from '../cotacao'

const CLASSE_CAMPO =
  'tipo-dado block h-11 w-full min-w-0 rounded-xl border border-linha bg-superficie px-3.5 outline-none focus:border-ink focus:ring-4 focus:ring-volt/25'

/** Mesma conta do link da pré-venda, para um CEP e uma quantidade de cervejas. Não cria nada. */
export function TestarFrete() {
  const [cep, setCep] = useState('')
  const [unidades, setUnidades] = useState('6')
  const [resultado, setResultado] = useState<TesteDeFrete | null>(null)
  const [pendente, iniciar] = useTransition()
  const quantidade = Number(unidades)
  const pronto = cep.replace(/\D/g, '').length === 8 && Number.isInteger(quantidade) && quantidade >= 1 && quantidade <= 200

  function testar(evento: FormEvent) {
    evento.preventDefault()
    if (!pronto) return
    iniciar(async () => {
      try {
        setResultado(await testarFrete(cep, quantidade))
      } catch {
        setResultado({ ok: false, mensagem: 'Não foi possível testar agora. Tente de novo em instantes.' })
      }
    })
  }

  return (
    <form onSubmit={testar}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-36 flex-1">
          <span className="mb-1.5 block text-[13px] font-semibold">CEP de entrega</span>
          <input
            value={cep}
            onChange={(e) => {
              setCep(mascararCep(e.target.value))
              setResultado(null)
            }}
            inputMode="numeric"
            placeholder="00000-000"
            className={CLASSE_CAMPO}
          />
        </label>
        <label className="w-28">
          <span className="mb-1.5 block text-[13px] font-semibold">Cervejas</span>
          <input
            value={unidades}
            onChange={(e) => {
              setUnidades(e.target.value.replace(/\D/g, '').slice(0, 3))
              setResultado(null)
            }}
            inputMode="numeric"
            className={CLASSE_CAMPO}
          />
        </label>
        <Button type="submit" carregando={pendente} disabled={!pronto} className="h-11">
          <Search /> Calcular
        </Button>
      </div>

      {resultado && !resultado.ok && (
        <p className="mt-3 rounded-xl bg-perigo-50 px-3 py-2 text-sm font-semibold text-perigo" role="alert">
          {resultado.mensagem}
        </p>
      )}

      {resultado?.ok && (
        <div className="mt-4 space-y-3" role="status">
          <p className="text-[13px] text-suave">
            {formatarCep(resultado.cep)} · {resultado.cidade}/{resultado.uf} · {resultado.unidades}{' '}
            {resultado.unidades === 1 ? 'cerveja' : 'cervejas'} ·{' '}
            <span className="tipo-dado">{resultado.pesoKg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg</span>
          </p>
          <ul className="divide-y divide-linha overflow-hidden rounded-xl border border-linha">
            {resultado.opcoes.map((opcao, i) => (
              <li key={opcao.servico} className={cn('flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm', i === 0 && 'bg-volt-50')}>
                <span className="min-w-0">
                  <span className={cn('block truncate', i === 0 && 'font-semibold')}>{nomeDaTransportadora(opcao.servico)}</span>
                  {i === 0 && <span className="block text-[12px] text-volt-700">Mais barata: é a que o cliente paga</span>}
                </span>
                <span className={cn('tipo-dado shrink-0', i === 0 && 'text-base font-semibold')}>{formatarMoeda(opcao.valor)}</span>
              </li>
            ))}
          </ul>
          {resultado.vip && (
            <p className="rounded-xl bg-alerta-50 px-3 py-2 text-[13px] text-ink/80">
              Este CEP está na lista de CEPs VIP: no link ele paga o frete fixo de <b>{formatarMoeda(resultado.freteVip)}</b>, não este
              cálculo.
            </p>
          )}
        </div>
      )}
    </form>
  )
}
