import Foundation
import KeyzCore
import Observation

/// Treino de acordes: sorteia um acorde e avalia as notas mantidas pressionadas.
@MainActor @Observable
final class ChordPracticeModel {
    var includeMajor = true { didSet { rebuildGenerator() } }
    var includeMinor = true { didSet { rebuildGenerator() } }
    var autoAdvance = true

    private(set) var chord: Chord?
    private(set) var evaluation: ChordEvaluation?
    private(set) var playedNotes: Set<Int> = []
    private(set) var attempts = 0
    private(set) var correct = 0
    private(set) var streak = 0
    var showAnswer = false

    @ObservationIgnored private var generator = ChordGenerator()
    @ObservationIgnored private var pending: Task<Void, Never>?
    @ObservationIgnored private var judgedCurrentChord = false
    @ObservationIgnored private var held = HeldNotes()
    @ObservationIgnored private var lastPressed: Set<Int> = []
    /// Depois de trocar de acorde com a mão ainda nas teclas, ignora as notas até soltar:
    /// senão as notas do acorde anterior entrariam na contagem do próximo.
    @ObservationIgnored private var awaitingRelease = false

    init() {
        nextChord()
    }

    func nextChord() {
        pending?.cancel()
        chord = generator.next()
        evaluation = nil
        showAnswer = false
        judgedCurrentChord = false
        awaitingRelease = !lastPressed.isEmpty
        held = HeldNotes()
    }

    /// Chame sempre que mudarem as notas pressionadas. Avalia o acumulado da pegada (não só o instante),
    /// depois que a mão fica parada; se soltar antes, avalia na hora.
    func notesChanged(_ pressed: Set<Int>) {
        lastPressed = pressed
        if awaitingRelease {
            if pressed.isEmpty { awaitingRelease = false }
            return
        }
        pending?.cancel()
        let before = held.notes
        let notes = held.update(pressed: pressed)
        if !notes.isEmpty { playedNotes = notes }
        guard let chord else { return }
        if notes.isEmpty {
            // Soltou a mão: julga o que foi tocado nesta pegada, se o acorde ainda não foi julgado.
            if !judgedCurrentChord, before.count >= chord.pitchClasses.count { evaluate(before) }
            return
        }
        let delay: Duration = notes.count >= chord.pitchClasses.count ? .milliseconds(350) : .seconds(1)
        pending = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            self?.evaluate(notes)
        }
    }

    private func evaluate(_ notes: Set<Int>) {
        guard let chord else { return }
        pending?.cancel()
        playedNotes = notes
        let result = ChordEvaluator.evaluate(played: Set(notes.map { UInt8(clamping: $0) }), against: chord)
        evaluation = result
        // Nota errada não atrapalha a próxima tentativa: sai do acumulado desta pegada.
        held.discard(result.extra)
        // Conta só a primeira tentativa de cada acorde no placar.
        if !judgedCurrentChord {
            judgedCurrentChord = true
            attempts += 1
            if result.isCorrect { correct += 1; streak += 1 } else { streak = 0 }
        }
        if result.isCorrect, autoAdvance {
            pending = Task { [weak self] in
                try? await Task.sleep(for: .seconds(1.2))
                guard !Task.isCancelled else { return }
                self?.nextChord()
            }
        }
    }

    private func rebuildGenerator() {
        var qualities: [ChordQuality] = []
        if includeMajor { qualities.append(.major) }
        if includeMinor { qualities.append(.minor) }
        generator = ChordGenerator(qualities: qualities.isEmpty ? ChordQuality.allCases : qualities)
        nextChord()
    }
}
