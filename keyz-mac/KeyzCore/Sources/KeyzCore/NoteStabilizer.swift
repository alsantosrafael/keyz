public struct DetectedNote: Equatable, Sendable {
    public let note: Note
    /// Desvio da afinação em cents (-50...50): negativo = abaixo, positivo = acima.
    public let cents: Double
    public let frequency: Double
}

/// Transforma leituras instáveis de altura (uma por quadro de áudio) em notas confiáveis.
/// Uma nota só é reportada depois de aparecer em `requiredFrames` quadros seguidos.
public struct NoteStabilizer: Sendable {
    public var requiredFrames: Int
    public var minConfidence: Double

    private var candidate: Note?
    private var count = 0

    public init(requiredFrames: Int = 3, minConfidence: Double = 0.75) {
        self.requiredFrames = requiredFrames
        self.minConfidence = minConfidence
    }

    /// Passe `nil` quando não houver som. Retorna a nota estável ou `nil`.
    public mutating func feed(_ reading: PitchReading?) -> DetectedNote? {
        guard let reading, reading.confidence >= minConfidence, let nearest = reading.note else {
            candidate = nil
            count = 0
            return nil
        }
        if nearest.note == candidate {
            count += 1
        } else {
            candidate = nearest.note
            count = 1
        }
        guard count >= requiredFrames else { return nil }
        return DetectedNote(note: nearest.note, cents: nearest.cents, frequency: reading.frequency)
    }

    public mutating func reset() {
        candidate = nil
        count = 0
    }
}
