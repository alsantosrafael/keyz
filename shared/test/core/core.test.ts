import { describe, expect, it } from 'vitest'
import {
  type Chord, ChordGenerator, evaluateChord, keyboardKeys, makeChord, nearestNote, noteFrequency, noteName, noteSolfege,
  pitchClass, recognizeChord, staffPlacement, transposed, chordDisplayName, chordPitchClasses, isBlackKey,
} from '../../src'

const pcs = (...v: number[]) => new Set(v.map(pitchClass))

describe('ChordTests', () => {
  it('cMajorNotes', () => {
    const chord = makeChord(0, 'major')
    expect(chordPitchClasses(chord)).toEqual(pcs(0, 4, 7))
    expect(chordDisplayName(chord)).toBe('C maior')
  })
  it('fSharpMinorNotes', () => {
    const chord = makeChord(6, 'minor', 'sharp')
    expect(chordPitchClasses(chord)).toEqual(pcs(6, 9, 1))
    expect(chordDisplayName(chord)).toBe('F# menor')
  })
  it('enharmonicNames', () => {
    const sharp = makeChord(1, 'major', 'sharp')
    const flat = makeChord(1, 'major', 'flat')
    expect(chordDisplayName(sharp)).toBe('C# maior')
    expect(chordDisplayName(flat)).toBe('Db maior')
    expect(chordPitchClasses(sharp)).toEqual(chordPitchClasses(flat))
  })
  it('pitchClassWrapsAround', () => {
    expect(pitchClass(-1)).toBe(pitchClass(11))
    expect(pitchClass(60)).toBe(pitchClass(0))
    expect(transposed(pitchClass(11), 2)).toBe(pitchClass(1))
  })
})

describe('EvaluatorTests', () => {
  const cMajor = makeChord(0, 'major')
  it('correctRootPosition', () => expect(evaluateChord([60, 64, 67], cMajor).isCorrect).toBe(true))
  it('inversionAndDoubledOctavesAreAccepted', () => expect(evaluateChord([64, 67, 72, 84], cMajor).isCorrect).toBe(true))
  it('reportsMissingNote', () => {
    const r = evaluateChord([60, 67], cMajor)
    expect(r.missing).toEqual(pcs(4))
    expect(r.extra.size).toBe(0)
  })
  it('reportsExtraNote', () => {
    const r = evaluateChord([60, 64, 67, 70], cMajor)
    expect(r.extra).toEqual(pcs(10))
    expect(r.missing.size).toBe(0)
  })
  it('minorPlayedAsMajorReportsBoth', () => {
    const r = evaluateChord([60, 64, 67], makeChord(0, 'minor'))
    expect(r.missing).toEqual(pcs(3))
    expect(r.extra).toEqual(pcs(4))
  })
  it('nothingPlayedMissesAll', () => expect(evaluateChord([], cMajor).missing).toEqual(chordPitchClasses(cMajor)))
})

describe('RecognizerTests', () => {
  it('recognizesRootPositionAndInversions', () => {
    expect(chordDisplayName(recognizeChord([60, 64, 67])!.chord)).toBe('C maior')
    expect(recognizeChord([60, 64, 67])?.inversion).toBe(0)
    expect(recognizeChord([64, 67, 72])?.inversion).toBe(1)
    expect(recognizeChord([55, 60, 64, 72])?.inversion).toBe(2)
  })
  it('recognizesMinorAndSpelling', () => {
    expect(chordDisplayName(recognizeChord([57, 60, 64])!.chord)).toBe('A menor')
    expect(chordDisplayName(recognizeChord([63, 67, 70])!.chord)).toBe('Eb maior')
    expect(chordDisplayName(recognizeChord([61, 64, 68])!.chord)).toBe('C# menor')
  })
  it('rejectsNonTriads', () => {
    expect(recognizeChord([60, 64])).toBeNull()
    expect(recognizeChord([60, 64, 67, 70])).toBeNull()
    expect(recognizeChord([])).toBeNull()
  })
})

describe('GeneratorTests', () => {
  it('poolCoversAll24ChordsAndEnharmonics', () => {
    const g = new ChordGenerator()
    expect(new Set(g.pool.map((c) => c.root)).size).toBe(12)
    expect(g.pool.length).toBe(7 * 2 + 5 * 2 * 2)
  })
  it('neverRepeatsImmediately', () => {
    const g = new ChordGenerator()
    let previous = g.next()
    for (let i = 0; i < 200; i++) {
      const current = g.next()
      expect(current).not.toEqual(previous)
      previous = current
    }
  })
  it('respectsQualityFilter', () => {
    const g = new ChordGenerator(['minor'])
    for (let i = 0; i < 50; i++) expect(g.next()?.quality).toBe('minor')
  })
})

describe('NoteTests', () => {
  it('namesAndOctaves', () => {
    expect(noteName(60)).toBe('C4')
    expect(noteName(61, 'flat')).toBe('Db4')
    expect(noteSolfege(66)).toBe('Fá♯4')
    expect(noteSolfege(57)).toBe('Lá3')
  })
  it('frequencyRoundTrip', () => {
    expect(Math.abs(noteFrequency(69) - 440)).toBeLessThan(0.001)
    const nearest = nearestNote(452)!
    expect(nearest.note).toBe(69)
    expect(nearest.cents).toBeGreaterThan(40)
    expect(nearest.cents).toBeLessThan(50)
  })
})

describe('StaffTests', () => {
  it('trebleClefPositions', () => {
    expect(staffPlacement(64).step).toBe(0)
    expect(staffPlacement(77).step).toBe(8)
    const c = staffPlacement(60)
    expect(c.clef).toBe('treble')
    expect(c.step).toBe(-2)
    expect(c.ledgerLines).toBe(1)
    const a5 = staffPlacement(81)
    expect(a5.step).toBe(10)
    expect(a5.ledgerLines).toBe(1)
  })
  it('bassClefPositions', () => {
    const g2 = staffPlacement(43)
    expect(g2.clef).toBe('bass')
    expect(g2.step).toBe(0)
    const b3 = staffPlacement(59)
    expect(b3.step).toBe(9)
    expect(b3.ledgerLines).toBe(0)
  })
  it('accidentalsDependOnSpelling', () => {
    const sharp = staffPlacement(61, 'sharp')
    expect(sharp.step).toBe(-2)
    expect(sharp.accidental).toBe('sharp')
    const flat = staffPlacement(61, 'flat')
    expect(flat.step).toBe(-1)
    expect(flat.accidental).toBe('flat')
    expect(staffPlacement(62).accidental).toBeNull()
  })
  it('keyboardLayout', () => {
    const keys = keyboardKeys(60, 71)
    expect(keys.length).toBe(12)
    expect(keys.filter((k) => !k.isBlack).length).toBe(7)
    expect(keys[1].whiteIndex).toBe(0)
    expect(keys[6].whiteIndex).toBe(3)
    expect(keys[11].whiteIndex).toBe(6)
    expect(isBlackKey(1)).toBe(true)
  })
})
export type { Chord }
