public struct RecognizedChord: Equatable, Sendable {
    public let chord: Chord
    /// 0 = posição fundamental, 1 = 1ª inversão (terça no baixo), 2 = 2ª inversão (quinta no baixo).
    public let inversion: Int

    public var inversionName: String {
        switch inversion {
        case 1: "1ª inversão"
        case 2: "2ª inversão"
        default: "posição fundamental"
        }
    }
}

public enum ChordRecognizer {
    /// Identifica um acorde maior ou menor nas notas tocadas (oitavas dobradas são aceitas).
    public static func recognize(_ midiNotes: Set<Int>) -> RecognizedChord? {
        guard let bass = midiNotes.min() else { return nil }
        let played = Set(midiNotes.map(PitchClass.init))
        for root in played.sorted() {
            for quality in ChordQuality.allCases {
                let chord = Chord(root: root, quality: quality, accidental: preferredAccidental(root: root, quality: quality))
                guard chord.pitchClasses == played else { continue }
                let inversion = chord.orderedPitchClasses.firstIndex(of: PitchClass(bass)) ?? 0
                return RecognizedChord(chord: chord, inversion: inversion)
            }
        }
        return nil
    }

    /// Grafia mais comum de cada acorde (ex.: Eb maior, mas C# menor).
    static func preferredAccidental(root: PitchClass, quality: ChordQuality) -> PitchClass.Accidental {
        let flatRoots: Set<Int> = quality == .major ? [1, 3, 8, 10] : [3, 10]
        return flatRoots.contains(root.value) ? .flat : .sharp
    }
}
