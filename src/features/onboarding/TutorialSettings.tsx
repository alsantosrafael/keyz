import { useNavigate } from 'react-router-dom'
import { TUTORIAL_STEPS } from '@keyz/shared'
import { Button, Section } from '../../ui/controls'
import { useOnboarding, tutorialActions } from '../../state/onboarding'
import { useUi } from '../../state/app'

/** Ajustes › Aprender: retomar, rever ou completar o tutorial a qualquer momento. */
export function TutorialSettings() {
  const progress = useOnboarding((s) => s.progress)
  const navigate = useNavigate()
  const go = (action: () => void) => {
    useUi.getState().setSettingsOpen(false)
    action()
    navigate('/acordes')
  }
  const last = TUTORIAL_STEPS.length

  return (
    <Section title="Aprender">
      {progress.status === 'completed' ? (
        <div className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span>Tutorial de acordes concluído</span>
          <Button onClick={() => go(tutorialActions.restart)}>Rever tutorial</Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              {progress.status === 'started' ? `Tutorial de acordes, passo ${progress.step + 1} de ${last}` : 'Tutorial de acordes, cerca de 1 minuto'}
            </span>
            <Button variant="primary" onClick={() => go(progress.status === 'started' ? tutorialActions.resume : tutorialActions.start)}>
              {progress.status === 'started' ? 'Continuar' : 'Começar'}
            </Button>
          </div>
          {progress.status === 'started' && (
            <div className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-muted">Não quer fazer o resto?</span>
              <Button onClick={tutorialActions.complete}>Marcar como concluído</Button>
            </div>
          )}
        </>
      )}
    </Section>
  )
}
