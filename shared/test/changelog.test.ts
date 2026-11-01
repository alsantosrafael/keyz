import { describe, expect, it } from 'vitest'
import { compareVersions, parseChangelog } from '../src'

const SAMPLE = `# Changelog

## [0.3.0](https://github.com/o/r/compare/v0.2.0...v0.3.0) (2026-11-20)


### Novidades

* **desafio:** contagem regressiva com som ([a1b2c3d](https://github.com/o/r/commit/a1b2c3d))
* melhora o resumo da sessão ([e4f5a6b](https://github.com/o/r/commit/e4f5a6b)), closes [#12](https://github.com/o/r/issues/12)

### Correções

* **livre:** corrige o **display** ao soltar a tecla

## 0.2.0 (2026-11-02)

### Novidades

* versão nos ajustes
`

describe('parseChangelog', () => {
  const entries = parseChangelog(SAMPLE)
  it('lê versões, datas e link de comparação, da mais nova para a mais antiga', () => {
    expect(entries.map((e) => e.version)).toEqual(['0.3.0', '0.2.0'])
    expect(entries[0].date).toBe('2026-11-20')
    expect(entries[0].url).toBe('https://github.com/o/r/compare/v0.2.0...v0.3.0')
    expect(entries[1].url).toBeNull()
  })
  it('separa seções, escopo, hash e remove links e negrito', () => {
    const [novidades, correcoes] = entries[0].sections
    expect(novidades.title).toBe('Novidades')
    expect(novidades.items[0]).toEqual({ scope: 'desafio', text: 'contagem regressiva com som', hash: 'a1b2c3d' })
    expect(novidades.items[1]).toEqual({ scope: null, text: 'melhora o resumo da sessão', hash: 'e4f5a6b' })
    expect(correcoes.items[0]).toEqual({ scope: 'livre', text: 'corrige o display ao soltar a tecla', hash: null })
  })
  it('ignora lixo e arquivo vazio, sem lançar', () => {
    expect(parseChangelog('')).toEqual([])
    expect(parseChangelog('# Changelog\n\ntexto solto\n')).toEqual([])
  })
  it('item fora de seção vai para "Mudanças"', () => {
    expect(parseChangelog('## 1.0.0 (2027-01-01)\n\n* algo\n')[0].sections[0].title).toBe('Mudanças')
  })
  it('compara versões SemVer', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('0.2.1', '0.3.0')).toBeLessThan(0)
  })
})
