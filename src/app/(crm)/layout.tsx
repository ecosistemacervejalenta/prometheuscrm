import { Sidebar } from '@/components/layout/sidebar'
import { Toaster } from '@/components/ui/toaster'
import { exigirEquipe } from '@/lib/auth'

export default async function LayoutCrm({ children }: LayoutProps<'/'>) {
  const { supabase, perfil } = await exigirEquipe()
  const agora = new Date().toISOString()

  const [clientes, aReceber, preVendas, atendimentos] = await Promise.all([
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
    // WhatsApp: conversas com mensagem não lida na fila ou com você.
    supabase
      .from('atendimentos')
      .select('id', { count: 'exact', head: true })
      .gt('nao_lidas', 0)
      .in('status', ['fila', 'em_atendimento', 'aguardando_cliente'])
      .or(`status.eq.fila,responsavel_id.eq.${perfil.id}`),
  ])

  return (
    <Toaster>
      <div className="min-h-screen lg:flex">
        <Sidebar
          perfil={{ nome: perfil.nome || perfil.email || 'Equipe', cargo: perfil.cargo, papel: perfil.papel }}
          contagens={{
            clientes: clientes.count ?? 0,
            aReceber: aReceber.count ?? 0,
            preVendasAtivas: preVendas.count ?? 0,
            atendimentos: atendimentos.count ?? 0,
          }}
        />
        <main className="min-w-0 flex-1 px-4 pt-2 pb-[calc(var(--altura-abas)+env(safe-area-inset-bottom)+24px)] sm:px-6 lg:px-8 lg:py-8 print:p-0">
          <div className="mx-auto max-w-[1280px]">{children}</div>
        </main>
      </div>
    </Toaster>
  )
}
