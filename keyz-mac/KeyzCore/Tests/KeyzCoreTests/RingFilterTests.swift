import Foundation
import Testing
@testable import KeyzCore

@Suite struct RingFilterTests {
    let sampleRate = 48_000.0
    let weak: [Double] = [0.4, 1, 0.8, 0.5, 0.35, 0.2, 0.15, 0.1]

    /// Nota `first` (decai) seguida de `second` em `switchAt`, com a primeira ainda soando, mais ruído de sala.
    func sequence(_ first: Int, _ second: Int, switchAt: Double, total: Double) -> [Float] {
        var generator = SeededGenerator(state: 42)
        let count = Int(total * sampleRate)
        return (0..<count).map { index in
            let t = Double(index) / sampleRate
            var value = 0.0
            for (midi, start) in [(first, 0.0), (second, switchAt)] where t >= start {
                let local = t - start
                let decay = exp(-1.5 * local)
                for (order, amplitude) in weak.enumerated() {
                    value += amplitude * decay * sin(2 * .pi * Note(midi: midi).frequency * Double(order + 1) * local)
                }
            }
            let hum = Float(Double(generator.next() % 2001) / 1000 - 1) * 0.01
            return Float(0.05 * value) + hum
        }
    }

    /// Classes reportadas, quadro a quadro, depois que a nova nota começa.
    func readings(_ first: Int, _ second: Int) -> [Set<PitchClass>] {
        let analyzer = ChromaAnalyzer(sampleRate: sampleRate)
        var ring = RingFilter()
        let audio = sequence(first, second, switchAt: 0.5, total: 1.2)
        var result: [Set<PitchClass>] = []
        var index = 0
        while index + 8192 <= audio.count {
            let t = Double(index + 8192) / sampleRate
            let attack = t > 0.5 && t < 0.52
            let filtered = ring.filter(analyzer.analyze(samples: Array(audio[index..<index + 8192])), attack: attack)
            if t > 0.7 { result.append(filtered?.pitchClasses ?? []) }
            index += 480
        }
        return result
    }

    @Test(arguments: [(60, 64), (60, 67), (62, 69)])
    func newNoteIsNotMixedWithTheRingingOne(first: Int, second: Int) {
        let frames = readings(first, second)
        let expected = Set([PitchClass(second)])
        // Depois da troca, a nota antiga (ainda soando) não pode aparecer em nenhum quadro, nem junto com a nova.
        #expect(frames.allSatisfy { !$0.contains(PitchClass(first)) }, "resíduo vazou: \(frames)")
        #expect(frames.last == expected)
    }

    @Test func repeatedNoteIsStillRecognized() {
        let frames = readings(60, 60)
        #expect(frames.last == Set([PitchClass(0)]))
    }
}
