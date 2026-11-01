import Foundation
import KeyzCore
import Observation

/// Uma tecla começou a soar. `serial` muda a cada evento, mesmo se a nota se repetir.
struct NoteEvent: Equatable {
    let serial: Int
    let midi: Int
}

/// Situação da captação pelo microfone, do desligado até a nota reconhecida.
enum MicrophoneStatus: Equatable {
    case off
    case starting
    case denied
    case failed(String)
    /// Ligado, mas nenhum áudio chega do sistema.
    case noAudio
    /// O áudio chega zerado: o sistema está bloqueando o microfone.
    case blocked
    case silence
    case hearing
    case note(Note)
    case chord(Set<PitchClass>)
}

/// Junta todas as fontes de notas (teclado na tela, MIDI e microfone) num só lugar.
@MainActor @Observable
final class NoteInputHub {
    private(set) var activeNotes: Set<Int> = []
    private(set) var lastNoteOn: NoteEvent?
    private(set) var midiSources: [String] = []

    private(set) var microphoneEnabled = false
    private(set) var microphoneError: String?
    private(set) var microphoneDeviceName: String?
    /// Último quadro do microfone, para o modo livre (afinação, volume, confiança).
    private(set) var microphoneFrame: MicrophoneInput.Frame?
    private(set) var microphoneStatus = MicrophoneStatus.off
    /// 0...1: quanto maior, mais fraca é a nota que o microfone aceita.
    private(set) var microphoneSensitivity = NoteInputHub.defaultSensitivity
    /// Reconhecer acordes pelo microfone. Os modos de acordes ligam; o desafio de notas desliga,
    /// para um harmônico forte nunca virar uma segunda nota.
    var microphoneChords = true
    /// As notas ativas vêm de um acorde captado pelo microfone (a oitava é aproximada).
    private(set) var microphoneChordActive = false

    @ObservationIgnored private let midi = MIDIInput()
    @ObservationIgnored private let microphone = MicrophoneInput()
    @ObservationIgnored private var serial = 0
    @ObservationIgnored private var microphoneNotes: Set<Int> = []
    /// Última vez que houve nota confirmada (acorde ou nota solta); depois de `releaseDelay` sem ela, solta.
    @ObservationIgnored private var lastEvidenceAt: Date?
    @ObservationIgnored private var lastFramePublished = Date.distantPast
    @ObservationIgnored private var pendingStatus: MicrophoneStatus?
    @ObservationIgnored private var pendingSince: Date?
    @ObservationIgnored private var zeroFrames = 0
    @ObservationIgnored private var pendingAttack = false
    @ObservationIgnored private var lastFrameAt: Date?
    @ObservationIgnored private var startedAt = Date()
    @ObservationIgnored private var watchdog: Task<Void, Never>?

    private static let enabledKey = "microphoneEnabled"
    private static let sensitivityKey = "microphoneSensitivity"
    /// Padrão: nem tão sensível que capte o ruído da sala, nem tão pouco que perca notas suaves.
    static let defaultSensitivity = 0.5
    /// Tempo sem nota antes de soltar a tecla: curto o bastante para acompanhar, longo para uma
    /// falha momentânea da detecção não virar um novo toque.
    private static let releaseDelay: TimeInterval = 0.15
    /// Os quadros chegam a 100 por segundo; a tela (afinação, volume) não precisa de mais que 30.
    private static let framePublishInterval: TimeInterval = 1.0 / 30
    /// Tempo que um novo estado do microfone precisa se sustentar para aparecer no selo.
    private static let statusHold: TimeInterval = 0.15

    init() {
        midi.onNoteOn = { [weak self] in self?.press($0) }
        midi.onNoteOff = { [weak self] in self?.release($0) }
        midi.onSourcesChanged = { [weak self] in self?.midiSources = $0 }
        microphone.onFrame = { [weak self] in self?.handle($0) }
        midi.start()
        if UserDefaults.standard.object(forKey: Self.sensitivityKey) != nil {
            microphoneSensitivity = UserDefaults.standard.double(forKey: Self.sensitivityKey)
        }
        microphone.sensitivity = microphoneSensitivity
        // Religa o microfone se ele estava ligado na última vez.
        if UserDefaults.standard.bool(forKey: Self.enabledKey) {
            Task { await setMicrophoneEnabled(true) }
        }
    }

    func press(_ note: Int) {
        activeNotes.insert(note)
        serial += 1
        lastNoteOn = NoteEvent(serial: serial, midi: note)
    }

    func release(_ note: Int) {
        activeNotes.remove(note)
    }

    /// Para o modo "segurar teclas": um clique liga, outro desliga.
    func toggle(_ note: Int) {
        if activeNotes.contains(note) { release(note) } else { press(note) }
    }

    func releaseAll() {
        activeNotes.removeAll()
        microphoneNotes = []
        microphoneChordActive = false
    }

    func setMicrophoneEnabled(_ enabled: Bool) async {
        microphoneError = nil
        UserDefaults.standard.set(enabled, forKey: Self.enabledKey)
        guard enabled else {
            watchdog?.cancel()
            microphone.stop()
            microphoneEnabled = false
            microphoneFrame = nil
            microphoneStatus = .off
            releaseMicrophoneNotes()
            return
        }
        microphoneStatus = .starting
        guard await MicrophoneInput.requestPermission() else {
            audioLog.error("permissão do microfone negada")
            #if os(macOS)
            microphoneError = "Permissão negada. Libere o Keyz em Ajustes do Sistema › Privacidade e Segurança › Microfone."
            #else
            microphoneError = "Permissão negada. Libere o Keyz em Ajustes › Privacidade › Microfone."
            #endif
            microphoneStatus = .denied
            UserDefaults.standard.set(false, forKey: Self.enabledKey)
            return
        }
        do {
            try microphone.start()
            microphoneEnabled = true
            microphoneDeviceName = microphone.deviceName
            startedAt = Date()
            lastFrameAt = nil
            zeroFrames = 0
            runWatchdog()
        } catch {
            microphoneError = error.localizedDescription
            microphoneStatus = .failed(error.localizedDescription)
        }
    }

    func setMicrophoneSensitivity(_ value: Double) {
        microphoneSensitivity = min(max(value, 0), 1)
        microphone.sensitivity = microphoneSensitivity
        UserDefaults.standard.set(microphoneSensitivity, forKey: Self.sensitivityKey)
    }

    /// Aprende o ruído de fundo de novo; o usuário deve ficar em silêncio por alguns segundos.
    func recalibrateMicrophone() {
        microphone.recalibrate()
    }

    /// Detecta quando o áudio para de chegar (o callback de quadros não roda nesse caso).
    private func runWatchdog() {
        watchdog?.cancel()
        watchdog = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(500))
                guard let self, self.microphoneEnabled else { return }
                let reference = self.lastFrameAt ?? self.startedAt
                if Date().timeIntervalSince(reference) > 1.5 {
                    if self.microphoneStatus != .noAudio { audioLog.error("nenhum áudio chegando do microfone") }
                    self.microphoneStatus = .noAudio
                }
            }
        }
    }

    private func handle(_ frame: MicrophoneInput.Frame) {
        guard microphoneEnabled else { return }
        let now = Date()
        lastFrameAt = now
        if now.timeIntervalSince(lastFramePublished) >= Self.framePublishInterval {
            microphoneFrame = frame
            lastFramePublished = now
        }
        zeroFrames = frame.peak == 0 ? zeroFrames + 1 : 0
        // Os estabilizadores recomeçam no ataque, então a confirmação chega alguns quadros depois.
        if frame.attack { pendingAttack = true }

        if microphoneChords, let chord = frame.chord {
            // Acorde: sem oitava confiável, as notas vão para a oitava do Dó central.
            lastEvidenceAt = now
            setMicrophoneNotes(Set(chord.map { 60 + $0.value }), chord: true)
        } else if let stable = frame.stable,
                  !(microphoneChords && frame.spectrumNotes.count >= 2) {
            // Nota solta (o YIN acerta a oitava). Com várias notas no espectro, a leitura do YIN não vale
            // (num acorde ele acha um "período comum" grave e falso); espera a confirmação do acorde.
            lastEvidenceAt = now
            setMicrophoneNotes([stable.note.midi], chord: false)
        } else if let lastEvidenceAt, now.timeIntervalSince(lastEvidenceAt) >= Self.releaseDelay {
            // Solta quando não há mais nota confirmada, mesmo que o espectro ainda veja ruído:
            // antes, qualquer resíduo no espectro segurava a tecla para sempre.
            releaseMicrophoneNotes()
            self.lastEvidenceAt = nil
        }
        updateStatus(status(for: frame), at: now)
    }

    /// O status muda a cada quadro (100 por segundo) e oscila perto dos limiares de volume.
    /// Só troca o que aparece na tela depois que o novo estado se sustenta por `statusHold`.
    private func updateStatus(_ raw: MicrophoneStatus, at now: Date) {
        if raw == microphoneStatus {
            pendingStatus = nil
            return
        }
        guard raw == pendingStatus, let pendingSince else {
            pendingStatus = raw
            pendingSince = now
            return
        }
        if now.timeIntervalSince(pendingSince) >= Self.statusHold {
            microphoneStatus = raw
            pendingStatus = nil
            self.pendingSince = nil
        }
    }

    private func setMicrophoneNotes(_ notes: Set<Int>, chord: Bool) {
        guard notes != microphoneNotes || pendingAttack else { return }
        pendingAttack = false
        releaseMicrophoneNotes()
        microphoneNotes = notes
        microphoneChordActive = chord
        for note in notes.sorted() { press(note) }
    }

    private func status(for frame: MicrophoneInput.Frame) -> MicrophoneStatus {
        // Um microfone de verdade sempre tem algum ruído; zero absoluto por vários quadros é bloqueio.
        if zeroFrames >= 10 { return .blocked }
        if microphoneChordActive, !microphoneNotes.isEmpty {
            return .chord(Set(microphoneNotes.map(PitchClass.init)))
        }
        if let stable = frame.stable { return .note(stable.note) }
        return frame.level < 0.002 ? .silence : .hearing
    }

    private func releaseMicrophoneNotes() {
        for note in microphoneNotes { release(note) }
        microphoneNotes = []
        microphoneChordActive = false
    }
}
