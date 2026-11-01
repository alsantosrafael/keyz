import KeyzCore
import SwiftUI

enum KeyHighlight {
    case pressed, correct, wrong, target

    var color: Color {
        switch self {
        case .pressed: .blue
        case .correct: .green
        case .wrong: .red
        case .target: .orange
        }
    }
}

/// Teclado de piano simples. Fica rolável quando as teclas não cabem na largura.
struct KeyboardView: View {
    let range: ClosedRange<Int>
    var highlights: [Int: KeyHighlight] = [:]
    var onPress: ((Int) -> Void)?
    var onRelease: ((Int) -> Void)?
    var minWhiteKeyWidth: CGFloat = 30
    var height: CGFloat = 150

    @State private var touching: Set<Int> = []

    private var keys: [KeyboardKey] {
        KeyboardLayout.keys(from: Note(midi: range.lowerBound), to: Note(midi: range.upperBound))
    }

    /// Tecla para onde rolar: a mais grave destacada (se preta, a branca vizinha).
    private var focusKey: Int? {
        guard let lowest = highlights.keys.min() else { return nil }
        return Note(midi: lowest).isBlackKey ? lowest - 1 : lowest
    }

    var body: some View {
        GeometryReader { geometry in
            let whites = keys.filter { !$0.isBlack }
            let width = max(minWhiteKeyWidth, geometry.size.width / CGFloat(max(whites.count, 1)))
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 0) {
                        ForEach(whites, id: \.note.midi) { key in
                            whiteKey(key.note).frame(width: width, height: height).id(key.note.midi)
                        }
                    }
                    .overlay(alignment: .topLeading) {
                        ForEach(keys.filter(\.isBlack), id: \.note.midi) { key in
                            blackKey(key.note)
                                .frame(width: width * 0.6, height: height * 0.62)
                                .offset(x: CGFloat(key.whiteIndex + 1) * width - width * 0.3)
                        }
                    }
                }
                .scrollDisabled(CGFloat(whites.count) * width <= geometry.size.width + 1)
                .onAppear { scroll(proxy, animated: false) }
                .onChange(of: focusKey) { scroll(proxy, animated: true) }
            }
        }
        .frame(height: height)
    }

    private func whiteKey(_ note: Note) -> some View {
        let shape = UnevenRoundedRectangle(bottomLeadingRadius: 5, bottomTrailingRadius: 5)
        return shape
            .fill(highlights[note.midi]?.color ?? .white)
            .overlay(shape.stroke(Color.gray.opacity(0.6), lineWidth: 1))
            .overlay(alignment: .bottom) {
                if note.pitchClass.value == 0 {
                    Text(note.name())
                        .font(.caption2)
                        .foregroundStyle(highlights[note.midi] == nil ? Color.gray : .white)
                        .padding(.bottom, 6)
                }
            }
            .contentShape(shape)
            .gesture(touchGesture(note.midi), including: onPress == nil ? .none : .all)
    }

    private func blackKey(_ note: Note) -> some View {
        let shape = UnevenRoundedRectangle(bottomLeadingRadius: 3, bottomTrailingRadius: 3)
        return shape
            .fill(highlights[note.midi]?.color ?? .black)
            .overlay(shape.stroke(Color.black, lineWidth: 1))
            .contentShape(shape)
            .gesture(touchGesture(note.midi), including: onPress == nil ? .none : .all)
    }

    private func touchGesture(_ midi: Int) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { _ in
                guard !touching.contains(midi) else { return }
                touching.insert(midi)
                onPress?(midi)
            }
            .onEnded { _ in
                touching.remove(midi)
                onRelease?(midi)
            }
    }

    private func scroll(_ proxy: ScrollViewProxy, animated: Bool) {
        guard let focusKey else { return }
        if animated {
            withAnimation { proxy.scrollTo(focusKey, anchor: .center) }
        } else {
            proxy.scrollTo(focusKey, anchor: .center)
        }
    }
}

extension ClosedRange where Bound == Int {
    /// Amplia para oitavas completas, de Dó a Si.
    var wholeOctaves: ClosedRange<Int> {
        (lowerBound / 12 * 12)...(upperBound / 12 * 12 + 11)
    }
}
