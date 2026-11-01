import KeyzCore
import SwiftUI

struct StaffNote: Identifiable {
    let note: Note
    var color: Color = .primary
    var label: String?

    var id: Int { note.midi }
}

/// Pauta dupla do piano (clave de sol em cima, clave de fá embaixo).
/// Dó central e acima vão na clave de sol.
struct GrandStaffView: View {
    var notes: [StaffNote]
    var accidental: PitchClass.Accidental = .sharp
    /// Desenha as notas juntas na mesma vertical, como um acorde (passe-as da mais grave à mais aguda).
    var stacked = false

    var body: some View {
        Canvas { context, size in
            // A altura comporta 2 pautas, o espaço entre elas e linhas suplementares.
            let space = size.height / 18
            let left = space * 0.5
            let right = size.width - space * 0.5

            /// Altura de um passo diatônico (meio espaço) a partir da linha de baixo de cada pauta.
            func y(_ step: CGFloat, _ clef: Clef) -> CGFloat {
                (clef == .treble ? 7 * space : 15 * space) - step * space / 2
            }

            func line(from start: CGPoint, to end: CGPoint, width: CGFloat = 1, shading: GraphicsContext.Shading = .foreground) {
                var path = Path()
                path.move(to: start)
                path.addLine(to: end)
                context.stroke(path, with: shading, lineWidth: width)
            }

            for clef in [Clef.treble, .bass] {
                for index in 0..<5 {
                    let lineY = y(CGFloat(index * 2), clef)
                    line(from: CGPoint(x: left, y: lineY), to: CGPoint(x: right, y: lineY))
                }
            }
            line(from: CGPoint(x: left, y: y(8, .treble)), to: CGPoint(x: left, y: y(0, .bass)), width: 2)

            context.draw(Text("𝄞").font(.system(size: space * 7.2)), at: CGPoint(x: left + space * 1.8, y: y(3, .treble)))
            context.draw(Text("𝄢").font(.system(size: space * 3.8)), at: CGPoint(x: left + space * 1.8, y: y(5.5, .bass)))

            var previous: (placement: StaffPlacement, shifted: Bool)?
            for (index, staffNote) in notes.enumerated() {
                let placement = StaffPlacement(note: staffNote.note, accidental: accidental)
                var x = size.width * 0.5 + CGFloat(index) * space * 5
                if stacked {
                    // Em intervalos de segunda, uma das cabeças vai para o lado para não se sobrepor.
                    let isSecond = previous.map { $0.placement.clef == placement.clef && placement.step - $0.placement.step == 1 } ?? false
                    let shifted = isSecond && !(previous?.shifted ?? false)
                    x = size.width * 0.5 + (shifted ? space * 1.3 : 0)
                    previous = (placement, shifted)
                }
                let noteY = y(CGFloat(placement.step), placement.clef)
                let shading = GraphicsContext.Shading.color(staffNote.color)

                let ledgerSteps: [Int] = placement.step < 0
                    ? Array(stride(from: -2, through: placement.step, by: -2))
                    : (placement.step > 8 ? Array(stride(from: 10, through: placement.step, by: 2)) : [])
                for step in ledgerSteps {
                    let ledgerY = y(CGFloat(step), placement.clef)
                    line(from: CGPoint(x: x - space * 1.2, y: ledgerY), to: CGPoint(x: x + space * 1.2, y: ledgerY))
                }

                let head = Path(ellipseIn: CGRect(x: -space * 0.65, y: -space * 0.48, width: space * 1.3, height: space * 0.96))
                    .applying(CGAffineTransform(rotationAngle: -.pi / 9))
                    .applying(CGAffineTransform(translationX: x, y: noteY))
                context.fill(head, with: shading)

                // Haste para cima nas notas abaixo da linha do meio, para baixo nas demais. Acordes ficam sem haste.
                if stacked {
                } else if placement.step < 4 {
                    line(from: CGPoint(x: x + space * 0.6, y: noteY), to: CGPoint(x: x + space * 0.6, y: noteY - space * 3.5), width: 1.5, shading: shading)
                } else {
                    line(from: CGPoint(x: x - space * 0.6, y: noteY), to: CGPoint(x: x - space * 0.6, y: noteY + space * 3.5), width: 1.5, shading: shading)
                }

                if let sign = placement.accidental {
                    // No acorde, as alterações se alternam em duas colunas para não colidirem.
                    let signX = stacked ? size.width * 0.5 - space * (1.7 + CGFloat(index % 2) * 1.4) : x - space * 1.7
                    context.draw(
                        Text(sign == .sharp ? "♯" : "♭").font(.system(size: space * 2.2)).foregroundStyle(staffNote.color),
                        at: CGPoint(x: signX, y: noteY - (sign == .flat ? space * 0.3 : 0))
                    )
                }

                if let label = staffNote.label, !stacked {
                    context.draw(
                        Text(label).font(.caption.bold()).foregroundStyle(staffNote.color),
                        at: CGPoint(x: x, y: size.height - space * 0.8)
                    )
                }
            }
        }
        .accessibilityLabel(notes.map { $0.note.solfegeName(preferring: accidental) }.joined(separator: ", "))
    }
}
