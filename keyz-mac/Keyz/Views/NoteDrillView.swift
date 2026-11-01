import KeyzCore
import SwiftUI

/// Modo desafio: uma nota aparece e é preciso tocá-la antes de o tempo acabar.
struct NoteDrillView: View {
    @Environment(NoteInputHub.self) private var hub
    @State private var model = NoteDrillModel()
    @State private var showSettings = false

    private var config: DrillConfig { model.drill.config }
    private var keyboardRange: ClosedRange<Int> { (config.lowest.midi...config.highest.midi).wholeOctaves }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                switch model.drill.phase {
                case .idle:
                    setup
                case let .awaiting(target, _):
                    prompt(target)
                case let .showingResult(result, nextAt):
                    resultView(result, manual: nextAt == nil)
                case .finished:
                    summary
                }
            }
            .padding()
            .frame(maxWidth: 700)
            .frame(maxWidth: .infinity)
        }
        .toolbar {
            if model.isRunning {
                Button("Parar", systemImage: "stop.fill") { model.stop() }
            }
        }
        .sheet(isPresented: $showSettings) {
            DrillSettingsView(config: $model.config)
        }
        .onChange(of: hub.lastNoteOn) { _, event in
            if let event { model.noteOn(event.midi) }
        }
        .onAppear { hub.microphoneChords = false }
        .onDisappear { model.stop() }
    }

    // MARK: Antes de começar

    private var setup: some View {
        VStack(spacing: 20) {
            Picker("Dificuldade", selection: Binding(get: { model.config.difficulty }, set: model.selectDifficulty)) {
                ForEach(Difficulty.allCases, id: \.self) { Text($0.displayName).tag($0) }
            }
            .pickerStyle(.segmented)

            VStack(alignment: .leading, spacing: 8) {
                summaryRow("Notas", "\(model.config.lowest.solfegeName()) a \(model.config.highest.solfegeName())"
                    + (model.config.includeAccidentals ? ", com ♯/♭" : ", só teclas brancas"))
                summaryRow("Tempo para tocar", model.config.timePerNote.seconds)
                summaryRow("Próxima nota", model.config.autoAdvance ? "automática, após \(model.config.pauseBetweenNotes.seconds)" : "manual")
                summaryRow("Mostrar nota como", model.config.promptStyle.displayName)
                summaryRow("Oitava", model.config.matchOctave ? "precisa ser a mesma" : "qualquer uma")
                summaryRow("Sessão", model.config.rounds.map { "\($0) notas" } ?? "sem fim")
            }
            .padding()
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))

            HStack {
                Button("Configurar", systemImage: "slider.horizontal.3") { showSettings = true }
                    .buttonStyle(.bordered)
                Button("Começar", systemImage: "play.fill") { model.start() }
                    .buttonStyle(.borderedProminent)
                    .keyboardShortcut(.defaultAction)
            }
            .controlSize(.large)

            if !hub.microphoneEnabled && hub.midiSources.isEmpty {
                MicrophonePrompt()
            }
        }
    }

    private func summaryRow(_ title: String, _ value: String) -> some View {
        LabeledContent(title, value: value)
    }

    // MARK: Tocando

    private func prompt(_ target: Note) -> some View {
        VStack(spacing: 20) {
            stats
            Text("Toque:").font(.title3).foregroundStyle(.secondary)
            if config.promptStyle != .staff {
                Text(target.solfegeName(preferring: config.accidental))
                    .font(.system(size: 64, weight: .bold, design: .rounded))
            }
            if config.promptStyle != .name {
                StaffCard(notes: [StaffNote(note: target)], accidental: config.accidental)
            }
            VStack(spacing: 4) {
                ProgressView(value: model.remainingFraction)
                    .tint(model.remainingFraction > 0.3 ? .accentColor : .red)
                Text(model.remainingSeconds.seconds).font(.caption.monospacedDigit()).foregroundStyle(.secondary)
            }
            .frame(maxWidth: 420)
            keyboard(highlights: Dictionary(uniqueKeysWithValues: hub.activeNotes.map { ($0, .pressed) }))
        }
    }

    // MARK: Resultado

    private func resultView(_ result: DrillResult, manual: Bool) -> some View {
        let target = result.target
        var staffNotes = [StaffNote(note: target, color: .green, label: "certa")]
        var highlights: [Int: KeyHighlight] = [target.midi: .correct]
        let banner: ResultBanner
        switch result.outcome {
        case .correct:
            banner = ResultBanner(kind: .success, title: "Acertou!",
                                  subtitle: "\(target.fullName(config.accidental)) em \((result.responseTime ?? 0).seconds)")
        case let .wrong(played):
            banner = ResultBanner(kind: .failure, title: "Errou",
                                  subtitle: "Você tocou \(played.fullName(config.accidental)); era \(target.fullName(config.accidental))")
            if played != target {
                staffNotes.append(StaffNote(note: played, color: .red, label: "tocada"))
                highlights[played.midi] = .wrong
            }
        case .timeout:
            banner = ResultBanner(kind: .warning, title: "Tempo esgotado",
                                  subtitle: "Era \(target.fullName(config.accidental))")
        }

        return VStack(spacing: 20) {
            stats
            banner
            StaffCard(notes: staffNotes, accidental: config.accidental)
            keyboard(highlights: highlights)
            if manual {
                Button("Próxima nota", systemImage: "arrow.right") { model.next() }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .keyboardShortcut(.defaultAction)
            }
        }
    }

    // MARK: Fim

    private var summary: some View {
        let stats = model.drill.stats
        return VStack(spacing: 16) {
            Text("Sessão concluída").font(.largeTitle.bold())
            Text("\(Int((stats.accuracy * 100).rounded()))% de acerto").font(.title)
            VStack(alignment: .leading, spacing: 8) {
                LabeledContent("Acertos", value: "\(stats.correct)")
                LabeledContent("Erros", value: "\(stats.wrong)")
                LabeledContent("Tempo esgotado", value: "\(stats.timeouts)")
                LabeledContent("Melhor sequência", value: "\(stats.bestStreak)")
                if let average = stats.averageResponseTime {
                    LabeledContent("Tempo médio de resposta", value: average.seconds)
                }
            }
            .padding()
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
            HStack {
                Button("Jogar de novo", systemImage: "arrow.clockwise") { model.start() }
                    .buttonStyle(.borderedProminent)
                Button("Mudar configuração") { model.stop() }
                    .buttonStyle(.bordered)
            }
            .controlSize(.large)
        }
    }

    // MARK: Partes comuns

    private var stats: some View {
        let stats = model.drill.stats
        return HStack(spacing: 16) {
            Label("\(stats.correct)", systemImage: "checkmark").foregroundStyle(.green)
            Label("\(stats.wrong)", systemImage: "xmark").foregroundStyle(.red)
            Label("\(stats.timeouts)", systemImage: "clock").foregroundStyle(.orange)
            Spacer()
            Text("Sequência \(stats.streak) · melhor \(stats.bestStreak)")
            if let rounds = config.rounds {
                Text("\(stats.attempts)/\(rounds)").monospacedDigit()
            }
        }
        .font(.subheadline.bold())
    }

    private func keyboard(highlights: [Int: KeyHighlight]) -> some View {
        KeyboardView(range: keyboardRange, highlights: highlights, onPress: hub.press, onRelease: hub.release)
    }
}

struct DrillSettingsView: View {
    @Binding var config: DrillConfig
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Dificuldade", selection: Binding(get: { config.difficulty }, set: { config = .preset($0) })) {
                        ForEach(Difficulty.allCases, id: \.self) { Text($0.displayName).tag($0) }
                    }
                    .pickerStyle(.segmented)
                } footer: {
                    Text("Trocar a dificuldade restaura a configuração padrão dela.")
                }

                Section("Tempo") {
                    Stepper("Tempo para tocar: \(config.timePerNote.seconds)", value: $config.timePerNote, in: 1...30, step: 0.5)
                    Toggle("Avançar automaticamente", isOn: $config.autoAdvance)
                    Stepper("Pausa entre notas: \(config.pauseBetweenNotes.seconds)", value: $config.pauseBetweenNotes, in: 0.25...5, step: 0.25)
                        .disabled(!config.autoAdvance)
                }

                Section("Notas") {
                    Stepper("Mais grave: \(config.lowest.solfegeName())",
                            value: Binding(get: { config.lowest.midi }, set: { config.lowest = Note(midi: $0) }),
                            in: 21...(config.highest.midi - 1))
                    Stepper("Mais aguda: \(config.highest.solfegeName())",
                            value: Binding(get: { config.highest.midi }, set: { config.highest = Note(midi: $0) }),
                            in: (config.lowest.midi + 1)...108)
                    Toggle("Incluir sustenidos e bemóis", isOn: $config.includeAccidentals)
                    Picker("Escrever como", selection: $config.accidental) {
                        Text("Sustenidos (♯)").tag(PitchClass.Accidental.sharp)
                        Text("Bemóis (♭)").tag(PitchClass.Accidental.flat)
                    }
                    .disabled(!config.includeAccidentals)
                    Toggle("Exigir a oitava certa", isOn: $config.matchOctave)
                }

                Section("Exibição") {
                    Picker("Mostrar a nota como", selection: $config.promptStyle) {
                        ForEach(PromptStyle.allCases, id: \.self) { Text($0.displayName).tag($0) }
                    }
                }

                Section("Sessão") {
                    Toggle("Sem fim", isOn: Binding(get: { config.rounds == nil }, set: { config.rounds = $0 ? nil : 20 }))
                    if let rounds = config.rounds {
                        Stepper("Notas por sessão: \(rounds)",
                                value: Binding(get: { rounds }, set: { config.rounds = $0 }),
                                in: 5...200, step: 5)
                    }
                }
            }
            .formStyle(.grouped)
            .navigationTitle("Configurar desafio")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }
                }
            }
        }
        .frame(minWidth: 420, minHeight: 560)
    }
}
