import Accelerate
import Foundation

public struct PitchReading: Equatable, Sendable {
    public let frequency: Double
    /// 0...1; quanto maior, mais periódico (limpo) o sinal.
    public let confidence: Double

    public var note: (note: Note, cents: Double)? {
        Note.nearest(toFrequency: frequency)
    }
}

/// Detector de altura monofônico (algoritmo YIN) para amostras de áudio.
/// Serve para uma nota por vez; acordes exigem outra técnica.
public struct PitchDetector: Sendable {
    public var sampleRate: Double
    public var minFrequency: Double
    public var maxFrequency: Double
    /// Limiar do YIN: menor = mais rígido.
    public var threshold: Double
    /// Abaixo deste RMS o sinal é tratado como silêncio.
    public var silenceRMS: Float

    public init(
        sampleRate: Double,
        minFrequency: Double = 27.5,
        maxFrequency: Double = 4200,
        threshold: Double = 0.15,
        silenceRMS: Float = 0.002
    ) {
        self.sampleRate = sampleRate
        self.minFrequency = minFrequency
        self.maxFrequency = maxFrequency
        self.threshold = threshold
        self.silenceRMS = silenceRMS
    }

    /// Menor quantidade de amostras para enxergar `minFrequency`: dois períodos.
    public var recommendedBufferSize: Int {
        Int((2 * sampleRate / minFrequency).rounded(.up))
    }

    public func detect(samples: [Float]) -> PitchReading? {
        let window = samples.count / 2
        let tauMin = max(2, Int(sampleRate / maxFrequency))
        let tauMax = min(window - 1, Int(sampleRate / minFrequency))
        guard tauMax > tauMin else { return nil }

        let energy = samples.reduce(Float(0)) { $0 + $1 * $1 }
        guard (energy / Float(samples.count)).squareRoot() >= silenceRMS else { return nil }

        // Função de diferença e média cumulativa normalizada.
        // d(tau) = Σx[j]² + Σx[j+tau]² - 2·Σx[j]·x[j+tau]; o produto escalar via vDSP é rápido mesmo sem otimização.
        var normalized = [Double](repeating: 1, count: tauMax + 1)
        samples.withUnsafeBufferPointer { x in
            guard let base = x.baseAddress else { return }
            var fixedEnergy: Float = 0
            vDSP_svesq(base, 1, &fixedEnergy, vDSP_Length(window))
            var shiftedEnergy = Double(fixedEnergy)
            var runningSum = 0.0
            for tau in 1...tauMax {
                let leaving = Double(x[tau - 1]), entering = Double(x[tau + window - 1])
                shiftedEnergy += entering * entering - leaving * leaving
                var cross: Float = 0
                vDSP_dotpr(base, 1, base + tau, 1, &cross, vDSP_Length(window))
                let difference = max(0, Double(fixedEnergy) + shiftedEnergy - 2 * Double(cross))
                runningSum += difference
                normalized[tau] = runningSum > 0 ? difference * Double(tau) / runningSum : 1
            }
        }

        // Primeiro vale abaixo do limiar; se não houver, usa o mínimo global.
        var chosen: Int?
        var tau = tauMin
        while tau <= tauMax {
            if normalized[tau] < threshold {
                while tau + 1 <= tauMax, normalized[tau + 1] < normalized[tau] { tau += 1 }
                chosen = tau
                break
            }
            tau += 1
        }
        if chosen == nil, let best = (tauMin...tauMax).min(by: { normalized[$0] < normalized[$1] }),
           normalized[best] < 0.35 {
            // O mínimo global costuma cair num múltiplo do período (uma oitava abaixo):
            // usa o primeiro vale quase tão fundo quanto ele.
            let limit = normalized[best] + 0.1
            chosen = (tauMin...best).first { tau in
                guard normalized[tau] <= limit else { return false }
                let before = normalized[tau - 1]
                let after = tau < tauMax ? normalized[tau + 1] : .infinity
                return normalized[tau] <= before && normalized[tau] <= after
            } ?? best
        }
        guard let period = chosen else { return nil }

        // Interpolação parabólica para precisão sub-amostra.
        var refined = Double(period)
        if period > 1, period < tauMax {
            let a = normalized[period - 1], b = normalized[period], c = normalized[period + 1]
            let denominator = a - 2 * b + c
            if denominator != 0 { refined += (a - c) / (2 * denominator) }
        }
        guard refined > 0 else { return nil }
        return PitchReading(
            frequency: sampleRate / refined,
            confidence: max(0, min(1, 1 - normalized[period]))
        )
    }
}
