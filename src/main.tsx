import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from 'react-error-boundary'
import { ORIGEM_ERRO } from '@keyz/shared'
import { App } from './App'
import { bootstrap } from './bootstrap'
import { eventoDeErro, services } from './application'
import { TelaDeRecuperacao } from './ui/TelaDeRecuperacao'
import './ui/theme.css'

bootstrap()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={<TelaDeRecuperacao />} onError={(erro) => services().telemetry.record(eventoDeErro(ORIGEM_ERRO.render, erro))}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
