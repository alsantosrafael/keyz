public struct ChordGenerator<Source: RandomNumberGenerator>: Sendable where Source: Sendable {
    public var qualities: [ChordQuality]
    private var source: Source
    private var last: Chord?

    public init(qualities: [ChordQuality] = ChordQuality.allCases, source: Source) {
        self.qualities = qualities
        self.source = source
    }

    /// Todos os acordes possíveis: 12 raízes, com grafia em sustenido ou bemol nas notas pretas.
    public var pool: [Chord] {
        var chords: [Chord] = []
        for value in 0..<12 {
            let root = PitchClass(value)
            let isBlackKey = [1, 3, 6, 8, 10].contains(value)
            let accidentals: [PitchClass.Accidental] = isBlackKey ? [.sharp, .flat] : [.sharp]
            for quality in qualities {
                for accidental in accidentals {
                    chords.append(Chord(root: root, quality: quality, accidental: accidental))
                }
            }
        }
        return chords
    }

    /// Sorteia um acorde, evitando repetir o anterior.
    public mutating func next() -> Chord? {
        let candidates = pool.filter { $0 != last }
        guard let chord = candidates.randomElement(using: &source) else { return nil }
        last = chord
        return chord
    }
}

extension ChordGenerator where Source == SystemRandomNumberGenerator {
    public init(qualities: [ChordQuality] = ChordQuality.allCases) {
        self.init(qualities: qualities, source: SystemRandomNumberGenerator())
    }
}
