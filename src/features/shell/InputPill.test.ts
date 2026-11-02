import { describe, expect, it } from 'vitest'
import { micLabel } from './InputPill'

describe('micLabel', () => {
  it('interrupção pelo sistema aparece como "Microfone pausado"', () => {
    expect(micLabel('interrupted')).toBe('Microfone pausado')
  })

  it('ausência de aparelho continua "Microfone desligado"', () => {
    expect(micLabel('no-device')).toBe('Microfone desligado')
  })
})
