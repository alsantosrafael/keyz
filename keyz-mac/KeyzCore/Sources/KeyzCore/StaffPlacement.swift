public enum Clef: Sendable {
    case treble, bass
}

/// Onde desenhar uma nota na pauta.
public struct StaffPlacement: Equatable, Sendable {
    public let clef: Clef
    /// Passos diatônicos acima da linha de baixo da pauta: 0 = 1ª linha, 1 = 1º espaço, 2 = 2ª linha ... 8 = 5ª linha.
    /// Negativo = abaixo da pauta; acima de 8 = acima da pauta.
    public let step: Int
    public let accidental: PitchClass.Accidental?
    /// Quantidade de linhas suplementares a desenhar (abaixo se `step < 0`, acima se `step > 8`).
    public let ledgerLines: Int

    /// Dó central (C4) e acima vão na clave de sol; abaixo, na clave de fá.
    public init(note: Note, accidental preferred: PitchClass.Accidental = .sharp) {
        let spelled = note.pitchClass.spelling(preferring: preferred)
        let diatonic = note.octave * 7 + spelled.letter
        let clef: Clef = note.midi >= 60 ? .treble : .bass
        // Linha de baixo: E4 na clave de sol, G2 na clave de fá.
        let bottomLine = clef == .treble ? 4 * 7 + 2 : 2 * 7 + 4
        let step = diatonic - bottomLine

        self.clef = clef
        self.step = step
        self.accidental = spelled.accidental
        self.ledgerLines = step < 0 ? -step / 2 : (step > 8 ? (step - 8) / 2 : 0)
    }
}

/// Teclas de um teclado simples, para desenhar e destacar notas.
public struct KeyboardKey: Equatable, Sendable {
    public let note: Note
    public var isBlack: Bool { note.isBlackKey }
    /// Para teclas brancas: posição entre as brancas (0, 1, 2...). Para pretas: posição da branca à esquerda.
    public let whiteIndex: Int
}

public enum KeyboardLayout {
    /// Teclas de `lowest` a `highest`, inclusive.
    public static func keys(from lowest: Note, to highest: Note) -> [KeyboardKey] {
        guard lowest <= highest else { return [] }
        var whiteCount = 0
        var keys: [KeyboardKey] = []
        for midi in lowest.midi...highest.midi {
            let note = Note(midi: midi)
            if note.isBlackKey {
                keys.append(KeyboardKey(note: note, whiteIndex: max(0, whiteCount - 1)))
            } else {
                keys.append(KeyboardKey(note: note, whiteIndex: whiteCount))
                whiteCount += 1
            }
        }
        return keys
    }
}
