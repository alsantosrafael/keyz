import { expect, test } from '@playwright/test'

// Tutorial já concluído: o convite não atrapalha. Armazenamento limpo a cada teste.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('limpo')) {
      localStorage.clear()
      sessionStorage.setItem('limpo', '1')
      localStorage.setItem('keyz.onboarding.v1', JSON.stringify({ status: 'completed', step: 0, promptDismissed: true, tipsSeen: [] }))
    }
  })
})

/** O app liga o teclado do computador logo depois de montar: espera antes de apertar teclas. */
const pronto = async (page: import('@playwright/test').Page) => {
  await expect(page.getByRole('group', { name: 'Teclado de piano' })).toBeVisible()
  await page.waitForTimeout(800)
}

const resposta = (page: import('@playwright/test').Page) => page.locator('div.text-success', { hasText: /^Resposta: / })

const modo = (page: import('@playwright/test').Page, nome: RegExp) =>
  page.getByRole('navigation', { name: 'Modos' }).getByRole('link', { name: nome }).filter({ visible: true })

test('tocar em outra aba não julga nem consome o Acordes', async ({ page }) => {
  await page.goto('/livre')
  await pronto(page)
  for (const k of ['a', 'd', 'g']) await page.keyboard.down(k)
  await page.waitForTimeout(1800)
  for (const k of ['a', 'd', 'g']) await page.keyboard.up(k)
  await modo(page, /Acordes/).click()
  await expect(page.getByText('Segure as teclas do acorde')).toBeVisible()
  await expect(page.getByText(/Faltou|Nota a mais/)).toHaveCount(0)
  // A sessão está viva: tocar agora, na tela de Acordes, passa a contar.
  for (const k of ['a', 's', 'f']) await page.keyboard.down(k)
  await expect(page.getByText(/Faltou/).first()).toBeVisible({ timeout: 4000 })
})

test('"Mostrar resposta" mostra as teclas e a resposta por extenso', async ({ page }) => {
  await page.goto('/acordes')
  await pronto(page)
  await page.getByRole('button', { name: /Mostrar resposta/ }).click()
  await expect(page.locator('.piano-key[data-state="ghost"]')).toHaveCount(3)
  await expect(resposta(page)).toBeVisible()
  await page.getByRole('button', { name: /Mostrar resposta/ }).click()
  await expect(page.locator('.piano-key[data-state="ghost"]')).toHaveCount(0)
  await expect(resposta(page)).toHaveCount(0)
})

test('segurar notas erradas não dá erro na hora; só com a mão parada', async ({ page }) => {
  await page.goto('/acordes')
  await pronto(page)
  // Dó, Ré e Fá: nunca é maior nem menor.
  for (const k of ['a', 's', 'f']) await page.keyboard.down(k)
  await page.waitForTimeout(700)
  await expect(page.getByText(/Faltou/)).toHaveCount(0)
  await expect(page.getByText(/Faltou/).first()).toBeVisible({ timeout: 2500 })
})
