import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('limpo')) {
      localStorage.clear()
      localStorage.setItem('keyz.settings.v1', JSON.stringify({ welcomeSeen: true }))
      sessionStorage.setItem('limpo', '1')
    }
  })
})

test('reporta um problema sem conta no GitHub e mostra o número da issue', async ({ page }) => {
  let sent: Record<string, unknown> | null = null
  await page.route('**/api/reportar', async (route) => {
    sent = route.request().postDataJSON()
    await route.fulfill({ json: { ok: true, number: 77 } })
  })
  await page.goto('/livre')
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.getByRole('button', { name: /Reportar um problema/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Reportar ou sugerir' })
  await expect(dialog).toBeVisible()

  // Campo obrigatório vazio: avisa e não envia.
  await dialog.getByRole('button', { name: 'Enviar' }).click()
  await expect(dialog.getByText(/Escreva um título|Preencha/)).toBeVisible()
  expect(sent).toBeNull()

  await dialog.getByLabel('Título curto').fill('Tecla trava')
  await dialog.getByLabel('O que aconteceu').fill('Travou ao tocar Dó')
  await dialog.getByRole('button', { name: 'Enviar' }).click()
  await expect(dialog.getByText('Seu relatório virou a issue nº 77.')).toBeVisible()
  expect(sent).toMatchObject({ type: 'bug', title: 'Tecla trava', website: '' })
})

test('erro do servidor mantém o texto para tentar de novo', async ({ page }) => {
  await page.route('**/api/reportar', (route) => route.fulfill({ status: 503, json: { error: 'Envio indisponível no momento.' } }))
  await page.goto('/livre')
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await page.getByRole('button', { name: /Reportar um problema/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Reportar ou sugerir' })
  await dialog.getByLabel('Título curto').fill('Teste')
  await dialog.getByLabel('O que aconteceu').fill('Algo')
  await dialog.getByRole('button', { name: 'Enviar' }).click()
  await expect(dialog.getByText('Envio indisponível no momento.')).toBeVisible()
  await expect(dialog.getByLabel('O que aconteceu')).toHaveValue('Algo')
})
