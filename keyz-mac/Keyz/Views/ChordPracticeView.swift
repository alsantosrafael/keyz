import KeyzCore
import SwiftUI

/// Treino de acordes maiores e menores.
struct ChordPracticeView: View {
    @Environment(NoteInputHub.self) private var hub
    @State private var model = ChordPracticeModel()

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                score

                if let chord = model.chord {
                    Text(chord.displayName)
                        .font(.system(size: 64, weight: .bold, design: .rounded))
                        .contentTransition(.opacity)
                    if model.showAnswer {
                        Text(chord.orderedPitchClasses.map { $0.solfegeName(preferring: chord.accidental) }.joined(separator: " – "))
                            .font(.title2)
                            .foregroundStyle(.orange)
                    }
                    feedback(for: chord)
                    ScreenKeyboard(range: 48...83, highlights: highlights(for: chord))
                }

                HStack {
                    Button(model.showAnswer ? "Esconder resposta" : "Mostrar resposta", systemImage: "eye") {
                        model.showAnswer.toggle()
                    }
                    .buttonStyle(.bordered)
                    Button("Próximo acorde", systemImage: "arrow.right") { model.nextChord() }
                        .buttonStyle(.borderedProminent)
                        .keyboardShortcut(.defaultAction)
                }
                .controlSize(.large)

                if hub.microphoneEnabled {
                    Label("Pelo microfone, toque o acorde de uma vez e segure. Vale qualquer inversão ou oitava.",
                          systemImage: "info.circle")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
            .frame(maxWidth: 700)
            .frame(maxWidth: .infinity)
        }
        .toolbar {
            Menu("Opções", systemImage: "slider.horizontal.3") {
                Toggle("Acordes maiores", isOn: $model.includeMajor)
                Toggle("Acordes menores", isOn: $model.includeMinor)
                Toggle("Avançar ao acertar", isOn: $model.autoAdvance)
            }
        }
        .onAppear { hub.microphoneChords = true }
        .onChange(of: hub.activeNotes) { _, notes in model.notesChanged(notes) }
        // Teclas seguradas do acorde anterior não podem contar para o próximo.
        .onChange(of: model.chord) { hub.releaseAll() }
    }

    private var score: some View {
        HStack {
            Label("\(model.correct)/\(model.attempts)", systemImage: "checkmark")
            Spacer()
            Text("Sequência \(model.streak)")
        }
        .font(.subheadline.bold())
    }

    @ViewBuilder
    private func feedback(for chord: Chord) -> some View {
        if let evaluation = model.evaluation {
            if evaluation.isCorrect {
                ResultBanner(kind: .success, title: "Acertou!")
            } else {
                let names = { (set: Set<PitchClass>) in
                    set.sorted().map { $0.solfegeName(preferring: chord.accidental) }.joined(separator: ", ")
                }
                ResultBanner(kind: .failure, title: "Quase",
                             subtitle: [
                                 evaluation.missing.isEmpty ? nil : "Faltou: \(names(evaluation.missing))",
                                 evaluation.extra.isEmpty ? nil : "Sobrou: \(names(evaluation.extra))",
                             ].compactMap { $0 }.joined(separator: " · "))
            }
        } else {
            Text("Toque o acorde e segure").foregroundStyle(.secondary).frame(minHeight: 60)
        }
    }

    private func highlights(for chord: Chord) -> [Int: KeyHighlight] {
        var result: [Int: KeyHighlight] = [:]
        if model.showAnswer {
            // Acorde em posição fundamental a partir do Dó central.
            for interval in chord.orderedPitchClasses.map({ ($0.value - chord.root.value + 12) % 12 }) {
                result[60 + chord.root.value + interval] = .target
            }
        }
        let played = hub.activeNotes.isEmpty && model.evaluation != nil ? model.playedNotes : hub.activeNotes
        for note in played {
            if model.evaluation == nil {
                result[note] = .pressed
            } else {
                result[note] = chord.pitchClasses.contains(PitchClass(note)) ? .correct : .wrong
            }
        }
        return result
    }
}
