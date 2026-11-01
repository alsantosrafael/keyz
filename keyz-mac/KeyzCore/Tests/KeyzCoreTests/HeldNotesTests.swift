import Foundation
import Testing
@testable import KeyzCore

@Suite struct HeldNotesTests {
    @Test func keepsNotesThatDroppedOutWhileHeld() {
        var held = HeldNotes()
        _ = held.update(pressed: [60, 64, 67])
        #expect(held.update(pressed: [60, 64]) == [60, 64, 67])
        #expect(held.update(pressed: [60]) == [60, 64, 67])
    }

    @Test func resetsWhenHandLeavesTheKeys() {
        var held = HeldNotes()
        _ = held.update(pressed: [60, 64, 67])
        #expect(held.update(pressed: []) == [])
        #expect(held.update(pressed: [57]) == [57])
    }

    @Test func discardedNotesDoNotComeBackUntilReleased() {
        var held = HeldNotes()
        _ = held.update(pressed: [60, 64, 66])
        held.discard([PitchClass(66)])
        #expect(held.update(pressed: [60, 64, 66]) == [60, 64])
        #expect(held.update(pressed: [60, 64, 67]) == [60, 64, 67])
        #expect(held.update(pressed: []) == [])
        #expect(held.update(pressed: [66]) == [66])
    }

    /// Simula o microfone num acorde que decai: os conjuntos confirmados perdem notas,
    /// mas a união durante a pegada é o acorde inteiro.
    @Test(arguments: [[60, 64, 67], [57, 60, 64], [55, 59, 62]])
    func unionOfDecayingChordIsTheFullChord(midis: [Int]) {
        let sampleRate = 48_000.0
        let weak: [Double] = [0.4, 1, 0.8, 0.5, 0.35, 0.2, 0.15, 0.1]
        var generator = SeededGenerator(state: 99)
        let audio: [Float] = (0..<Int(1.5 * sampleRate)).map { index in
            let t = Double(index) / sampleRate
            let decay = exp(-1.5 * t)
            var value = 0.0
            for midi in midis {
                let f0 = Note(midi: midi).frequency
                for (order, amplitude) in weak.enumerated() {
                    value += amplitude * decay * sin(2 * .pi * f0 * Double(order + 1) * t)
                }
            }
            let hum = Float(Double(generator.next() % 2001) / 1000 - 1) * 0.01
            return Float(0.05 * value) + hum
        }

        let analyzer = ChromaAnalyzer(sampleRate: sampleRate)
        var stabilizer = PitchClassSetStabilizer(requiredFrames: 5)
        var held = HeldNotes()
        var index = 0
        while index + 8192 <= audio.count {
            let confirmed = stabilizer.feed(analyzer.analyze(samples: Array(audio[index..<index + 8192])))
            if let confirmed {
                _ = held.update(pressed: Set(confirmed.map { 60 + $0.value }))
            }
            index += 480
        }
        let expected = Set(midis.map { PitchClass($0).value + 60 })
        #expect(Set(held.notes.map { $0 % 12 }) == Set(expected.map { $0 % 12 }))
    }
}
