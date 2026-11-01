public enum Difficulty: CaseIterable, Sendable {
    case easy, medium, advanced

    public var displayName: String {
        switch self {
        case .easy: "Fácil"
        case .medium: "Médio"
        case .advanced: "Avançado"
        }
    }
}

/// Como a nota sorteada aparece para o usuário.
public enum PromptStyle: CaseIterable, Sendable {
    case name, nameAndStaff, staff

    public var displayName: String {
        switch self {
        case .name: "Nome"
        case .nameAndStaff: "Nome e partitura"
        case .staff: "Só partitura"
        }
    }
}

public struct DrillConfig: Equatable, Sendable {
    public var difficulty: Difficulty
    public var promptStyle: PromptStyle
    public var lowest: Note
    public var highest: Note
    /// Inclui notas pretas (sustenidos/bemóis).
    public var includeAccidentals: Bool
    /// Como escrever as notas pretas.
    public var accidental: PitchClass.Accidental
    /// Tempo para tocar a nota, em segundos.
    public var timePerNote: Double
    /// Avança sozinho para a próxima nota depois do resultado.
    public var autoAdvance: Bool
    /// Tempo, em segundos, que o resultado fica na tela antes da próxima nota (com `autoAdvance`).
    public var pauseBetweenNotes: Double
    /// Exige a oitava certa; senão, só a nota (qualquer oitava).
    public var matchOctave: Bool
    /// Quantidade de notas da sessão; `nil` = sem fim.
    public var rounds: Int?

    public init(
        difficulty: Difficulty,
        lowest: Note,
        highest: Note,
        includeAccidentals: Bool,
        accidental: PitchClass.Accidental = .sharp,
        timePerNote: Double,
        autoAdvance: Bool = true,
        pauseBetweenNotes: Double,
        matchOctave: Bool = true,
        rounds: Int? = 20,
        promptStyle: PromptStyle = .nameAndStaff
    ) {
        self.difficulty = difficulty
        self.promptStyle = promptStyle
        self.lowest = lowest
        self.highest = highest
        self.includeAccidentals = includeAccidentals
        self.accidental = accidental
        self.timePerNote = timePerNote
        self.autoAdvance = autoAdvance
        self.pauseBetweenNotes = pauseBetweenNotes
        self.matchOctave = matchOctave
        self.rounds = rounds
    }

    /// Configuração inicial para cada dificuldade; tudo pode ser ajustado depois.
    public static func preset(_ difficulty: Difficulty) -> DrillConfig {
        switch difficulty {
        case .easy:
            // Uma oitava, só teclas brancas, bastante tempo.
            DrillConfig(difficulty: .easy, lowest: Note(midi: 60), highest: Note(midi: 71),
                        includeAccidentals: false, timePerNote: 10, pauseBetweenNotes: 1.5,
                        promptStyle: .name)
        case .medium:
            // Duas oitavas com sustenidos/bemóis.
            DrillConfig(difficulty: .medium, lowest: Note(midi: 60), highest: Note(midi: 83),
                        includeAccidentals: true, timePerNote: 6, pauseBetweenNotes: 1.2,
                        promptStyle: .nameAndStaff)
        case .advanced:
            // Três oitavas, clave de sol e de fá, pouco tempo, leitura só pela partitura.
            DrillConfig(difficulty: .advanced, lowest: Note(midi: 48), highest: Note(midi: 84),
                        includeAccidentals: true, timePerNote: 3, pauseBetweenNotes: 1.0,
                        promptStyle: .staff)
        }
    }

    /// Notas que podem ser sorteadas.
    public var notePool: [Note] {
        guard lowest <= highest else { return [] }
        return (lowest.midi...highest.midi)
            .map(Note.init(midi:))
            .filter { includeAccidentals || !$0.isBlackKey }
    }
}
