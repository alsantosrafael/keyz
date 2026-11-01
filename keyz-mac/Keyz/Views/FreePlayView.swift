import KeyzCore
import SwiftUI

/// Modo livre: toque notas ou acordes e veja o que o app reconheceu — útil para testar a captação.
struct FreePlayView: View {
    @Environment(NoteInputHub.self) private var hub
    @State private var history: [String] = []
    @State private var accidental: PitchClass.Accidental = .sharp

    /// Notas soando agora, da mais grave à mais aguda.
    private var sounding: [Note] { hub.activeNotes.sorted().map(Note.init(midi:)) }
    private var isChord: Bool { sounding.count >= 2 }
    private var recognized: RecognizedChord? { ChordRecognizer.recognize(hub.activeNotes) }
    /// Última nota tocada; continua na tela depois de soltar a tecla.
    private var lastNote: Note? { hub.lastNoteOn.map { Note(midi: $0.midi) } }
    private var micNote: DetectedNote? { hub.microphoneFrame?.stable }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if !hub.microphoneEnabled {
                    MicrophonePrompt()
                }

                if isChord { chordReadout } else { noteReadout }

                if hub.microphoneEnabled {
                    CaptureQualityView(frame: hub.microphoneFrame)
                }

                StaffCard(notes: staffNotes, accidental: isChord ? recognized?.chord.accidental ?? accidental : accidental, stacked: isChord)

                ScreenKeyboard(range: 36...95)
                Text("Toque notas ou acordes no piano, nas teclas acima ou no teclado do computador.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                if !history.isEmpty { historyView }
            }
            .padding()
        }
        .toolbar {
            ToolbarItem(placement: .automatic) {
                Picker("Alterações", selection: $accidental) {
                    Text("♯").tag(PitchClass.Accidental.sharp)
                    Text("♭").tag(PitchClass.Accidental.flat)
                }
                .pickerStyle(.segmented)
            }
        }
        .onAppear { hub.microphoneChords = true }
        .onChange(of: hub.lastNoteOn) { _, event in
            guard let event, hub.activeNotes.count <= 1 else { return }
            remember(Note(midi: event.midi).solfegeName(preferring: accidental))
        }
        .onChange(of: recognized) { _, chord in
            if let chord { remember(chord.chord.displayName) }
        }
    }

    private var staffNotes: [StaffNote] {
        if isChord { return sounding.map { StaffNote(note: $0, color: .accentColor) } }
        return lastNote.map { [StaffNote(note: $0, color: .accentColor)] } ?? []
    }

    private var noteReadout: some View {
        VStack(spacing: 6) {
            Text(lastNote?.solfegeName(preferring: accidental) ?? "—")
                .font(.system(size: 72, weight: .bold, design: .rounded))
            if let lastNote {
                let frequency = micNote?.note == lastNote ? micNote!.frequency : lastNote.frequency
                Text("\(lastNote.name(preferring: accidental)) · \(frequency.formatted(.number.precision(.fractionLength(1)))) Hz")
                    .font(.title3)
                    .foregroundStyle(.secondary)
            } else {
                Text("Toque uma nota ou um acorde").foregroundStyle(.secondary)
            }
            if let micNote, micNote.note == lastNote {
                TunerGauge(cents: micNote.cents).frame(maxWidth: 360)
            }
        }
        .frame(minHeight: 150)
    }

    private var chordReadout: some View {
        VStack(spacing: 6) {
            if let recognized {
                Text(recognized.chord.displayName)
                    .font(.system(size: 64, weight: .bold, design: .rounded))
                Text(recognized.inversionName.capitalized(with: nil))
                    .font(.title3)
                    .foregroundStyle(.secondary)
            } else {
                Text("Acorde não reconhecido")
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                Text("Por enquanto o app reconhece tríades maiores e menores")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if hub.microphoneChordActive {
                // Pelo microfone a oitava de cada nota não é detectada.
                Text(sounding.map { $0.pitchClass.solfegeName(preferring: recognized?.chord.accidental ?? accidental) }.joined(separator: " – "))
                    .font(.title3)
                Label("Captado pelo microfone · notas mostradas perto do Dó central", systemImage: "mic.fill")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text(sounding.map { $0.solfegeName(preferring: recognized?.chord.accidental ?? accidental) }.joined(separator: " – "))
                    .font(.title3)
            }
        }
        .frame(minHeight: 150)
    }

    private func remember(_ entry: String) {
        history.insert(entry, at: 0)
        if history.count > 12 { history.removeLast() }
    }

    private var historyView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Últimas notas e acordes").font(.headline)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(Array(history.enumerated()), id: \.offset) { _, entry in
                        Text(entry)
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(.quaternary, in: Capsule())
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Mostra o desvio de afinação: verde perto do centro.
struct TunerGauge: View {
    let cents: Double

    private var tint: Color {
        switch abs(cents) {
        case ..<10: .green
        case ..<25: .yellow
        default: .red
        }
    }

    var body: some View {
        VStack(spacing: 4) {
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(.quaternary)
                    Rectangle().fill(.secondary).frame(width: 2).offset(x: geometry.size.width / 2 - 1)
                    Circle().fill(tint).frame(width: 14)
                        .offset(x: (cents + 50) / 100 * geometry.size.width - 7)
                }
            }
            .frame(height: 14)
            Text(cents >= 0 ? "+\(Int(cents.rounded())) cents" : "\(Int(cents.rounded())) cents")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .animation(.linear(duration: 0.1), value: cents)
    }
}

/// Volume e confiança da detecção, para avaliar se o microfone está captando bem.
struct CaptureQualityView: View {
    @Environment(NoteInputHub.self) private var hub
    let frame: MicrophoneInput.Frame?

    private var levelValue: Double {
        guard let level = frame?.level, level > 0 else { return 0 }
        return (20 * log10(Double(level)) + 60) / 60
    }

    private var status: (String, Color) {
        switch hub.microphoneStatus {
        case .noAudio: return ("Nenhum áudio chegando do microfone", .orange)
        case .blocked: return ("Áudio zerado: o sistema está bloqueando o microfone", .red)
        default: break
        }
        guard let frame else { return ("Aguardando áudio…", .secondary) }
        if frame.level < 0.002 { return ("Silêncio — o microfone está funcionando", .secondary) }
        if hub.microphoneChordActive { return ("Captando acorde", .green) }
        guard let reading = frame.reading else {
            return frame.spectrumNotes.count >= 2 ? ("Várias notas — segure o acorde", .orange) : ("Som sem nota clara (ruído?)", .orange)
        }
        if reading.confidence < 0.75 { return ("Nota instável — aproxime o aparelho do piano", .orange) }
        return ("Captando bem", .green)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Qualidade da captação").font(.headline)
            if let device = hub.microphoneDeviceName {
                LabeledContent("Microfone", value: device)
            }
            LabeledContent("Volume") { MeterBar(value: levelValue).frame(width: 180) }
            LabeledContent("Confiança") { MeterBar(value: frame?.reading?.confidence ?? 0, tint: .green).frame(width: 180) }
            Label(status.0, systemImage: "waveform").foregroundStyle(status.1)
        }
        .padding()
        .frame(maxWidth: 420, alignment: .leading)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
    }
}

/// Convite para ligar o microfone quando ele está desligado.
struct MicrophonePrompt: View {
    @Environment(NoteInputHub.self) private var hub

    var body: some View {
        VStack(spacing: 8) {
            Button {
                Task { await hub.setMicrophoneEnabled(true) }
            } label: {
                Label("Ligar microfone", systemImage: "mic.fill")
            }
            .buttonStyle(.borderedProminent)
            Text(hub.microphoneError ?? "Ou use um teclado MIDI ou as teclas da tela.")
                .font(.footnote)
                .foregroundStyle(hub.microphoneError == nil ? Color.secondary : .red)
                .multilineTextAlignment(.center)
        }
    }
}
