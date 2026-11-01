import SwiftUI

@main
struct KeyzApp: App {
    @State private var hub = NoteInputHub()

    var body: some Scene {
        WindowGroup {
            RootView().environment(hub)
        }
        .defaultSize(width: 900, height: 780)
    }
}

struct RootView: View {
    var body: some View {
        TabView {
            mode("Acordes", systemImage: "pianokeys") { ChordPracticeView() }
            mode("Desafio", systemImage: "timer") { NoteDrillView() }
            mode("Livre", systemImage: "waveform") { FreePlayView() }
            mode("Entrada", systemImage: "gearshape") { InputSettingsView() }
        }
        .modifier(ComputerKeyboardInput())
    }

    private func mode(_ title: String, systemImage: String, @ViewBuilder content: () -> some View) -> some View {
        NavigationStack {
            content()
                .navigationTitle(title)
                .toolbar {
                    ToolbarItem(placement: .automatic) { MicrophoneIndicator() }
                }
        }
        .tabItem { Label(title, systemImage: systemImage) }
    }
}
