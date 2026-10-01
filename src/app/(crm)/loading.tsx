export default function Carregando() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Carregando">
      <div className="mb-2 h-4 w-40 rounded bg-linha" />
      <div className="mb-8 h-10 w-72 rounded-lg bg-linha" />
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-32 rounded-cartao bg-linha/70" />
        ))}
      </div>
      <div className="h-80 rounded-cartao bg-linha/60" />
    </div>
  )
}
