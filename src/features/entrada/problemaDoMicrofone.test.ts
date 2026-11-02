import { describe, expect, it } from 'vitest'
import { problemaDoMicrofone } from './problemaDoMicrofone'

describe('problemaDoMicrofone', () => {
  it('interrupção pelo sistema pede para tocar em Ativar, sem falar em "microfone não encontrado"', () => {
    const texto = problemaDoMicrofone({ kind: 'interrupted' })
    expect(texto).toContain('O microfone parou')
    expect(texto).toContain('Ativar microfone')
    expect(texto).not.toContain('Nenhum microfone encontrado')
  })

  it('ausência de aparelho continua dizendo que não há microfone', () => {
    expect(problemaDoMicrofone({ kind: 'no-device' })).toContain('Nenhum microfone encontrado')
  })

  it('falha leva a mensagem técnica junto', () => {
    expect(problemaDoMicrofone({ kind: 'failed', message: 'boom' })).toBe('Não foi possível iniciar o áudio: boom')
  })

  it('estados normais e desligado não geram explicação', () => {
    for (const kind of ['off', 'starting', 'silence', 'hearing', 'note', 'chord', 'noisy'] as const) {
      expect(problemaDoMicrofone({ kind } as never)).toBeNull()
    }
  })
})
