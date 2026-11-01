import type { Services } from './ports'

let current: Services | null = null

/** Raiz de composição: `bootstrap` registra os adaptadores uma vez. */
export const setServices = (s: Services): void => {
  current = s
}
export function services(): Services {
  if (!current) throw new Error('services não inicializados')
  return current
}
