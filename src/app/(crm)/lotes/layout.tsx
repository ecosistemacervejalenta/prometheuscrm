import { Alert } from '@/components/ui/alert'

/** Aviso fixo no módulo enquanto ele está em teste (vale para a lista e para a tela de cada cerveja). */
export default function LayoutLotes({ children }: LayoutProps<'/lotes'>) {
  return (
    <>
      <Alert tom="alerta" titulo="Em desenvolvimento — ambiente de teste por enquanto" className="mb-5 lg:mb-6">
        Este módulo ainda está sendo testado. Pode usar, mas confira os dados e avise se algo parecer errado.
      </Alert>
      {children}
    </>
  )
}
