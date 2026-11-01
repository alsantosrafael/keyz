import Foundation
import Testing
@testable import KeyzCore

/// Gerador determinístico para testes (SplitMix64).
struct SeededGenerator: RandomNumberGenerator, Sendable {
    var state: UInt64
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

private func makeDrill(_ config: DrillConfig = .preset(.easy)) -> NoteDrill<SeededGenerator> {
    NoteDrill(config: config, source: SeededGenerator(state: 42))
}

private func currentTarget<S>(_ drill: NoteDrill<S>) -> Note? {
    if case let .awaiting(target, _) = drill.phase { return target }
    return nil
}

@Suite struct NoteDrillTests {
    @Test func correctNoteAutoAdvancesAfterPause() throws {
        var drill = makeDrill()
        drill.start(at: 0)
        let target = try #require(currentTarget(drill))

        drill.noteOn(target.midi, at: 2)
        let result = DrillResult(target: target, outcome: .correct, responseTime: 2)
        #expect(drill.phase == .showingResult(result, nextAt: 3.5))
        #expect(drill.stats.correct == 1)
        #expect(drill.stats.streak == 1)

        drill.tick(at: 3.4)
        #expect(currentTarget(drill) == nil)
        drill.tick(at: 3.5)
        let next = try #require(currentTarget(drill))
        #expect(next != target)
    }

    @Test func wrongNoteIsReported() throws {
        var drill = makeDrill()
        drill.start(at: 0)
        let target = try #require(currentTarget(drill))

        drill.noteOn(target.midi + 1, at: 1)
        guard case let .showingResult(result, _) = drill.phase else {
            Issue.record("esperava resultado"); return
        }
        #expect(result.outcome == .wrong(played: Note(midi: target.midi + 1)))
        #expect(drill.stats.wrong == 1)
        #expect(drill.stats.streak == 0)
    }

    @Test func timeoutWhenNothingIsPlayed() throws {
        var drill = makeDrill()
        drill.start(at: 0)
        let target = try #require(currentTarget(drill))

        drill.tick(at: 10)
        let result = DrillResult(target: target, outcome: .timeout, responseTime: nil)
        #expect(drill.phase == .showingResult(result, nextAt: 11.5))
        #expect(drill.stats.timeouts == 1)
    }

    @Test func lateNoteCountsAsTimeout() throws {
        var drill = makeDrill()
        drill.start(at: 0)
        let target = try #require(currentTarget(drill))

        drill.noteOn(target.midi, at: 10.5)
        #expect(drill.stats.timeouts == 1)
        #expect(drill.stats.correct == 0)
    }

    @Test func manualAdvanceWaitsForUser() throws {
        var config = DrillConfig.preset(.easy)
        config.autoAdvance = false
        var drill = makeDrill(config)
        drill.start(at: 0)
        let target = try #require(currentTarget(drill))

        drill.noteOn(target.midi, at: 1)
        drill.tick(at: 100)
        guard case .showingResult(_, nextAt: nil) = drill.phase else {
            Issue.record("deveria esperar o avanço manual"); return
        }
        drill.advance(at: 100)
        #expect(currentTarget(drill) != nil)
    }

    @Test func anyOctaveWhenNotMatchingOctave() throws {
        var config = DrillConfig.preset(.easy)
        config.matchOctave = false
        var drill = makeDrill(config)
        drill.start(at: 0)
        let target = try #require(currentTarget(drill))

        drill.noteOn(target.midi + 12, at: 1)
        #expect(drill.stats.correct == 1)
    }

    @Test func finishesAfterConfiguredRounds() {
        var config = DrillConfig.preset(.easy)
        config.rounds = 2
        var drill = makeDrill(config)
        drill.start(at: 0)
        drill.tick(at: 10)   // 1ª: tempo esgotado
        drill.tick(at: 11.5) // próxima
        drill.tick(at: 21.5) // 2ª: tempo esgotado
        drill.tick(at: 23)
        #expect(drill.phase == .finished)
        #expect(drill.stats.attempts == 2)
    }

    @Test func targetsStayInsidePool() {
        let config = DrillConfig.preset(.medium)
        var drill = makeDrill(config)
        var now = 0.0
        drill.start(at: now)
        for _ in 0..<15 {
            if let target = currentTarget(drill) {
                #expect(config.notePool.contains(target))
                drill.noteOn(target.midi, at: now)
            }
            now += 2
            drill.tick(at: now)
        }
    }

    @Test func presetsGetHarderWithDifficulty() {
        let easy = DrillConfig.preset(.easy)
        let medium = DrillConfig.preset(.medium)
        let advanced = DrillConfig.preset(.advanced)
        #expect(easy.timePerNote > medium.timePerNote)
        #expect(medium.timePerNote > advanced.timePerNote)
        #expect(easy.notePool.count < medium.notePool.count)
        #expect(medium.notePool.count < advanced.notePool.count)
        #expect(easy.notePool.allSatisfy { !$0.isBlackKey })
    }
}

@Suite struct NoteTests {
    @Test func namesAndOctaves() {
        #expect(Note(midi: 60).name() == "C4")
        #expect(Note(midi: 61).name(preferring: .flat) == "Db4")
        #expect(Note(midi: 66).solfegeName() == "Fá♯4")
        #expect(Note(midi: 57).solfegeName() == "Lá3")
    }

    @Test func frequencyRoundTrip() throws {
        #expect(abs(Note(midi: 69).frequency - 440) < 0.001)
        let nearest = try #require(Note.nearest(toFrequency: 452))
        #expect(nearest.note == Note(midi: 69))
        #expect(nearest.cents > 40 && nearest.cents < 50)
    }
}

@Suite struct StaffTests {
    @Test func trebleClefPositions() {
        #expect(StaffPlacement(note: Note(midi: 64)).step == 0)       // E4: 1ª linha
        #expect(StaffPlacement(note: Note(midi: 77)).step == 8)       // F5: 5ª linha
        let middleC = StaffPlacement(note: Note(midi: 60))
        #expect(middleC.clef == .treble)
        #expect(middleC.step == -2)
        #expect(middleC.ledgerLines == 1)
        let a5 = StaffPlacement(note: Note(midi: 81))
        #expect(a5.step == 10)
        #expect(a5.ledgerLines == 1)
    }

    @Test func bassClefPositions() {
        let g2 = StaffPlacement(note: Note(midi: 43))
        #expect(g2.clef == .bass)
        #expect(g2.step == 0)
        let b3 = StaffPlacement(note: Note(midi: 59))
        #expect(b3.step == 9)
        #expect(b3.ledgerLines == 0)
    }

    @Test func accidentalsDependOnSpelling() {
        let sharp = StaffPlacement(note: Note(midi: 61), accidental: .sharp)
        #expect(sharp.step == -2)
        #expect(sharp.accidental == .sharp)
        let flat = StaffPlacement(note: Note(midi: 61), accidental: .flat)
        #expect(flat.step == -1)
        #expect(flat.accidental == .flat)
        #expect(StaffPlacement(note: Note(midi: 62)).accidental == nil)
    }

    @Test func keyboardLayout() {
        let keys = KeyboardLayout.keys(from: Note(midi: 60), to: Note(midi: 71))
        #expect(keys.count == 12)
        #expect(keys.filter { !$0.isBlack }.count == 7)
        #expect(keys[1].whiteIndex == 0) // C#4 entre C e D
        #expect(keys[6].whiteIndex == 3) // F#4 entre F e G
        #expect(keys[11].whiteIndex == 6)
    }
}

@Suite struct PitchDetectionTests {
    let sampleRate = 44_100.0

    func tone(_ frequency: Double, harmonics: [Double] = [1], count: Int) -> [Float] {
        (0..<count).map { i in
            let t = Double(i) / sampleRate
            let value = harmonics.enumerated().reduce(0.0) { sum, h in
                sum + h.element * sin(2 * .pi * frequency * Double(h.offset + 1) * t)
            }
            return Float(0.3 * value)
        }
    }

    @Test func detectsPureA4() throws {
        let detector = PitchDetector(sampleRate: sampleRate)
        let reading = try #require(detector.detect(samples: tone(440, count: 4096)))
        #expect(abs(reading.frequency - 440) < 1)
        #expect(reading.confidence > 0.9)
    }

    @Test func detectsPianoLikeMiddleC() throws {
        let detector = PitchDetector(sampleRate: sampleRate)
        let samples = tone(261.63, harmonics: [1, 0.6, 0.4, 0.25], count: 4096)
        let reading = try #require(detector.detect(samples: samples))
        #expect(reading.note?.note == Note(midi: 60))
    }

    @Test func detectsLowA1() throws {
        let detector = PitchDetector(sampleRate: sampleRate)
        let samples = tone(55, harmonics: [1, 0.8, 0.5], count: detector.recommendedBufferSize)
        let reading = try #require(detector.detect(samples: samples))
        #expect(reading.note?.note == Note(midi: 33))
    }

    @Test func silenceIsIgnored() {
        let detector = PitchDetector(sampleRate: sampleRate)
        #expect(detector.detect(samples: [Float](repeating: 0, count: 4096)) == nil)
    }

    @Test func stabilizerNeedsConsecutiveFrames() {
        var stabilizer = NoteStabilizer(requiredFrames: 3)
        let a4 = PitchReading(frequency: 440, confidence: 0.95)
        #expect(stabilizer.feed(a4) == nil)
        #expect(stabilizer.feed(a4) == nil)
        #expect(stabilizer.feed(a4)?.note == Note(midi: 69))
        #expect(stabilizer.feed(nil) == nil)
        #expect(stabilizer.feed(a4) == nil)
        #expect(stabilizer.feed(PitchReading(frequency: 440, confidence: 0.3)) == nil)
    }
}
