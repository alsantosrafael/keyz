import { expect, test } from '@playwright/test'

// Cada teste começa com o armazenamento limpo (o padrão de app.spec.ts).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('limpo')) {
      localStorage.clear()
      sessionStorage.setItem('limpo', '1')
    }
  })
})

test('convite no primeiro uso; "Agora não" fica salvo e não volta', async ({ page }) => {
  await page.goto('/livre')
  const convite = page.getByRole('complementary', { name: 'Convite para o tutorial' })
  await expect(convite).toBeVisible()
  await convite.getByRole('button', { name: 'Agora não' }).click()
  await expect(convite).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('complementary', { name: 'Convite para o tutorial' })).toHaveCount(0)
  // Continua disponível em Ajustes › Aprender.
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Ajustes' }).getByText('Tutorial de acordes, cerca de 1 minuto')).toBeVisible()
})

test('tutorial de acordes: ouvir, montar Dó maior e Lá menor, concluir; depois não volta', async ({ page }) => {
  await page.goto('/livre')
  await page.getByRole('button', { name: 'Começar' }).click()

  // Passo de escuta segue sozinho.
  await expect(page.getByRole('heading', { name: 'Um acorde são notas tocadas juntas' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Monte Dó maior' })).toBeVisible({ timeout: 6000 })

  // Dó maior: C (a), E (d), G (g) juntos.
  for (const k of ['a', 'd', 'g']) await page.keyboard.down(k)
  await expect(page.getByText('Acertou', { exact: true })).toBeVisible()
  for (const k of ['a', 'd', 'g']) await page.keyboard.up(k)

  // Lá menor: A (h), C (a), E (d).
  await expect(page.getByRole('heading', { name: 'Agora, Lá menor' })).toBeVisible({ timeout: 4000 })
  for (const k of ['h', 'a', 'd']) await page.keyboard.down(k)
  await expect(page.getByText('Acertou', { exact: true })).toBeVisible()
  for (const k of ['h', 'a', 'd']) await page.keyboard.up(k)

  // Último passo: exemplos dos outros modos e conclusão.
  await expect(page.getByRole('heading', { name: 'Você tocou dois acordes' })).toBeVisible({ timeout: 4000 })
  await page.getByRole('button', { name: 'Concluir tutorial' }).click()
  await expect(page.getByRole('heading', { name: 'Você tocou dois acordes' })).toHaveCount(0)

  // Concluído: não volta sozinho, e Ajustes oferece rever.
  await page.reload()
  await expect(page.getByRole('complementary', { name: 'Convite para o tutorial' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ajustes', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Ajustes' }).getByRole('button', { name: 'Rever tutorial' })).toBeVisible()
})

test('sair no meio guarda o passo; voltar ao Acordes oferece continuar, sem reiniciar', async ({ page }) => {
  await page.goto('/livre')
  await page.getByRole('button', { name: 'Começar' }).click()
  await expect(page.getByRole('heading', { name: 'Monte Dó maior' })).toBeVisible({ timeout: 6000 })
  await page.getByRole('button', { name: 'Guardar e sair (o progresso fica salvo)' }).click()

  await page.getByRole('link', { name: 'Acordes' }).first().click()
  await expect(page.getByText('Tutorial pausado no passo 2 de 4')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('heading', { name: 'Monte Dó maior' })).toBeVisible()
})

test('completar a qualquer minuto encerra o tutorial de onde estiver', async ({ page }) => {
  await page.goto('/livre')
  await page.getByRole('button', { name: 'Começar' }).click()
  await expect(page.getByRole('heading', { name: 'Monte Dó maior' })).toBeVisible({ timeout: 6000 })
  await page.getByRole('button', { name: 'Completar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Monte Dó maior' })).toHaveCount(0)
  await page.reload()
  await page.getByRole('link', { name: 'Acordes' }).first().click()
  await expect(page.getByText('Tutorial pausado')).toHaveCount(0)
})
