import CoreMIDI
import Foundation

/// Escuta todas as fontes MIDI conectadas (USB, Bluetooth, rede) e reporta note on/off na main thread.
final class MIDIInput {
    var onNoteOn: ((Int) -> Void)?
    var onNoteOff: ((Int) -> Void)?
    var onSourcesChanged: (([String]) -> Void)?

    private var client = MIDIClientRef()
    private var port = MIDIPortRef()
    private var connected: [MIDIEndpointRef] = []

    func start() {
        guard client == 0 else { return }
        MIDIClientCreateWithBlock("Keyz" as CFString, &client) { [weak self] notification in
            guard notification.pointee.messageID == .msgSetupChanged else { return }
            DispatchQueue.main.async { self?.connectAllSources() }
        }
        MIDIInputPortCreateWithProtocol(client, "Keyz Input" as CFString, ._1_0, &port) { [weak self] list, _ in
            self?.handle(list)
        }
        connectAllSources()
    }

    private func connectAllSources() {
        for source in connected { MIDIPortDisconnectSource(port, source) }
        connected = (0..<MIDIGetNumberOfSources()).map(MIDIGetSource)
        for source in connected { MIDIPortConnectSource(port, source, nil) }
        onSourcesChanged?(connected.map(Self.displayName))
    }

    private static func displayName(of endpoint: MIDIEndpointRef) -> String {
        var name: Unmanaged<CFString>?
        guard MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &name) == noErr,
              let name else { return "Dispositivo MIDI" }
        return name.takeRetainedValue() as String
    }

    /// Lê pacotes Universal MIDI Packet com mensagens MIDI 1.0 (tipo 0x2).
    private func handle(_ list: UnsafePointer<MIDIEventList>) {
        var events: [(isOn: Bool, note: Int)] = []
        for packet in list.unsafeSequence() {
            let count = Int(packet.pointee.wordCount)
            withUnsafeBytes(of: packet.pointee.words) { raw in
                let words = raw.bindMemory(to: UInt32.self)
                var index = 0
                while index < count {
                    let word = words[index]
                    let messageType = Int(word >> 28)
                    if messageType == 0x2 {
                        let status = (word >> 16) & 0xF0
                        let note = Int((word >> 8) & 0x7F)
                        let velocity = word & 0x7F
                        if status == 0x90, velocity > 0 {
                            events.append((true, note))
                        } else if status == 0x80 || status == 0x90 {
                            events.append((false, note))
                        }
                    }
                    index += Self.wordsPerMessage[messageType]
                }
            }
        }
        guard !events.isEmpty else { return }
        DispatchQueue.main.async { [weak self] in
            for event in events {
                if event.isOn { self?.onNoteOn?(event.note) } else { self?.onNoteOff?(event.note) }
            }
        }
    }

    private static let wordsPerMessage = [1, 1, 1, 2, 2, 4, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4]
}
