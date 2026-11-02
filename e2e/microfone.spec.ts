import { expect, test, type Page } from '@playwright/test'

const cartao = (page: Page) => page.getByRole('region', { name: 'Microfone' })

test.beforeEach(async ({ page }) => {
  // Microfone simulado: um stream de um AudioContext próprio. A faixa fica exposta para o teste "tirar" o áudio.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('limpo')) {
      localStorage.clear()
      sessionStorage.setItem('limpo', '1')
    }
    navigator.mediaDevices.getUserMedia = async () => {
      const dest = new AudioContext().createMediaStreamDestination()
      ;(window as unknown as { __faixa: MediaStreamTrack }).__faixa = dest.stream.getAudioTracks()[0]
      return dest.stream
    }
  })
})

test('sistema interrompe o microfone: mostra "pausado" e Ativar microfone retoma', async ({ page }) => {
  await page.goto('/entrada')
  await cartao(page).getByRole('button', { name: 'Ativar microfone' }).click()
  await expect(cartao(page).getByRole('button', { name: 'Desligar' })).toBeVisible()

  // O sistema tira o áudio (troca de aba, ligação, bloqueio): a faixa termina.
  await page.evaluate(() => (window as unknown as { __faixa: MediaStreamTrack }).__faixa.dispatchEvent(new Event('ended')))
  await expect(cartao(page).getByText('Microfone pausado')).toBeVisible()
  await expect(page.getByText('O microfone parou')).toBeVisible()
  await expect(page.getByText('Nenhum microfone encontrado')).toHaveCount(0)

  await cartao(page).getByRole('button', { name: 'Ativar microfone' }).click()
  await expect(cartao(page).getByRole('button', { name: 'Desligar' })).toBeVisible()
  await expect(page.getByText('O microfone parou')).toHaveCount(0)
})
