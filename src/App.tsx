import { lazy } from 'react'
import { Navigate, Route, RouterProvider, createBrowserRouter, createRoutesFromElements } from 'react-router-dom'
// Divisão por rota: Motion e os modos fora do Livre ficam fora do JS inicial.
const Acordes = lazy(() => import('./features/acordes/Acordes').then((m) => ({ default: m.Acordes })))
const Desafio = lazy(() => import('./features/desafio/Desafio').then((m) => ({ default: m.Desafio })))
const Entrada = lazy(() => import('./features/entrada/Entrada').then((m) => ({ default: m.Entrada })))
const Livre = lazy(() => import('./features/livre/Livre').then((m) => ({ default: m.Livre })))
import { Layout } from './features/shell/Layout'

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<Layout />}>
      <Route index element={<Navigate to="/livre" replace />} />
      <Route path="acordes" element={<Acordes />} />
      <Route path="desafio" element={<Desafio />} />
      <Route path="livre" element={<Livre />} />
      <Route path="entrada" element={<Entrada />} />
      <Route path="*" element={<Navigate to="/livre" replace />} />
    </Route>,
  ),
)

export function App() {
  return <RouterProvider router={router} />
}
