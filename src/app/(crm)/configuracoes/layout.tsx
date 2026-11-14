import { MenuConfiguracoes } from '@/features/configuracoes/components/menu-configuracoes'

/**
 * Moldura das Configurações.
 * Telas largas (xl+): menu lateral fixo com os grupos + a página da seção ao lado.
 * Telas menores: a visão geral (/configuracoes) é a lista de seções e cada página tem o "voltar".
 */
export default function LayoutConfiguracoes({ children }: LayoutProps<'/configuracoes'>) {
  return (
    <div className="xl:grid xl:grid-cols-[208px_minmax(0,1fr)] xl:gap-8 2xl:grid-cols-[224px_minmax(0,1fr)] 2xl:gap-10">
      <aside className="hidden xl:block print:hidden">
        <div className="sticky top-8 -mr-2 max-h-[calc(100dvh-4rem)] overflow-y-auto pr-2 pb-2">
          <p className="tipo-h3 mb-4 px-2.5">Configurações</p>
          <MenuConfiguracoes />
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
