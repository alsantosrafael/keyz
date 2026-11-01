/// Notas tocadas desde que a mão encostou nas teclas. Acumula em vez de usar só o instante atual:
/// no piano (e no microfone) a quinta ou a fundamental somem enquanto o som decai, e um acorde
/// que ainda está soando pode aparecer incompleto no meio da pegada.
public struct HeldNotes: Equatable, Sendable {
    /// Acumulado desde a última vez que a mão saiu das teclas.
    public private(set) var notes: Set<Int> = []
    /// Classes descartadas nesta pegada (notas erradas já julgadas): não voltam a contar até soltar a mão.
    private var discarded: Set<PitchClass> = []

    public init() {}

    /// Passe as notas pressionadas agora. Retorna o acumulado.
    /// Quando nada está pressionado, a pegada termina e o acumulado zera.
    public mutating func update(pressed: Set<Int>) -> Set<Int> {
        if pressed.isEmpty {
            notes = []
            discarded = []
        } else {
            notes.formUnion(pressed.filter { !discarded.contains(PitchClass($0)) })
        }
        return notes
    }

    /// Descarta classes julgadas erradas. Sem isso, uma nota a mais da tentativa anterior continuaria
    /// no acumulado mesmo depois de corrigida, e a nova tentativa nunca fecharia.
    public mutating func discard(_ pitchClasses: Set<PitchClass>) {
        discarded.formUnion(pitchClasses)
        notes = notes.filter { !pitchClasses.contains(PitchClass($0)) }
    }
}
