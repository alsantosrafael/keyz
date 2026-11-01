# Keyz (macOS / iOS)

App de prática de piano/teclado para iPhone, iPad e Mac (SwiftUI).

## Modos
- **Acordes**: um acorde maior/menor aparece; toque e segure. O app diz se acertou ou o que faltou/sobrou.
- **Desafio**: uma nota aparece (nome e/ou partitura) e é preciso tocá-la dentro do tempo. Níveis Fácil, Médio e Avançado com configuração própria, tudo ajustável. Depois de cada nota mostra a resposta na pauta e no teclado.
- **Livre**: toque qualquer nota e veja o que foi reconhecido, com afinação (cents), volume e confiança — para testar a captação.
- **Entrada**: dispositivos MIDI, microfone e teclado na tela.

## Entradas
- **MIDI** (USB/Bluetooth): preciso e reconhece acordes. Detectado automaticamente.
- **Microfone**: qualquer piano, uma nota por vez (detector YIN em `KeyzCore`).
- **Teclado na tela**: sempre ativo.

## Estrutura
- `KeyzCore/` — pacote Swift com a lógica (acordes, notas, detector de altura, desafio, partitura). Testes: `cd KeyzCore && swift test`.
- `Keyz/` — app SwiftUI (`Input/`, `Session/`, `Views/`).
- `Keyz.xcodeproj` — abra no Xcode, escolha "My Mac" ou um iPhone/iPad e rode (⌘R).

Para rodar no iPhone/iPad: em *Signing & Capabilities*, escolha seu Team (Apple ID).

## Compilar pela linha de comando
A partir de `keyz-mac/`:
```sh
xcodebuild -project Keyz.xcodeproj -scheme Keyz -destination 'platform=macOS' -derivedDataPath xcode build
open xcode/Build/Products/Debug/Keyz.app
```
