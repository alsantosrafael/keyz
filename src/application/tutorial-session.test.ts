import { describe, expect, it } from 'vitest'
import { makeChord } from '@keyz/shared'
import { InputHub } from './input-hub'
import { TutorialSession } from './tutorial-session'
import { FakeTime, fakeServices } from './test-kit'

const C_MAJOR = makeChord(0, 'major')
const A_MINOR = makeChord(9, 'minor')

function setup(onPass: () => void = () => {}) {
  const time = new FakeTime()
  const { services, log } = fakeServices(time)
  const hub = new InputHub(time.clock)
  const session = new TutorialSession(hub, services, onPass)
  return { hub, session, time, log }
}

const press = (hub: InputHub, notes: number[]) => notes.forEach((n) => hub.press(n, 'screen'))
const release = (hub: InputHub, notes: number[]) => notes.forEach((n) => hub.release(n, 'screen'))

describe('tutorial de acordes: julgamento', () => {
  it('sem acorde pedido, as teclas não julgam nada', () => {
    const { hub, session } = setup()
    press(hub, [60, 64])
    expect(session.snapshot).toMatchObject({ state: 'idle', matched: 0, total: 0 })
  })

  it('o anel avança conforme as notas certas entram', () => {
    const { hub, session } = setup()
    session.setChord(C_MAJOR)
    press(hub, [60])
    expect(session.snapshot).toMatchObject({ matched: 1, total: 3, state: 'idle' })
    press(hub, [64])
    expect(session.snapshot.matched).toBe(2)
  })

  it('montar o acorde em qualquer oitava fecha e só avança depois de 900 ms', () => {
    let passed = 0
    const { hub, session, time, log } = setup(() => passed++)
    session.setChord(C_MAJOR)
    press(hub, [48, 64, 79])
    expect(session.snapshot.state).toBe('correct')
    expect(session.snapshot.matched).toBe(3)
    expect(log).toContain('cue:correct')
    expect(log).toContain('chord:48,52,55') // voicing do acorde, na faixa grave
    expect(passed).toBe(0)
    time.advance(900)
    expect(passed).toBe(1)
  })

  it('soltar as teclas depois do acorde não cancela o avanço', () => {
    let passed = 0
    const { hub, session, time } = setup(() => passed++)
    session.setChord(C_MAJOR)
    press(hub, [60, 64, 67])
    release(hub, [60, 64, 67])
    time.advance(900)
    expect(passed).toBe(1)
  })

  it('erro mostra a falta e deixa tentar de novo, sem punição', () => {
    const { hub, session } = setup()
    session.setChord(C_MAJOR)
    press(hub, [60, 67])
    release(hub, [60, 67])
    expect(session.snapshot).toMatchObject({ state: 'wrong', hint: 'Faltou Mi' })
    press(hub, [64]) // nova tentativa limpa o erro
    expect(session.snapshot).toMatchObject({ state: 'idle', hint: '' })
  })

  it('nota a mais é apontada pelo nome', () => {
    const { hub, session } = setup()
    session.setChord(C_MAJOR)
    press(hub, [60, 62, 64, 67])
    release(hub, [60, 62, 64, 67])
    expect(session.snapshot.hint).toBe('Tem nota a mais: Ré')
  })

  it('trocar de acorde com as teclas soltas reinicia a pegada e cancela o avanço pendente', () => {
    let passed = 0
    const { hub, session, time } = setup(() => passed++)
    session.setChord(C_MAJOR)
    press(hub, [60, 64, 67])
    release(hub, [60, 64, 67])
    session.setChord(A_MINOR) // o usuário pulou o passo antes do avanço
    time.advance(2000)
    expect(passed).toBe(0)
    expect(session.snapshot).toMatchObject({ state: 'idle', matched: 0, total: 3 })
  })

  it('com as teclas ainda presas, o acorde novo já conta as notas em comum', () => {
    const { hub, session } = setup()
    session.setChord(C_MAJOR)
    press(hub, [60, 64, 67])
    session.setChord(A_MINOR) // A-C-E: C e E são comuns
    expect(session.snapshot.matched).toBe(2)
  })
})
