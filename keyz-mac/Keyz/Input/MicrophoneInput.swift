import AVFoundation
import KeyzCore
import os

let audioLog = Logger(subsystem: "com.rafael.keyz", category: "audio")

/// Captura o microfone e detecta uma nota por vez.
final class MicrophoneInput {
    struct Frame {
        /// Volume do quadro (RMS, 0...1).
        var level: Float
        /// Maior amostra do quadro; zero absoluto indica áudio bloqueado pelo sistema.
        var peak: Float
        /// Leitura bruta do detector, mesmo instável.
        var reading: PitchReading?
        /// Nota confirmada pelo estabilizador.
        var stable: DetectedNote?
        /// Classes de nota vistas no espectro neste quadro (sem confirmação).
        var spectrumNotes: Set<PitchClass>
        /// Conjunto de duas ou mais notas confirmado em vários quadros: um acorde.
        var chord: Set<PitchClass>?
        /// Houve um novo ataque (tecla tocada de novo).
        var attack: Bool
    }

    enum Permission {
        case granted, denied, undetermined
    }

    /// Chamado na main thread a cada quadro de áudio.
    var onFrame: ((Frame) -> Void)?

    /// 0...1: quanto maior, mais fraca é a nota aceita. Alto demais capta ruído; baixo demais perde notas suaves.
    var sensitivity: Double = 0.5 {
        didSet { applySensitivity() }
    }

    /// Uma análise a cada 10 ms de áudio novo, independente do tamanho dos blocos que o sistema entrega.
    static let hopDuration = 0.01
    /// Menor intervalo entre dois ataques: a subida de uma mesma martelada dura alguns quadros.
    private static let minFramesBetweenAttacks = 8

    private var engine = AVAudioEngine()
    private var sink: AVAudioSinkNode?
    /// Recebe o áudio; dono de `samples`, `newSamples` e `analysisPending`.
    private let queue = DispatchQueue(label: "keyz.audio", qos: .userInteractive)
    /// Faz a detecção; dono de `stabilizer`, `envelope`, `framesSinceAttack` e `framesAnalyzed`.
    private let analysisQueue = DispatchQueue(label: "keyz.pitch", qos: .userInteractive)
    private var samples: [Float] = []
    /// Amostras chegadas desde a última análise.
    private var newSamples = 0
    private var analysisPending = false
    // Com quadros a cada 10 ms, 3 quadros = 30 ms de confirmação; acordes pedem um pouco mais.
    private var stabilizer = NoteStabilizer(requiredFrames: 3)
    private var chordStabilizer = PitchClassSetStabilizer(requiredFrames: 5)
    /// Separa a nota nova do som da anterior que ainda ressoa.
    private var ringFilter = RingFilter()
    /// Volume recente com decaimento lento, para reconhecer uma nova martelada sobre uma nota que ainda soa.
    private var envelope: Float = 0
    private var framesSinceAttack = Int.max
    private var framesAnalyzed = 0
    private var configurationObserver: NSObjectProtocol?
    private var chroma: ChromaAnalyzer?
    /// Quadros restantes de calibração do ruído (sem emitir notas enquanto isso).
    private var calibrationFrames = 0
    private(set) var isRunning = false

    var deviceName: String? {
        AVCaptureDevice.default(for: .audio)?.localizedName
    }

    static var permission: Permission {
        #if os(macOS)
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized: .granted
        case .notDetermined: .undetermined
        default: .denied
        }
        #else
        switch AVAudioApplication.shared.recordPermission {
        case .granted: .granted
        case .undetermined: .undetermined
        default: .denied
        }
        #endif
    }

    static func requestPermission() async -> Bool {
        #if os(macOS)
        // No Mac, a permissão de microfone é a de captura (TCC).
        if AVCaptureDevice.authorizationStatus(for: .audio) == .authorized { return true }
        return await AVCaptureDevice.requestAccess(for: .audio)
        #else
        await AVAudioApplication.requestRecordPermission()
        #endif
    }

    func start() throws {
        guard !isRunning else { return }
        #if os(iOS)
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement)
        // Blocos pequenos do hardware = áudio chega rápido (o padrão do iOS é ~20 ms ou mais).
        try? session.setPreferredIOBufferDuration(0.005)
        try session.setActive(true)
        #endif

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        audioLog.info("microfone: \(self.deviceName ?? "?", privacy: .public), \(format.sampleRate) Hz, \(format.channelCount) canais")
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw NSError(domain: "Keyz", code: 1, userInfo: [NSLocalizedDescriptionKey: "Nenhum microfone disponível."])
        }
        // O teclado do app começa no Dó 2 (65 Hz): não precisa enxergar até 27,5 Hz, o que exigiria
        // uma janela de 73 ms; com 60 Hz a janela do YIN cai para ~33 ms e a nota nova aparece antes.
        let detector = PitchDetector(sampleRate: format.sampleRate, minFrequency: 60)
        let chroma = ChromaAnalyzer(sampleRate: format.sampleRate, snr: Self.snr(for: sensitivity))
        self.chroma = chroma
        let windowSize = max(detector.recommendedBufferSize, chroma.size)
        let hopSize = Int(format.sampleRate * Self.hopDuration)

        // O sink node recebe o áudio no ritmo do hardware (blocos de poucos ms); o installTap
        // entrega blocos de ~100 ms, o que atrasava cada leitura.
        let sink = AVAudioSinkNode { [weak self] _, frameCount, bufferList in
            let buffers = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: bufferList))
            guard let data = buffers.first?.mData?.assumingMemoryBound(to: Float.self) else { return noErr }
            let chunk = Array(UnsafeBufferPointer(start: data, count: Int(frameCount)))
            self?.queue.async {
                self?.receive(chunk, detector: detector, chroma: chroma, windowSize: windowSize, hopSize: hopSize)
            }
            return noErr
        }
        engine.attach(sink)
        engine.connect(input, to: sink, format: format)
        self.sink = sink
        engine.prepare()
        do {
            try engine.start()
        } catch {
            detachSink()
            audioLog.error("falha ao iniciar o áudio: \(error.localizedDescription, privacy: .public)")
            throw error
        }
        isRunning = true
        audioLog.info("captação iniciada")

        // Trocar de microfone (ou conectar fone) reconfigura o engine e para a captação: reinicia.
        configurationObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main
        ) { [weak self] _ in
            guard let self, self.isRunning else { return }
            audioLog.info("dispositivo de áudio mudou; reiniciando captação")
            self.stop()
            self.engine = AVAudioEngine()
            try? self.start()
        }
    }

    /// Pede silêncio por ~1,5 s para aprender o ruído da sala de novo.
    func recalibrate() {
        analysisQueue.async { [weak self] in
            self?.chroma?.resetNoiseFloor()
            self?.calibrationFrames = 150
        }
    }

    private func applySensitivity() {
        let snr = Self.snr(for: sensitivity)
        analysisQueue.async { [weak self] in self?.chroma?.snr = snr }
    }

    /// Sensibilidade 0 → piso de 12× o ruído; 1 → 4×.
    private static func snr(for sensitivity: Double) -> Float {
        Float(12 - 8 * min(max(sensitivity, 0), 1))
    }

    func stop() {
        guard isRunning else { return }
        if let configurationObserver { NotificationCenter.default.removeObserver(configurationObserver) }
        configurationObserver = nil
        engine.stop()
        detachSink()
        isRunning = false
        queue.async { [weak self] in
            self?.samples.removeAll()
            self?.newSamples = 0
        }
        analysisQueue.async { [weak self] in
            self?.stabilizer.reset()
            self?.chordStabilizer.reset()
            self?.ringFilter.reset()
            self?.envelope = 0
            self?.framesSinceAttack = .max
        }
        audioLog.info("captação parada")
    }

    private func detachSink() {
        guard let sink else { return }
        engine.disconnectNodeInput(sink)
        engine.detach(sink)
        self.sink = nil
    }

    /// Guarda o áudio e analisa a cada `hopSize` amostras novas; se a análise anterior ainda
    /// estiver rodando, espera a próxima, para nunca acumular atraso.
    private func receive(_ chunk: [Float], detector: PitchDetector, chroma: ChromaAnalyzer, windowSize: Int, hopSize: Int) {
        samples.append(contentsOf: chunk)
        if samples.count > windowSize { samples.removeFirst(samples.count - windowSize) }
        newSamples += chunk.count
        guard samples.count == windowSize, newSamples >= hopSize, !analysisPending else { return }
        let recent = Array(samples.suffix(min(newSamples, windowSize)))
        newSamples = 0
        analysisPending = true
        analysisQueue.async { [weak self, samples] in
            self?.process(samples, recent: recent, detector: detector, chroma: chroma)
            self?.queue.async { self?.analysisPending = false }
        }
    }

    private func process(_ samples: [Float], recent: [Float], detector: PitchDetector, chroma: ChromaAnalyzer) {
        let level = (recent.reduce(Float(0)) { $0 + $1 * $1 } / Float(max(recent.count, 1))).squareRoot()
        let peak = recent.reduce(Float(0)) { max($0, abs($1)) }
        // Volume bem acima do envelope recente = nova tecla, mesmo com a anterior ainda soando.
        // Recomeça a confirmação para detectar notas repetidas.
        framesSinceAttack = framesSinceAttack == .max ? .max : framesSinceAttack + 1
        let attack = level > 0.01 && level > envelope * 1.5 && framesSinceAttack >= Self.minFramesBetweenAttacks
        envelope = max(level, envelope * 0.9)
        if attack {
            framesSinceAttack = 0
            stabilizer.reset()
            chordStabilizer.reset()
        }

        // O YIN usa só o trecho final; a análise de espectro usa a janela maior.
        let reading = detector.detect(samples: Array(samples.suffix(detector.recommendedBufferSize)))
        // Depois de uma troca de nota, o filtro de resíduo diz o que ainda é som da nota anterior.
        let calibrating = calibrationFrames > 0
        if calibrating { calibrationFrames -= 1 }
        let spectrum = ringFilter.filter(chroma.analyze(samples: samples), attack: attack)
        let ringingPitch = reading?.note.map { ringFilter.ring.contains(PitchClass($0.note.midi)) } ?? false
        let stable = calibrating ? nil : stabilizer.feed(ringingPitch ? nil : reading)
        let confirmed = calibrating ? nil : chordStabilizer.feed(spectrum)
        let chord = (confirmed?.count ?? 0) >= 2 ? confirmed : nil

        framesAnalyzed += 1
        if framesAnalyzed % 100 == 1 {
            let notes = spectrum?.pitchClasses.sorted().map { $0.name(preferring: .sharp) }.joined(separator: " ") ?? "-"
            audioLog.debug("quadro \(self.framesAnalyzed): rms \(level), pico \(peak), freq \(reading?.frequency ?? 0), conf \(reading?.confidence ?? 0), espectro \(notes, privacy: .public)")
        }

        let frame = Frame(
            level: level, peak: peak, reading: reading, stable: stable,
            spectrumNotes: calibrating ? [] : spectrum?.pitchClasses ?? [], chord: chord, attack: attack
        )
        DispatchQueue.main.async { [weak self] in self?.onFrame?(frame) }
    }
}
