import KeyzCore
import SwiftUI

/// Selo compacto que mostra se o microfone está captando som. Clique liga/desliga.
struct MicrophoneIndicator: View {
    @Environment(NoteInputHub.self) private var hub
    @Environment(\.openURL) private var openURL

    private var appearance: (title: String, symbol: String, color: Color, help: String) {
        switch hub.microphoneStatus {
        case .off:
            ("Mic desligado", "mic.slash", .gray, "Clique para ligar o microfone")
        case .starting:
            ("Ligando…", "mic", .gray, "Pedindo acesso ao microfone")
        case .denied:
            ("Sem permissão", "mic.slash.fill", .red, "Clique para abrir os ajustes de privacidade do microfone")
        case let .failed(message):
            ("Erro no mic", "exclamationmark.triangle.fill", .red, message)
        case .noAudio:
            ("Sem áudio", "exclamationmark.triangle.fill", .orange, "O microfone está ligado, mas nenhum áudio chega. Verifique o dispositivo de entrada.")
        case .blocked:
            ("Mic bloqueado", "hand.raised.fill", .red, "O sistema está entregando áudio zerado. Clique para liberar o Keyz nos ajustes de privacidade.")
        case .silence:
            ("Captando · silêncio", "mic.fill", .blue, "O microfone funciona; nenhum som alto o bastante agora")
        case .hearing:
            ("Ouvindo som", "waveform", .green, "Som chegando; toque uma nota sustentada para reconhecer")
        case let .note(note):
            ("Ouvindo \(note.solfegeName())", "music.note", .green, "Nota reconhecida pelo microfone")
        case let .chord(pitchClasses):
            ("Ouvindo \(Self.describe(pitchClasses))", "music.note.list", .green, "Acorde reconhecido pelo microfone")
        }
    }

    private var levelValue: Double {
        guard let level = hub.microphoneFrame?.level, level > 0 else { return 0 }
        return (20 * log10(Double(level)) + 60) / 60
    }

    var body: some View {
        let appearance = appearance
        Button(action: tap) {
            HStack(spacing: 6) {
                Image(systemName: appearance.symbol).foregroundStyle(appearance.color)
                if hub.microphoneEnabled {
                    LevelBars(value: levelValue, color: appearance.color)
                }
                Text(appearance.title).font(.caption.bold()).lineLimit(1)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(appearance.color.opacity(0.15), in: Capsule())
            .animation(.snappy, value: hub.microphoneStatus)
        }
        .buttonStyle(.plain)
        .help(appearance.help)
        .accessibilityLabel(appearance.title)
        .accessibilityHint(appearance.help)
    }

    private func tap() {
        switch hub.microphoneStatus {
        case .denied, .blocked:
            if let url = Self.privacySettingsURL { openURL(url) }
        default:
            Task { await hub.setMicrophoneEnabled(!hub.microphoneEnabled) }
        }
    }

    /// Nome do acorde, se for uma tríade maior/menor; senão as notas.
    static func describe(_ pitchClasses: Set<PitchClass>) -> String {
        let notes = Set(pitchClasses.map { 60 + $0.value })
        if let recognized = ChordRecognizer.recognize(notes) { return recognized.chord.displayName }
        return pitchClasses.sorted().map { $0.solfegeName(preferring: .sharp) }.joined(separator: " ")
    }

    static var privacySettingsURL: URL? {
        #if os(macOS)
        URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
        #else
        URL(string: "app-settings:")
        #endif
    }
}

/// Quatro barrinhas de volume.
struct LevelBars: View {
    let value: Double
    let color: Color

    var body: some View {
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(0..<4) { index in
                RoundedRectangle(cornerRadius: 1)
                    .fill(value > Double(index) / 4 ? color : Color.gray.opacity(0.3))
                    .frame(width: 3, height: 5 + CGFloat(index) * 3)
            }
        }
        .animation(.linear(duration: 0.08), value: value)
    }
}
