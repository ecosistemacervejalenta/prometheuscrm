import { Sidebar } from '@/components/layout/sidebar'
import { Toaster } from '@/components/ui/toaster'
import { exigirEquipe } from '@/lib/auth'
import { envServidor } from '@/lib/env.server'

export default async function LayoutCrm({ children }: LayoutProps<'/'>) {
  const { supabase, perfil } = await exigirEquipe()
  const agora = new Date().toISOString()

  const [clientes, aReceber, preVendas, webhooks] = await Promise.all([
    supabase.from('clientes').select('id', { count: 'exact', head: true }),
    supabase
      .from('pedidos')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'cancelado')
      .in('status_pagamento', ['pendente', 'cobrado']),
    supabase
      .from('pre_vendas')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'ativa')
      .or(`encerra_em.is.null,encerra_em.gt.${agora}`),
    supabase.from('webhooks').select('id', { count: 'exact', head: true }).eq('ativo', true),
  ])

  const integracoes = [
    {
      nome: 'Shopify',
      ok: Boolean(envServidor.shopifyWebhookSecret),
      status: envServidor.shopifyWebhookSecret ? 'conectado' : 'configurar',
      cor: '#5b8def',
    },
    {
      nome: 'n8n',
      ok: (webhooks.count ?? 0) > 0,
      status: (webhooks.count ?? 0) > 0 ? `${webhooks.count} webhook(s)` : 'configurar',
      cor: '#e8b53e',
    },
    { nome: 'App', ok: Boolean(envServidor.apiKey), status: envServidor.apiKey ? 'API ativa' : 'em breve', cor: '#8b7cf6' },
  ]

  return (
    <Toaster>
      <div className="min-h-screen lg:flex">
        <Sidebar
          perfil={{ nome: perfil.nome || perfil.email || 'Equipe', cargo: perfil.cargo, papel: perfil.papel }}
          contagens={{
            clientes: clientes.count ?? 0,
            aReceber: aReceber.count ?? 0,
            preVendasAtivas: preVendas.count ?? 0,
          }}
          integracoes={integracoes}
        />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8 print:p-0">
          <div className="mx-auto max-w-[1280px]">{children}</div>
        </main>
      </div>
    </Toaster>
  )
}
