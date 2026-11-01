import type { StoragePort } from '../application/ports'

/** localStorage com try/catch: modo privado ou dados bloqueados nunca quebram a tela. */
export class LocalStorageAdapter implements StoragePort {
  read(key: string): unknown {
    try {
      const raw = window.localStorage.getItem(key)
      return raw === null ? undefined : JSON.parse(raw)
    } catch {
      return undefined
    }
  }
  write(key: string, value: unknown): void {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* sem armazenamento: segue sem persistir */
    }
  }
}
