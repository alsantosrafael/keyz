export class Emitter<T> {
  private listeners = new Set<(value: T) => void>()
  subscribe(fn: (value: T) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  emit(value: T): void {
    for (const l of [...this.listeners]) l(value)
  }
}
