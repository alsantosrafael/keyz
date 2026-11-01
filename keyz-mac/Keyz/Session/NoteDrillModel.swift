import Foundation
import KeyzCore
import Observation

/// Liga a máquina de estados `NoteDrill` ao relógio e às notas tocadas.
@MainActor @Observable
final class NoteDrillModel {
    var config = DrillConfig.preset(.easy)
    private(set) var drill = NoteDrill(config: .preset(.easy))
    private(set) var now = 0.0

    @ObservationIgnored private var clock: Task<Void, Never>?

    var isRunning: Bool {
        switch drill.phase {
        case .awaiting, .showingResult: true
        case .idle, .finished: false
        }
    }

    /// Fração do tempo restante para a nota atual (1 = cheio, 0 = acabou).
    var remainingFraction: Double {
        guard case let .awaiting(_, deadline) = drill.phase else { return 0 }
        return max(0, min(1, (deadline - now) / drill.config.timePerNote))
    }

    var remainingSeconds: Double {
        guard case let .awaiting(_, deadline) = drill.phase else { return 0 }
        return max(0, deadline - now)
    }

    /// Aplica a configuração inicial da dificuldade.
    func selectDifficulty(_ difficulty: Difficulty) {
        config = .preset(difficulty)
    }

    func start() {
        drill = NoteDrill(config: config)
        now = Self.uptime
        drill.start(at: now)
        runClock()
    }

    func stop() {
        clock?.cancel()
        drill.stop()
    }

    func noteOn(_ midi: Int) {
        drill.noteOn(midi, at: Self.uptime)
    }

    func next() {
        drill.advance(at: Self.uptime)
    }

    private func runClock() {
        clock?.cancel()
        clock = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(50))
                guard let self else { return }
                now = Self.uptime
                drill.tick(at: now)
                if drill.phase == .finished { return }
            }
        }
    }

    private static var uptime: Double { ProcessInfo.processInfo.systemUptime }
}
