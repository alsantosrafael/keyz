/// Uma das 12 classes de nota (0 = Dó ... 11 = Si), independente de oitava.
public struct PitchClass: Hashable, Comparable, Sendable {
    public let value: Int

    public init(_ value: Int) {
        self.value = ((value % 12) + 12) % 12
    }

    public init(midiNote: UInt8) {
        self.init(Int(midiNote))
    }

    public static func < (lhs: PitchClass, rhs: PitchClass) -> Bool {
        lhs.value < rhs.value
    }

    public func transposed(by semitones: Int) -> PitchClass {
        PitchClass(value + semitones)
    }

    public func name(preferring accidental: Accidental) -> String {
        switch accidental {
        case .sharp: Self.sharpNames[value]
        case .flat: Self.flatNames[value]
        }
    }

    /// Nome em solfejo, ex.: "Ré♭", "Fá♯".
    public func solfegeName(preferring accidental: Accidental) -> String {
        let spelled = spelling(preferring: accidental)
        let base = Self.solfege[spelled.letter]
        switch spelled.accidental {
        case .sharp?: return base + "♯"
        case .flat?: return base + "♭"
        case nil: return base
        }
    }

    /// Letra (0 = C ... 6 = B) e alteração usadas para escrever a nota na partitura.
    public func spelling(preferring accidental: Accidental) -> (letter: Int, accidental: Accidental?) {
        switch accidental {
        case .sharp: (Self.sharpLetters[value], isBlackKey ? .sharp : nil)
        case .flat: (Self.flatLetters[value], isBlackKey ? .flat : nil)
        }
    }

    public var isBlackKey: Bool {
        [1, 3, 6, 8, 10].contains(value)
    }

    public enum Accidental: Sendable {
        case sharp, flat
    }

    private static let sharpNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    private static let flatNames = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
    private static let sharpLetters = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
    private static let flatLetters = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6]
    private static let solfege = ["Dó", "Ré", "Mi", "Fá", "Sol", "Lá", "Si"]
}
