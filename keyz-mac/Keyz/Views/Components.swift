import KeyzCore
import SwiftUI

/// Faixa colorida de acerto/erro.
struct ResultBanner: View {
    enum Kind {
        case success, failure, warning

        var color: Color {
            switch self {
            case .success: .green
            case .failure: .red
            case .warning: .orange
            }
        }

        var symbol: String {
            switch self {
            case .success: "checkmark.circle.fill"
            case .failure: "xmark.circle.fill"
            case .warning: "clock.badge.exclamationmark.fill"
            }
        }
    }

    let kind: Kind
    let title: String
    var subtitle: String?

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: kind.symbol).font(.title)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.title3.bold())
                if let subtitle { Text(subtitle).font(.subheadline) }
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(.white)
        .padding()
        .background(kind.color.gradient, in: RoundedRectangle(cornerRadius: 14))
    }
}

/// Cartão com fundo neutro para a pauta.
struct StaffCard: View {
    var notes: [StaffNote]
    var accidental: PitchClass.Accidental = .sharp
    var stacked = false
    var height: CGFloat = 200

    var body: some View {
        GrandStaffView(notes: notes, accidental: accidental, stacked: stacked)
            .frame(height: height)
            .frame(maxWidth: 420)
            .padding(.horizontal)
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 14))
    }
}

/// Barra horizontal simples de 0 a 1.
struct MeterBar: View {
    let value: Double
    var tint: Color = .accentColor

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Capsule().fill(.quaternary)
                Capsule().fill(tint.gradient)
                    .frame(width: geometry.size.width * max(0, min(1, value)))
            }
        }
        .frame(height: 10)
        .animation(.linear(duration: 0.08), value: value)
    }
}

extension Note {
    /// Ex.: "Dó♯4 (C#4)".
    func fullName(_ accidental: PitchClass.Accidental) -> String {
        "\(solfegeName(preferring: accidental)) (\(name(preferring: accidental)))"
    }
}

extension Double {
    var seconds: String {
        "\(formatted(.number.precision(.fractionLength(1)))) s"
    }
}
