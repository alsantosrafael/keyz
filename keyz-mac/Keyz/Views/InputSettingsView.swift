import SwiftUI
#if os(iOS)
import CoreAudioKit
#endif

/// Fontes de notas: teclado MIDI, microfone e teclado na tela.
struct InputSettingsView: View {
    @Environment(NoteInputHub.self) private var hub
    @State private var showBluetooth = false

    var body: some View {
        Form {
            Section {
                if hub.midiSources.isEmpty {
                    Label("Nenhum dispositivo MIDI conectado", systemImage: "cable.connector.slash")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(hub.midiSources, id: \.self) { name in
                        Label(name, systemImage: "pianokeys")
                    }
                }
                #if os(iOS)
                Button("Parear teclado Bluetooth MIDI", systemImage: "dot.radiowaves.left.and.right") { showBluetooth = true }
                #endif
            } header: {
                Text("Teclado MIDI")
            } footer: {
                Text("Conecte o teclado pela saída USB/MIDI. Ele é detectado automaticamente — o mais preciso, e o único que reconhece acordes inteiros.")
            }

            Section {
                Toggle("Usar microfone", isOn: Binding(
                    get: { hub.microphoneEnabled },
                    set: { enabled in Task { await hub.setMicrophoneEnabled(enabled) } }
                ))
                if let error = hub.microphoneError {
                    Text(error).foregroundStyle(.red)
                }
                if hub.microphoneEnabled {
                    CaptureQualityView(frame: hub.microphoneFrame)
                    Slider(value: Binding(
                        get: { hub.microphoneSensitivity },
                        set: { hub.setMicrophoneSensitivity($0) }
                    ), in: 0...1) {
                        Text("Sensibilidade")
                    } minimumValueLabel: {
                        Image(systemName: "speaker.wave.1")
                    } maximumValueLabel: {
                        Image(systemName: "speaker.wave.3")
                    }
                    Button("Recalibrar ruído do ambiente") { hub.recalibrateMicrophone() }
                }
            } header: {
                Text("Microfone")
            } footer: {
                Text("Funciona com qualquer piano, inclusive acústico, mas reconhece uma nota por vez. Se captar barulhos, diminua a sensibilidade. Para recalibrar, deixe a sala em silêncio por 2 segundos e toque o botão. Teste a captação no modo Livre.")
            }

            Section("Teclado na tela") {
                Text("Sempre ativo: toque nas teclas desenhadas em qualquer modo.")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        #if os(iOS)
        .sheet(isPresented: $showBluetooth) { BluetoothMIDIView() }
        #endif
    }
}

#if os(iOS)
/// Tela do sistema para encontrar e conectar teclados Bluetooth MIDI.
struct BluetoothMIDIView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UINavigationController {
        UINavigationController(rootViewController: CABTMIDICentralViewController())
    }

    func updateUIViewController(_ controller: UINavigationController, context: Context) {}
}
#endif
