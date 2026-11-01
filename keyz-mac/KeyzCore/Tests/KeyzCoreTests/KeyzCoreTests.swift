import Testing
@testable import KeyzCore

@Suite struct ChordTests {
    @Test func cMajorNotes() {
        let chord = Chord(root: PitchClass(0), quality: .major)
        #expect(chord.pitchClasses == [PitchClass(0), PitchClass(4), PitchClass(7)])
        #expect(chord.displayName == "C maior")
    }

    @Test func fSharpMinorNotes() {
        let chord = Chord(root: PitchClass(6), quality: .minor, accidental: .sharp)
        #expect(chord.pitchClasses == [PitchClass(6), PitchClass(9), PitchClass(1)])
        #expect(chord.displayName == "F# menor")
    }

    @Test func enharmonicNames() {
        let sharp = Chord(root: PitchClass(1), quality: .major, accidental: .sharp)
        let flat = Chord(root: PitchClass(1), quality: .major, accidental: .flat)
        #expect(sharp.displayName == "C# maior")
        #expect(flat.displayName == "Db maior")
        #expect(sharp.pitchClasses == flat.pitchClasses)
    }

    @Test func pitchClassWrapsAround() {
        #expect(PitchClass(-1) == PitchClass(11))
        #expect(PitchClass(midiNote: 60) == PitchClass(0))
        #expect(PitchClass(11).transposed(by: 2) == PitchClass(1))
    }
}

@Suite struct EvaluatorTests {
    let cMajor = Chord(root: PitchClass(0), quality: .major)

    @Test func correctRootPosition() {
        #expect(ChordEvaluator.evaluate(played: [60, 64, 67], against: cMajor).isCorrect)
    }

    @Test func inversionAndDoubledOctavesAreAccepted() {
        #expect(ChordEvaluator.evaluate(played: [64, 67, 72, 84], against: cMajor).isCorrect)
    }

    @Test func reportsMissingNote() {
        let result = ChordEvaluator.evaluate(played: [60, 67], against: cMajor)
        #expect(result.missing == [PitchClass(4)])
        #expect(result.extra.isEmpty)
    }

    @Test func reportsExtraNote() {
        let result = ChordEvaluator.evaluate(played: [60, 64, 67, 70], against: cMajor)
        #expect(result.extra == [PitchClass(10)])
        #expect(result.missing.isEmpty)
    }

    @Test func minorPlayedAsMajorReportsBoth() {
        let result = ChordEvaluator.evaluate(played: [60, 64, 67], against: Chord(root: PitchClass(0), quality: .minor))
        #expect(result.missing == [PitchClass(3)])
        #expect(result.extra == [PitchClass(4)])
    }

    @Test func nothingPlayedMissesAll() {
        let result = ChordEvaluator.evaluate(played: [], against: cMajor)
        #expect(result.missing == cMajor.pitchClasses)
    }
}

@Suite struct RecognizerTests {
    @Test func recognizesRootPositionAndInversions() {
        #expect(ChordRecognizer.recognize([60, 64, 67])?.chord.displayName == "C maior")
        #expect(ChordRecognizer.recognize([60, 64, 67])?.inversion == 0)
        #expect(ChordRecognizer.recognize([64, 67, 72])?.inversion == 1)
        #expect(ChordRecognizer.recognize([55, 60, 64, 72])?.inversion == 2)
    }

    @Test func recognizesMinorAndSpelling() {
        #expect(ChordRecognizer.recognize([57, 60, 64])?.chord.displayName == "A menor")
        #expect(ChordRecognizer.recognize([63, 67, 70])?.chord.displayName == "Eb maior")
        #expect(ChordRecognizer.recognize([61, 64, 68])?.chord.displayName == "C# menor")
    }

    @Test func rejectsNonTriads() {
        #expect(ChordRecognizer.recognize([60, 64]) == nil)
        #expect(ChordRecognizer.recognize([60, 64, 67, 70]) == nil)
        #expect(ChordRecognizer.recognize([]) == nil)
    }
}

@Suite struct GeneratorTests {
    @Test func poolCoversAll24ChordsAndEnharmonics() {
        let generator = ChordGenerator()
        let roots = Set(generator.pool.map(\.root))
        #expect(roots.count == 12)
        // 7 teclas brancas × 2 qualidades + 5 pretas × 2 qualidades × 2 grafias
        #expect(generator.pool.count == 7 * 2 + 5 * 2 * 2)
    }

    @Test func neverRepeatsImmediately() {
        var generator = ChordGenerator()
        var previous = generator.next()
        for _ in 0..<200 {
            let current = generator.next()
            #expect(current != previous)
            previous = current
        }
    }

    @Test func respectsQualityFilter() {
        var generator = ChordGenerator(qualities: [.minor])
        for _ in 0..<50 {
            #expect(generator.next()?.quality == .minor)
        }
    }
}
