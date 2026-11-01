public struct ChordEvaluation: Equatable, Sendable {
    public let missing: Set<PitchClass>
    public let extra: Set<PitchClass>

    public var isCorrect: Bool { missing.isEmpty && extra.isEmpty }
}

public enum ChordEvaluator {
    /// Compara as notas MIDI tocadas com o acorde esperado, ignorando oitava e inversão.
    public static func evaluate(played midiNotes: Set<UInt8>, against chord: Chord) -> ChordEvaluation {
        let played = Set(midiNotes.map(PitchClass.init(midiNote:)))
        let expected = chord.pitchClasses
        return ChordEvaluation(
            missing: expected.subtracting(played),
            extra: played.subtracting(expected)
        )
    }
}
