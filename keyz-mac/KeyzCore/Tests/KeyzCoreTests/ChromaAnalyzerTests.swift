import Foundation
import Testing
@testable import KeyzCore

@Suite struct ChromaAnalyzerTests {
    let sampleRate = 48_000.0
    /// Harmônicos decrescentes, parecidos com os de uma nota de piano.
    let pianoHarmonics: [Double] = [1, 0.5, 0.35, 0.25, 0.15, 0.1, 0.07]

    /// Soma de notas MIDI com harmônicos e um pouco de ruído.
    func play(_ notes: [Int], noise: Float = 0.002, count: Int = 8192) -> [Float] {
        var generator = SeededGenerator(state: 7)
        let frequencies = notes.map { Note(midi: $0).frequency }
        return (0..<count).map { index in
            let t = Double(index) / sampleRate
            var value = 0.0
            for frequency in frequencies {
                for (order, amplitude) in pianoHarmonics.enumerated() {
                    value += amplitude * sin(2 * .pi * frequency * Double(order + 1) * t)
                }
            }
            let jitter = Float(Double(generator.next() % 2001) / 1000 - 1) * noise
            return Float(0.1 * value) + jitter
        }
    }

    func pitchClasses(_ values: [Int]) -> Set<PitchClass> {
        Set(values.map(PitchClass.init))
    }

    @Test func singleNoteIsNotMistakenForChord() throws {
        let analyzer = ChromaAnalyzer(sampleRate: sampleRate)
        for midi in [48, 55, 60, 64, 67, 72] {
            let reading = try #require(analyzer.analyze(samples: play([midi])))
            #expect(reading.pitchClasses == [PitchClass(midi)], "nota \(midi)")
        }
    }

    @Test func recognizesEveryMajorAndMinorTriad() throws {
        let analyzer = ChromaAnalyzer(sampleRate: sampleRate)
        for root in 0..<12 {
            for quality in ChordQuality.allCases {
                let chord = Chord(root: PitchClass(root), quality: quality)
                let notes = quality == .major ? [0, 4, 7] : [0, 3, 7]
                let reading = try #require(analyzer.analyze(samples: play(notes.map { 60 + root + $0 })))
                #expect(reading.pitchClasses == chord.pitchClasses, "\(chord.displayName)")
            }
        }
    }

    @Test func recognizesInversionsAndLowerOctave() throws {
        let analyzer = ChromaAnalyzer(sampleRate: sampleRate)
        let cMajor = pitchClasses([0, 4, 7])
        #expect(analyzer.analyze(samples: play([64, 67, 72]))?.pitchClasses == cMajor)
        #expect(analyzer.analyze(samples: play([55, 60, 64]))?.pitchClasses == cMajor)
        #expect(analyzer.analyze(samples: play([57, 60, 64]))?.pitchClasses == pitchClasses([9, 0, 4]))
    }

    @Test func wrongChordShowsWrongNote() throws {
        let analyzer = ChromaAnalyzer(sampleRate: sampleRate)
        // Pediram Dó menor, tocaram Dó maior: o Mi aparece no lugar do Mi bemol.
        let reading = try #require(analyzer.analyze(samples: play([60, 64, 67])))
        let evaluation = ChordEvaluator.evaluate(
            played: Set(reading.pitchClasses.map { UInt8(60 + $0.value) }),
            against: Chord(root: PitchClass(0), quality: .minor)
        )
        #expect(evaluation.missing == [PitchClass(3)])
        #expect(evaluation.extra == [PitchClass(4)])
    }

    @Test func noiseIsNotMusic() {
        let analyzer = ChromaAnalyzer(sampleRate: sampleRate)
        var generator = SeededGenerator(state: 3)
        let noise = (0..<8192).map { _ in Float(Double(generator.next() % 2001) / 1000 - 1) * 0.05 }
        #expect(analyzer.analyze(samples: noise) == nil)
    }

    @Test func silenceReturnsNil() {
        let analyzer = ChromaAnalyzer(sampleRate: sampleRate)
        #expect(analyzer.analyze(samples: [Float](repeating: 0, count: 8192)) == nil)
        #expect(analyzer.analyze(samples: [Float](repeating: 0.1, count: 100)) == nil)
    }

    @Test func stabilizerConfirmsAfterRepeatedFrames() {
        var stabilizer = PitchClassSetStabilizer(requiredFrames: 2)
        let reading = ChromaReading(chroma: [], pitchClasses: [PitchClass(0), PitchClass(4), PitchClass(7)])
        #expect(stabilizer.feed(reading) == nil)
        #expect(stabilizer.feed(reading) == reading.pitchClasses)
    }

    @Test func stabilizerToleratesAStrayNoteFrame() {
        var stabilizer = PitchClassSetStabilizer(requiredFrames: 4)
        let chord = ChromaReading(chroma: [], pitchClasses: [PitchClass(0), PitchClass(4), PitchClass(7)])
        let stray = ChromaReading(chroma: [], pitchClasses: [PitchClass(0), PitchClass(4), PitchClass(7), PitchClass(2)])
        var confirmed: Set<PitchClass>?
        for reading in [chord, chord, stray, chord, chord] { confirmed = stabilizer.feed(reading) ?? confirmed }
        #expect(confirmed == chord.pitchClasses)
    }

    @Test func steadyRoomNoiseIsIgnoredAfterLearningIt() throws {
        let analyzer = ChromaAnalyzer(sampleRate: sampleRate)
        var generator = SeededGenerator(state: 21)
        func noise() -> [Float] {
            (0..<8192).map { _ in Float(Double(generator.next() % 2001) / 1000 - 1) * 0.02 }
        }
        for _ in 0..<100 { _ = analyzer.analyze(samples: noise()) }
        for _ in 0..<20 {
            let reading = analyzer.analyze(samples: noise())
            #expect((reading?.pitchClasses ?? []).isEmpty)
        }
        let music = play([60, 64, 67])
        let mixed = zip(music, noise()).map { $0 + $1 }
        let reading = try #require(analyzer.analyze(samples: mixed))
        #expect(reading.pitchClasses == pitchClasses([0, 4, 7]))
    }
}
