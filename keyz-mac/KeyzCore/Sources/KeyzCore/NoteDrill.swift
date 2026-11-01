public struct DrillResult: Equatable, Sendable {
    public enum Outcome: Equatable, Sendable {
        case correct
        case wrong(played: Note)
        case timeout
    }

    public let target: Note
    public let outcome: Outcome
    /// Segundos entre o aparecimento da nota e a resposta; `nil` se o tempo acabou.
    public let responseTime: Double?

    public var isCorrect: Bool { outcome == .correct }
}

public struct DrillStats: Equatable, Sendable {
    public private(set) var attempts = 0
    public private(set) var correct = 0
    public private(set) var wrong = 0
    public private(set) var timeouts = 0
    public private(set) var streak = 0
    public private(set) var bestStreak = 0
    private var totalResponseTime = 0.0

    public var accuracy: Double { attempts == 0 ? 0 : Double(correct) / Double(attempts) }
    public var averageResponseTime: Double? { correct == 0 ? nil : totalResponseTime / Double(correct) }

    mutating func record(_ result: DrillResult) {
        attempts += 1
        switch result.outcome {
        case .correct:
            correct += 1
            streak += 1
            bestStreak = max(bestStreak, streak)
            totalResponseTime += result.responseTime ?? 0
        case .wrong:
            wrong += 1
            streak = 0
        case .timeout:
            timeouts += 1
            streak = 0
        }
    }
}

/// Máquina de estados do treino "tocar a nota sorteada dentro do tempo".
/// Não usa relógio próprio: quem usa informa o tempo atual (segundos) em cada chamada.
public struct NoteDrill<Source: RandomNumberGenerator & Sendable>: Sendable {
    public enum Phase: Equatable, Sendable {
        case idle
        case awaiting(target: Note, deadline: Double)
        /// `nextAt` é `nil` quando o avanço é manual.
        case showingResult(DrillResult, nextAt: Double?)
        case finished
    }

    public private(set) var config: DrillConfig
    public private(set) var phase: Phase = .idle
    public private(set) var stats = DrillStats()

    private var source: Source
    private var roundStart = 0.0
    private var lastTarget: Note?

    public init(config: DrillConfig, source: Source) {
        self.config = config
        self.source = source
    }

    public mutating func start(at now: Double) {
        stats = DrillStats()
        lastTarget = nil
        beginRound(at: now)
    }

    /// Chame quando uma nota for tocada (MIDI ou microfone).
    public mutating func noteOn(_ midi: Int, at now: Double) {
        tick(at: now)
        guard case let .awaiting(target, _) = phase else { return }
        let played = Note(midi: midi)
        let hit = config.matchOctave ? played == target : played.pitchClass == target.pitchClass
        finishRound(DrillResult(
            target: target,
            outcome: hit ? .correct : .wrong(played: played),
            responseTime: now - roundStart
        ), at: now)
    }

    /// Chame periodicamente: encerra por tempo e avança automaticamente.
    public mutating func tick(at now: Double) {
        switch phase {
        case let .awaiting(target, deadline) where now >= deadline:
            finishRound(DrillResult(target: target, outcome: .timeout, responseTime: nil), at: deadline)
        case let .showingResult(_, nextAt?) where now >= nextAt:
            beginRound(at: now)
        default:
            break
        }
    }

    /// Avanço manual (botão "próxima").
    public mutating func advance(at now: Double) {
        if case .showingResult = phase { beginRound(at: now) }
    }

    public mutating func stop() {
        phase = .idle
    }

    private mutating func beginRound(at now: Double) {
        if let rounds = config.rounds, stats.attempts >= rounds {
            phase = .finished
            return
        }
        let pool = config.notePool
        let candidates = pool.count > 1 ? pool.filter { $0 != lastTarget } : pool
        guard let target = candidates.randomElement(using: &source) else {
            phase = .finished
            return
        }
        lastTarget = target
        roundStart = now
        phase = .awaiting(target: target, deadline: now + config.timePerNote)
    }

    private mutating func finishRound(_ result: DrillResult, at now: Double) {
        stats.record(result)
        phase = .showingResult(result, nextAt: config.autoAdvance ? now + config.pauseBetweenNotes : nil)
    }
}

extension NoteDrill where Source == SystemRandomNumberGenerator {
    public init(config: DrillConfig) {
        self.init(config: config, source: SystemRandomNumberGenerator())
    }
}
