import Foundation
import Testing
@testable import KeyzCore

/// Timbres mais próximos de um piano de verdade: nos graves e médios a fundamental costuma ser
/// mais fraca que o 2º e o 3º harmônicos, e os parciais saem levemente desafinados para cima.
@Suite struct RealisticPianoTests {
    let sampleRate = 48_000.0

    func piano(_ midis: [Int], partials: [Double], inharmonicity: Double = 0.0004, count: Int = 8192) -> [Float] {
        var generator = SeededGenerator(state: 11)
        let frequencies = midis.map { Note(midi: $0).frequency }
        return (0..<count).map { index in
            let t = Double(index) / sampleRate
            var value = 0.0
            for f0 in frequencies {
                for (order, amplitude) in partials.enumerated() {
                    let n = Double(order + 1)
                    value += amplitude * sin(2 * .pi * f0 * n * (1 + inharmonicity * n * n).squareRoot() * t)
                }
            }
            return Float(0.05 * value) + Float(Double(generator.next() % 2001) / 1000 - 1) * 0.002
        }
    }

    let weakFundamental: [Double] = [0.4, 1, 0.8, 0.5, 0.35, 0.2, 0.15, 0.1]

    @Test func chromaSeesOneNoteWhenFundamentalIsWeak() throws {
        let analyzer = ChromaAnalyzer(sampleRate: sampleRate)
        for midi in [40, 45, 48, 52, 55, 60, 64] {
            let reading = try #require(analyzer.analyze(samples: piano([midi], partials: weakFundamental)), "nota \(midi)")
            #expect(reading.pitchClasses == [PitchClass(midi)], "nota \(midi): \(reading.pitchClasses)")
        }
    }

    @Test func chromaStillSeesTriads() throws {
        let analyzer = ChromaAnalyzer(sampleRate: sampleRate)
        for notes in [[60, 64, 67], [57, 60, 64], [55, 59, 62], [64, 67, 72]] {
            let reading = try #require(analyzer.analyze(samples: piano(notes, partials: weakFundamental)))
            #expect(reading.pitchClasses == Set(notes.map(PitchClass.init)), "\(notes): \(reading.pitchClasses)")
        }
    }

    @Test(arguments: [0.0004, 0.002])
    func yinKeepsTheOctave(inharmonicity: Double) throws {
        let detector = PitchDetector(sampleRate: sampleRate)
        for midi in [36, 40, 45, 48, 52, 55, 60, 64, 69, 72, 76, 84] {
            let samples = piano([midi], partials: weakFundamental, inharmonicity: inharmonicity, count: detector.recommendedBufferSize)
            let reading = detector.detect(samples: samples)
            #expect(reading?.note?.note == Note(midi: midi), "nota \(midi): \(reading.map { "\($0.frequency) conf \($0.confidence)" } ?? "nil")")
        }
    }
}

@Suite struct PitchDetectorEdgeTests {
    /// Sinais curtos e ruidosos podem fazer o mínimo cair na borda da busca: não pode travar o app.
    @Test func noisyInputNeverCrashes() {
        let detector = PitchDetector(sampleRate: 48_000, minFrequency: 60)
        var generator = SeededGenerator(state: 5)
        for length in [64, 500, 1000, 1600, 3000] {
            for _ in 0..<50 {
                let samples = (0..<length).map { _ in Float(Double(generator.next() % 2001) / 1000 - 1) * 0.1 }
                _ = detector.detect(samples: samples)
            }
        }
    }
}
