import { AlertTriangle } from 'lucide-react'
import { Button } from './controls'

/** Tela de último recurso, quando um erro de render chega ao topo. Os ajustes continuam salvos. */
export function TelaDeRecuperacao() {
  return (
    <main role="alert" className="grid min-h-dvh place-items-center gap-4 p-6 text-center text-ink">
      <AlertTriangle size={32} strokeWidth={1.75} aria-hidden className="text-failure" />
      <h1 className="text-xl font-semibold">Algo deu errado</h1>
      <p className="max-w-sm text-muted">A tela encontrou um erro inesperado. Seus ajustes continuam salvos.</p>
      <Button variant="primary" onClick={() => window.location.reload()}>
        Recarregar
      </Button>
    </main>
  )
}
