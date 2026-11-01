import Accelerate
import Foundation

public struct ChromaReading: Equatable, Sendable {
    /// Energia de cada classe de nota (índice 0 = Dó), normalizada para o máximo = 1.
    public let chroma: [Double]
    /// Classes de nota fortes o bastante para contar como tocadas.
    public let pitchClasses: Set<PitchClass>
    /// Energia bruta de cada classe, antes de normalizar (usada para ver se a nota está subindo ou caindo).
    public var energy: [Double] = []
}

/// Detecta várias notas simultâneas (acordes) pelo espectro do áudio.
///
/// Acha os picos da FFT, converte cada um em nota e descarta os que são harmônicos de uma nota
/// mais grave (o 3º harmônico do Dó soa como Sol, o 5º como Mi). A oitava se perde:
/// o resultado é o conjunto de classes de nota, o que basta para avaliar acordes.
public final class ChromaAnalyzer: @unchecked Sendable {
    public let sampleRate: Double
    public let size: Int
    public var minFrequency: Double
    public var maxFrequency: Double
    /// Fração do pico mais forte abaixo da qual um pico é ignorado.
    public var peakThreshold: Float
    /// Fração da classe mais forte a partir da qual uma classe de nota conta como tocada.
    public var noteThreshold: Double
    public var silenceRMS: Float
    /// Quantas vezes um pico precisa estar acima do ruído de fundo da sua faixa para contar.
    public var snr: Float

    static let maxNotes = 5

    private let log2n: vDSP_Length
    private let setup: FFTSetup
    private let window: [Float]
    /// Ruído de fundo por faixa de frequência, aprendido dos quadros em que um pico não se destaca.
    /// Só é tocado na fila de análise, então não precisa de sincronização.
    private var noiseFloor: [Float]

    /// `size` precisa ser potência de 2; 8192 a 48 kHz dá resolução de ~6 Hz (170 ms de áudio).
    public init(
        sampleRate: Double,
        size: Int = 8192,
        minFrequency: Double = 60,
        maxFrequency: Double = 2500,
        peakThreshold: Float = 0.05,
        noteThreshold: Double = 0.3,
        silenceRMS: Float = 0.005,
        snr: Float = 5
    ) {
        precondition(size > 0 && size & (size - 1) == 0, "size precisa ser potência de 2")
        self.sampleRate = sampleRate
        self.size = size
        self.minFrequency = minFrequency
        self.maxFrequency = maxFrequency
        self.peakThreshold = peakThreshold
        self.noteThreshold = noteThreshold
        self.silenceRMS = silenceRMS
        self.snr = snr
        noiseFloor = [Float](repeating: 0, count: size / 2)
        log2n = vDSP_Length(log2(Double(size)))
        setup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2))!
        window = vDSP.window(ofType: Float.self, usingSequence: .hanningDenormalized, count: size, isHalfWindow: false)
    }

    deinit {
        vDSP_destroy_fftsetup(setup)
    }

    /// Analisa as últimas `size` amostras (amostras a mais no início são ignoradas).
    public func analyze(samples: [Float]) -> ChromaReading? {
        guard samples.count >= size else { return nil }
        let frame = Array(samples.suffix(size))
        // O piso aprende também nos quadros silenciosos: é o que faz o ruído da sala virar referência.
        let magnitudes = spectrum(of: frame)
        updateNoiseFloor(magnitudes)
        guard vDSP.rootMeanSquare(frame) >= silenceRMS else { return nil }

        let peaks = findPeaks(in: magnitudes)
        guard !peaks.isEmpty else { return nil }

        var chroma = [Double](repeating: 0, count: 12)
        for (index, peak) in peaks.enumerated() {
            var weight = Double(peak.magnitude)
            // Harmônico de uma nota mais grave com outra classe de nota? Provavelmente não foi tocado.
            // Vale mesmo se o harmônico for mais forte: no piano, o 2º e o 3º harmônicos muitas vezes
            // superam a fundamental, e a quinta (3º harmônico) viraria uma nota fantasma.
            for lower in peaks[..<index] where lower.pitchClass != peak.pitchClass {
                let ratio = peak.frequency / lower.frequency
                let harmonic = ratio.rounded()
                if harmonic >= 2, harmonic <= 8, abs(ratio - harmonic) / harmonic < 0.025 {
                    weight *= 0.1
                    break
                }
            }
            chroma[peak.pitchClass.value] += weight
        }

        guard let strongest = chroma.max(), strongest > 0 else { return nil }
        let raw = chroma
        chroma = chroma.map { $0 / strongest }
        let notes = (0..<12).filter { chroma[$0] >= noteThreshold }.map(PitchClass.init)
        // Energia espalhada por muitas classes de nota é ruído, não música.
        guard notes.count <= Self.maxNotes else { return nil }
        return ChromaReading(chroma: chroma, pitchClasses: Set(notes), energy: raw)
    }

    private struct Peak {
        let frequency: Double
        let magnitude: Float
        let pitchClass: PitchClass
    }

    private func spectrum(of frame: [Float]) -> [Float] {
        let windowed = vDSP.multiply(frame, window)
        let half = size / 2
        var real = [Float](repeating: 0, count: half)
        var imaginary = [Float](repeating: 0, count: half)
        var magnitudes = [Float](repeating: 0, count: half)
        real.withUnsafeMutableBufferPointer { realPointer in
            imaginary.withUnsafeMutableBufferPointer { imaginaryPointer in
                var split = DSPSplitComplex(realp: realPointer.baseAddress!, imagp: imaginaryPointer.baseAddress!)
                windowed.withUnsafeBufferPointer { input in
                    input.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: half) {
                        vDSP_ctoz($0, 2, &split, 1, vDSP_Length(half))
                    }
                }
                vDSP_fft_zrip(setup, &split, 1, log2n, FFTDirection(FFT_FORWARD))
                vDSP_zvabs(&split, 1, &magnitudes, 1, vDSP_Length(half))
            }
        }
        magnitudes[0] = 0 // bin 0 guarda DC e Nyquist juntos
        return magnitudes
    }

    /// Esquece o ruído aprendido; o piso volta a ser aprendido a partir dos próximos quadros.
    public func resetNoiseFloor() {
        noiseFloor = [Float](repeating: 0, count: noiseFloor.count)
    }

    /// Média lenta por faixa, atualizada só onde o espectro está perto do piso: uma nota tocada não
    /// infla o piso. Sobe devagar para um ruído novo (porta, ventilador) não virar nota para sempre.
    private func updateNoiseFloor(_ magnitudes: [Float]) {
        for bin in magnitudes.indices {
            if noiseFloor[bin] == 0 || magnitudes[bin] < noiseFloor[bin] * snr {
                noiseFloor[bin] = noiseFloor[bin] * 0.95 + magnitudes[bin] * 0.05
            } else {
                noiseFloor[bin] *= 1.002
            }
        }
    }

    private func findPeaks(in magnitudes: [Float]) -> [Peak] {
        let binWidth = sampleRate / Double(size)
        let low = max(2, Int(minFrequency / binWidth))
        let high = min(magnitudes.count - 3, Int(maxFrequency / binWidth))
        guard high > low else { return [] }
        let strongest = magnitudes[low...high].max() ?? 0
        guard strongest > 0 else { return [] }
        let floor = strongest * peakThreshold

        var peaks: [Peak] = []
        for bin in low...high {
            let value = magnitudes[bin]
            guard value >= floor, value >= noiseFloor[bin] * snr,
                  value > magnitudes[bin - 1], value >= magnitudes[bin + 1],
                  value > magnitudes[bin - 2], value >= magnitudes[bin + 2] else { continue }
            // Interpolação parabólica (em log) para a frequência exata do pico.
            let a = log(Double(max(magnitudes[bin - 1], 1e-12)))
            let b = log(Double(value))
            let c = log(Double(max(magnitudes[bin + 1], 1e-12)))
            let denominator = a - 2 * b + c
            let offset = denominator == 0 ? 0 : 0.5 * (a - c) / denominator
            let frequency = (Double(bin) + offset) * binWidth
            guard let nearest = Note.nearest(toFrequency: frequency), abs(nearest.cents) <= 40 else { continue }
            peaks.append(Peak(frequency: frequency, magnitude: value, pitchClass: nearest.note.pitchClass))
        }
        return peaks
    }
}

/// Confirma um conjunto de notas quando ele domina uma janela curta de quadros.
/// Uma nota fantasma em um quadro não zera a confirmação, como acontecia antes.
public struct PitchClassSetStabilizer: Sendable {
    /// Quadros da janela em que o conjunto precisa aparecer.
    public var requiredFrames: Int
    public var windowFrames: Int
    private var recent: [Set<PitchClass>?] = []

    public init(requiredFrames: Int = 3, windowFrames: Int = 8) {
        self.requiredFrames = requiredFrames
        self.windowFrames = windowFrames
    }

    public mutating func feed(_ reading: ChromaReading?) -> Set<PitchClass>? {
        let notes = reading.map(\.pitchClasses).flatMap { $0.isEmpty ? nil : $0 }
        recent.append(notes)
        if recent.count > windowFrames { recent.removeFirst(recent.count - windowFrames) }
        var votes: [Set<PitchClass>: Int] = [:]
        for case let set? in recent { votes[set, default: 0] += 1 }
        guard let best = votes.max(by: { $0.value < $1.value }), best.value >= requiredFrames else { return nil }
        return best.key
    }

    public mutating func reset() {
        recent.removeAll()
    }
}

/// Separa a nota nova da nota que ainda soa. Quando a nota muda, a janela de análise ainda contém
/// o som da anterior por ~170 ms; sem este filtro ela entra no acorde e os erros se acumulam.
/// No ataque, as classes que já soavam viram "resíduo", a menos que a energia delas suba de novo
/// (o mesmo som batido outra vez).
public struct RingFilter: Sendable {
    /// Quanto a energia precisa subir em um quadro para contar como nota nova (o resíduo só cai).
    public var riseRatio: Double
    /// Classes que soavam antes do ataque e ainda não voltaram a subir: não contam.
    public private(set) var ring: Set<PitchClass> = []
    private var soundingBefore: Set<PitchClass> = []
    private var energyBefore = [Double](repeating: 0, count: 12)

    public init(riseRatio: Double = 1.05) {
        self.riseRatio = riseRatio
    }

    /// Passe o quadro atual e se houve ataque. Retorna o quadro sem as classes de resíduo.
    public mutating func filter(_ reading: ChromaReading?, attack: Bool) -> ChromaReading? {
        guard let reading, reading.energy.count == 12 else {
            // Silêncio: a nota acabou de vez, não há mais resíduo.
            ring = []
            soundingBefore = []
            energyBefore = [Double](repeating: 0, count: 12)
            return reading
        }
        if attack { ring = soundingBefore }
        for pitchClass in ring where reading.energy[pitchClass.value] > energyBefore[pitchClass.value] * riseRatio {
            ring.remove(pitchClass)
        }
        let kept = reading.pitchClasses.subtracting(ring)
        soundingBefore = reading.pitchClasses
        energyBefore = reading.energy
        return ChromaReading(chroma: reading.chroma, pitchClasses: kept, energy: reading.energy)
    }

    public mutating func reset() {
        ring = []
        soundingBefore = []
        energyBefore = [Double](repeating: 0, count: 12)
    }
}
