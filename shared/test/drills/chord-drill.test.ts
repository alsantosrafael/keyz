import { describe, expect, it } from 'vitest'
import { CHORD_HOLD_VERDICT_S, ChordDrill, chordDisplayName, chordFullName, chordSymbol, chordTimeFactor, makeChord, chordOrderedPitchClasses, chordPool, drillPreset, targetBassPitchClass } from '../../src'

const config = { ...drillPreset('easy'), rounds: 3, timePerNote: 10 }
const cMajor = [60, 64, 67]

/** Sorteio fixo: sempre o primeiro candidato (Dó maior na primeira rodada). */
const make = (over = {}) => new ChordDrill({ ...config, ...over }, () => 0)

describe('ChordDrill', () => {
  it('Fácil: só raízes brancas; Médio: todas as raízes; ambos só maiores e menores', () => {
    expect(chordPool(drillPreset('easy'))).toHaveLength(14)
    const medium = chordPool(drillPreset('medium'))
    expect(medium).toHaveLength(24)
    expect(new Set(medium.map((c) => c.quality))).toEqual(new Set(['major', 'minor']))
  })

  it('Avançado: maiores e menores continuam, mais sétimas, sus, diminuto e aumentado (sem nona nem add9)', () => {
    const pool = chordPool(drillPreset('advanced'))
    const qualities = new Set(pool.map((c) => c.quality))
    for (const q of ['major', 'minor', 'dominant7', 'major7', 'minor7', 'sus2', 'sus4', 'diminished', 'augmented']) expect(qualities.has(q as never)).toBe(true)
    for (const q of ['dominant9', 'add9', 'halfDiminished', 'dominant7flat9']) expect(qualities.has(q as never)).toBe(false)
    expect(pool.some((c) => chordDisplayName(c) === 'B com sétima')).toBe(true)
  })

  it('Profissional: tudo do Avançado mais add9, sextas, nonas, alterados, meio-diminuto e diminuto com sétima', () => {
    const pool = chordPool(drillPreset('professional'))
    const qualities = new Set(pool.map((c) => c.quality))
    for (const q of [
      'major', 'minor', 'dominant7', 'major7', 'minor7', 'sus4', 'diminished', 'augmented',
      'add9', 'dominant9', 'major9', 'minor9', 'major6', 'minor6', 'minorMajor7', 'halfDiminished', 'diminished7', 'dominant7sus4', 'dominant7flat9', 'dominant7sharp9',
    ]) expect(qualities.has(q as never)).toBe(true)
    expect(pool.some((c) => chordDisplayName(c) === 'C add9')).toBe(true)
    // Nenhum acorde repete classe de nota (a nona sobe para a oitava seguinte, não duplica).
    expect(pool.every((c) => chordOrderedPitchClasses(c).length === new Set(chordOrderedPitchClasses(c)).size)).toBe(true)
  })

  it('nomes do Profissional em solfejo e cifra', () => {
    expect(chordFullName(makeChord(7, 'dominant7flat9'))).toBe('Sol com sétima e nona menor (G7b9)')
    expect(chordFullName(makeChord(2, 'halfDiminished'))).toBe('Ré meio-diminuto (Dm7b5)')
    expect(chordSymbol(makeChord(0, 'minorMajor7'))).toBe('Cm(maj7)')
  })

  it('Avançado pede inversão: o baixo faz parte da resposta', () => {
    const d = new ChordDrill({ ...drillPreset('advanced'), rounds: 3, timePerNote: 10 }, () => 0.5)
    d.start(0)
    if (d.phase.kind !== 'awaiting') throw new Error('esperava rodada')
    const { chord, inversion } = d.phase
    expect(inversion).toBeGreaterThan(0)
    const pcs = chordOrderedPitchClasses(chord)
    const bass = targetBassPitchClass({ chord, inversion })
    // Baixo certo embaixo, as outras notas acima.
    const right = [48 + bass, ...pcs.filter((p) => p !== bass).map((p) => 60 + p)]
    // Mesmas classes, mas a fundamental no baixo.
    const wrong = [48 + pcs[0], ...pcs.filter((p) => p !== pcs[0]).map((p) => 60 + p)]
    d.notesChanged(wrong, 0.2)
    expect(d.phase.kind).toBe('awaiting')
    d.notesChanged([], 0.3)
    expect(d.stats.wrong).toBe(1)

    const e = new ChordDrill({ ...drillPreset('advanced'), rounds: 3, timePerNote: 10 }, () => 0.5)
    e.start(0)
    e.notesChanged(right, 0.2)
    expect(e.stats.correct).toBe(1)
  })

  it('sem checar o baixo (microfone), as classes certas bastam', () => {
    const d = new ChordDrill({ ...drillPreset('advanced'), rounds: 3, timePerNote: 10 }, () => 0.5)
    d.start(0)
    if (d.phase.kind !== 'awaiting') throw new Error('esperava rodada')
    const pcs = chordOrderedPitchClasses(d.phase.chord)
    d.notesChanged(pcs.map((p) => 60 + p), 0.2, { checkBass: false })
    expect(d.stats.correct).toBe(1)
  })

  it('acerta no instante em que as notas batem, em qualquer oitava e inversão', () => {
    const d = make()
    d.start(0)
    expect(d.phase.kind).toBe('awaiting')
    d.notesChanged([64], 0.2)
    d.notesChanged([64, 79], 0.3)
    d.notesChanged([64, 79, 72], 0.5)
    expect(d.phase.kind).toBe('showingResult')
    if (d.phase.kind === 'showingResult') expect(d.phase.result.outcome.kind).toBe('correct')
    expect(d.stats.correct).toBe(1)
  })

  it('soltar com menos notas que o acorde é procura e não conta', () => {
    const d = make()
    d.start(0)
    d.notesChanged([60, 62], 0.2)
    d.notesChanged([], 0.4)
    expect(d.phase.kind).toBe('awaiting')
    expect(d.stats.attempts).toBe(0)
  })

  it('soltar com notas suficientes e erradas é erro', () => {
    const d = make()
    d.start(0)
    d.notesChanged([60, 63, 67], 0.2)
    expect(d.phase.kind).toBe('awaiting')
    d.notesChanged([], 0.4)
    expect(d.phase.kind).toBe('showingResult')
    expect(d.stats.wrong).toBe(1)
  })

  it('mão parada em notas erradas vira erro depois do tempo de espera', () => {
    const d = make()
    d.start(0)
    d.notesChanged([60, 63, 67], 1)
    d.tick(1 + CHORD_HOLD_VERDICT_S - 0.1)
    expect(d.phase.kind).toBe('awaiting')
    d.tick(1 + CHORD_HOLD_VERDICT_S + 0.01)
    expect(d.stats.wrong).toBe(1)
  })

  it('corrigir a nota antes do tempo de espera acerta', () => {
    const d = make()
    d.start(0)
    d.notesChanged([60, 63, 67], 1)
    d.notesChanged([60, 64, 67], 1.3)
    expect(d.stats.correct).toBe(1)
  })

  it('tempo esgotado', () => {
    const d = make()
    d.start(0)
    d.tick(14.9)
    expect(d.stats.timeouts).toBe(0)
    d.tick(15.1)
    expect(d.stats.timeouts).toBe(1)
  })

  it('notas presas da rodada anterior só contam depois de soltar', () => {
    const d = make()
    d.start(0)
    d.notesChanged(cMajor, 0.5)
    expect(d.stats.correct).toBe(1)
    d.tick(0.5 + config.pauseBetweenNotes + 0.01)
    expect(d.phase.kind).toBe('awaiting')
    // Mão ainda nas teclas do acorde anterior: nada é julgado.
    d.notesChanged(cMajor, 3)
    d.tick(5)
    expect(d.stats.attempts).toBe(1)
    d.notesChanged([], 5.1)
    expect(d.stats.attempts).toBe(1)
  })

  it('termina depois das rodadas configuradas', () => {
    const d = make({ rounds: 1 })
    d.start(0)
    d.notesChanged(cMajor, 0.3)
    d.tick(0.3 + config.pauseBetweenNotes + 0.01)
    expect(d.phase.kind).toBe('finished')
  })

  it('tempo da rodada cresce com o tamanho do acorde e a inversão', () => {
    expect(chordTimeFactor(makeChord(0, 'major'), 0)).toBe(1.5)
    expect(chordTimeFactor(makeChord(0, 'major'), 1)).toBe(2)
    expect(chordTimeFactor(makeChord(7, 'dominant7'), 0)).toBe(2)
    expect(chordTimeFactor(makeChord(0, 'dominant9'), 2)).toBe(3)
  })

  it('Médio pede inversão só de tríades, e o baixo conta', () => {
    const d = new ChordDrill({ ...drillPreset('medium'), rounds: 3, timePerNote: 6 }, () => 0.99)
    d.start(0)
    if (d.phase.kind !== 'awaiting') throw new Error('esperava rodada')
    expect(chordPool(drillPreset('medium')).every((c) => chordOrderedPitchClasses(c).length === 3)).toBe(true)
    expect(d.phase.inversion).toBeGreaterThan(0)
    expect(d.phase.duration).toBe(6 * 2)
  })

  it('nomes com solfejo e cifra', () => {
    expect(chordFullName(makeChord(7, 'dominant7'))).toBe('Sol com sétima (G7)')
    expect(chordFullName(makeChord(9, 'minor'))).toBe('Lá menor (Am)')
    expect(chordSymbol(makeChord(0, 'add9'))).toBe('Cadd9')
    expect(chordSymbol(makeChord(0, 'major7'))).toBe('Cmaj7')
  })
})
