public enum ChordQuality: CaseIterable, Sendable {
    case major, minor

    var intervals: [Int] {
        switch self {
        case .major: [0, 4, 7]
        case .minor: [0, 3, 7]
        }
    }

    var displayName: String {
        switch self {
        case .major: "maior"
        case .minor: "menor"
        }
    }
}

public struct Chord: Hashable, Sendable {
    public let root: PitchClass
    public let quality: ChordQuality
    public let accidental: PitchClass.Accidental

    public init(root: PitchClass, quality: ChordQuality, accidental: PitchClass.Accidental = .sharp) {
        self.root = root
        self.quality = quality
        self.accidental = accidental
    }

    public var pitchClasses: Set<PitchClass> {
        Set(quality.intervals.map { root.transposed(by: $0) })
    }

    /// Ex.: "Db maior", "F# menor".
    public var displayName: String {
        "\(root.name(preferring: accidental)) \(quality.displayName)"
    }

    /// Notas do acorde em ordem de empilhamento (fundamental, terça, quinta).
    public var orderedPitchClasses: [PitchClass] {
        quality.intervals.map { root.transposed(by: $0) }
    }
}
