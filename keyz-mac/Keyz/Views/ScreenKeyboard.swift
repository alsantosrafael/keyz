import SwiftUI

/// No Mac, o mouse toca uma tecla por vez; segurar teclas permite montar acordes clicando.
#if os(macOS)
let latchKeysByDefault = true
#else
let latchKeysByDefault = false
#endif

/// Teclado na tela ligado ao hub, com opção de segurar teclas.
struct ScreenKeyboard: View {
    @Environment(NoteInputHub.self) private var hub
    @AppStorage("latchKeys") private var latch = latchKeysByDefault

    let range: ClosedRange<Int>
    var highlights: [Int: KeyHighlight]?

    private var pressedHighlights: [Int: KeyHighlight] {
        Dictionary(uniqueKeysWithValues: hub.activeNotes.map { ($0, KeyHighlight.pressed) })
    }

    private func press(_ note: Int) {
        if latch { hub.toggle(note) } else { hub.press(note) }
    }

    private func release(_ note: Int) {
        if !latch { hub.release(note) }
    }

    var body: some View {
        VStack(spacing: 8) {
            KeyboardView(range: range, highlights: highlights ?? pressedHighlights, onPress: press, onRelease: release)
            HStack {
                Toggle("Segurar teclas", isOn: $latch)
                    .help("Cada clique liga ou desliga a tecla, para montar acordes com o mouse")
                if latch && !hub.activeNotes.isEmpty {
                    Button("Soltar todas", systemImage: "xmark.circle") { hub.releaseAll() }
                        .buttonStyle(.borderless)
                }
                Spacer()
                #if os(macOS)
                Text("Teclado do computador: A W S E D F T G Y H U J K = Dó4 a Dó5")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                #endif
            }
            .font(.callout)
            .onChange(of: latch) { hub.releaseAll() }
        }
    }
}

/// Usa as teclas do computador como um piano (estilo GarageBand), permitindo acordes.
struct ComputerKeyboardInput: ViewModifier {
    @Environment(NoteInputHub.self) private var hub
    @FocusState private var focused: Bool

    /// Distância em semitons a partir do Dó4.
    private static let keyMap: [Character: Int] = [
        "a": 0, "w": 1, "s": 2, "e": 3, "d": 4, "f": 5, "t": 6, "g": 7,
        "y": 8, "h": 9, "u": 10, "j": 11, "k": 12, "o": 13, "l": 14, "p": 15, "ç": 16, ";": 16,
    ]

    func body(content: Content) -> some View {
        content
            .focusable()
            .focusEffectDisabled()
            .focused($focused)
            .onAppear { focused = true }
            .onKeyPress(phases: [.down, .up]) { press in
                guard press.modifiers.isEmpty || press.modifiers == .capsLock,
                      let character = press.characters.lowercased().first,
                      let offset = Self.keyMap[character] else { return .ignored }
                let note = 60 + offset
                if press.phase == .down {
                    if !hub.activeNotes.contains(note) { hub.press(note) }
                } else {
                    hub.release(note)
                }
                return .handled
            }
    }
}
