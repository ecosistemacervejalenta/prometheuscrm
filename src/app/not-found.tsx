import Link from 'next/link'

import { Icone } from '@/components/marca/marca'

export default function NaoEncontrado() {
  return (
    <main className="grid min-h-screen place-items-center bg-papel px-6 text-center">
      <div>
        <Icone tamanho={56} className="mx-auto" />
        <p className="tipo-rotulo mt-6 text-suave">Erro 404</p>
        <h1 className="tipo-h2 mt-2">Página não encontrada</h1>
        <p className="mt-2 text-suave">O link pode ter expirado ou sido digitado errado.</p>
        <Link href="/" className="mt-6 inline-block font-semibold text-volt-700 hover:text-ink">
          Ir para o início
        </Link>
      </div>
    </main>
  )
}
