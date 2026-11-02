import type { Scheduler, Services } from './ports'

/** Relógio e agendador controláveis para testar sessões sem esperar. */
export class FakeTime implements Scheduler {
  ms = 1000
  private seq = 0
  private tasks = new Map<number, { at: number; fn: () => void; every?: number }>()
  readonly clock = (): number => this.ms

  setTimeout(fn: () => void, ms: number): number {
    const id = ++this.seq
    this.tasks.set(id, { at: this.ms + ms, fn })
    return id
  }
  clearTimeout(id: number): void {
    this.tasks.delete(id)
  }
  setInterval(fn: () => void, ms: number): number {
    const id = ++this.seq
    this.tasks.set(id, { at: this.ms + ms, fn, every: ms })
    return id
  }
  clearInterval(id: number): void {
    this.tasks.delete(id)
  }
  /** Avança o tempo disparando as tarefas na ordem. */
  advance(ms: number): void {
    const end = this.ms + ms
    for (;;) {
      let next: [number, { at: number; fn: () => void; every?: number }] | null = null
      for (const entry of this.tasks) if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry
      if (!next) break
      const [id, task] = next
      this.ms = task.at
      if (task.every) task.at += task.every
      else this.tasks.delete(id)
      task.fn()
    }
    this.ms = end
  }
}

export function fakeServices(time = new FakeTime()) {
  const log: string[] = []
  const services: Pick<Services, 'piano' | 'feedback' | 'haptics' | 'storage' | 'scheduler' | 'clock' | 'telemetry'> = {
    telemetry: { record: (e) => log.push(`tel:${e.event}`) },
    piano: { noteOn: () => {}, noteOff: () => {}, chord: (m) => log.push(`chord:${m.join(',')}`), resume: async () => {}, setEnabled: () => {}, setVolume: () => {} },
    feedback: { cue: (k) => log.push(`cue:${k}`), setEnabled: () => {} },
    haptics: { vibrate: () => {}, enabled: true },
    storage: (() => {
      const data = new Map<string, unknown>()
      return { read: (k: string) => data.get(k), write: (k: string, v: unknown) => void data.set(k, JSON.parse(JSON.stringify(v))) }
    })(),
    scheduler: time,
    clock: time.clock,
  }
  return { services, time, log }
}
