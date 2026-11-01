import Foundation

/// Uma nota específica (com oitava), identificada pelo número MIDI. Dó central = 60 (C4).
public struct Note: Hashable, Comparable, Sendable {
    public let midi: Int

    public init(midi: Int) {
        self.midi = midi
    }

    public static func < (lhs: Note, rhs: Note) -> Bool {
        lhs.midi < rhs.midi
    }

    public var pitchClass: PitchClass { PitchClass(midi) }

    /// Oitava científica: C4 = Dó central.
    public var octave: Int { midi / 12 - 1 }

    public var isBlackKey: Bool { pitchClass.isBlackKey }

    /// Frequência em Hz, afinação A4 = 440 Hz.
    public var frequency: Double {
        440 * pow(2, Double(midi - 69) / 12)
    }

    /// Ex.: "C#4", "Bb3".
    public func name(preferring accidental: PitchClass.Accidental = .sharp) -> String {
        "\(pitchClass.name(preferring: accidental))\(octave)"
    }

    /// Ex.: "Fá♯4".
    public func solfegeName(preferring accidental: PitchClass.Accidental = .sharp) -> String {
        "\(pitchClass.solfegeName(preferring: accidental))\(octave)"
    }

    /// Nota mais próxima de uma frequência, com o desvio em cents (-50...50).
    public static func nearest(toFrequency frequency: Double) -> (note: Note, cents: Double)? {
        guard frequency > 0, frequency.isFinite else { return nil }
        let exact = 69 + 12 * log2(frequency / 440)
        let rounded = exact.rounded()
        return (Note(midi: Int(rounded)), (exact - rounded) * 100)
    }
}
