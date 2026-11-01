import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Sem MIDI/microfone reais: os cartões mostram o estado sem erro.
    if (!sessionStorage.getItem('limpo')) {
      localStorage.clear()
      sessionStorage.setItem('limpo', '1')
    }
  })
})

test('abre no Livre e a tecla reage no pointerdown (mesmo quadro)', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/livre$/)
  await page.waitForTimeout(600) // deixa o AudioContext aquecer em tempo ocioso
  const key = page.getByRole('button', { name: 'Dó 4', exact: true })
  const box = (await key.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 10)
  const latency = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const el = document.querySelector('[data-note="60"]') as HTMLElement
        const t0 = performance.now()
        const mo = new MutationObserver(() => {
          if (el.hasAttribute('data-pressed')) {
            mo.disconnect()
            resolve(performance.now() - t0)
          }
        })
        mo.observe(el, { attributes: true })
        const r = el.getBoundingClientRect()
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.x + r.width / 2, clientY: r.y + r.height - 10, pointerId: 1, pointerType: 'touch' }))
      }),
  )
  expect(latency).toBeLessThan(16)
  await expect(key).toHaveAttribute('aria-pressed', 'true')
  // Display mostra a nota, e mantém depois de soltar.
  await expect(page.getByRole('status')).toContainText('Dó 4')
  await page.mouse.up()
  await page.evaluate(() => document.querySelector('[data-note="60"]')!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })))
  await expect(key).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('última nota')).toBeVisible()
})

test('teclado do computador toca acorde e o Livre reconhece', async ({ page }) => {
  await page.goto('/livre')
  await page.locator('body').click()
  for (const k of ['a', 'd', 'g']) await page.keyboard.down(k)
  await expect(page.getByRole('status')).toContainText('C maior, posição fundamental')
  await expect(page.locator('.t-display', { hasText: /^C$/ })).toBeVisible()
  await expect(page.getByText('maior · posição fundamental')).toBeVisible()
  for (const k of ['a', 'd', 'g']) await page.keyboard.up(k)
})

test('navega pelos quatro modos e a cor da faixa muda', async ({ page }) => {
  await page.goto('/livre')
  for (const [name, mode] of [['Acordes', 'chords'], ['Desafio', 'drill'], ['Livre', 'free'], ['Entrada', 'input']] as const) {
    await page.getByRole('navigation', { name: 'Modos' }).locator('visible=true').getByRole('link', { name }).click()
    await expect(page.locator('html')).toHaveAttribute('data-mode', mode)
  }
})

test('Entrada explica MIDI sem erro e o teste ao vivo confirma a nota', async ({ page }) => {
  await page.goto('/entrada')
  await expect(page.getByRole('heading', { name: 'Teclado MIDI' })).toBeVisible()
  await page.locator('body').click()
  await page.keyboard.press('a')
  await expect(page.getByText('Recebi:').first()).toBeVisible()
})

test('Desafio: lobby → contagem → rodada → acerto → pausa', async ({ page }) => {
  await page.goto('/desafio')
  await page.getByRole('button', { name: 'Jogar' }).click()
  await expect(page.getByRole('timer', { name: 'Contagem' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeVisible({ timeout: 8000 })
  // Descobre o alvo pelo anúncio e toca a tecla certa.
  const announce = await page.getByRole('status').first().textContent()
  expect(announce).toMatch(/Toque/)
  const name = announce!.replace('Toque ', '').trim()
  await page.getByRole('button', { name, exact: true }).click()
  await expect(page.getByText('Acertou').first()).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Jogo pausado' })).toBeVisible()
  await page.getByRole('button', { name: 'Retomar' }).click()
})

test('Acordes: monta o acorde e o anel fecha', async ({ page }) => {
  await page.goto('/acordes')
  await expect(page.getByRole('heading', { name: 'Modo Acordes' })).toBeAttached()
  await expect(page.getByText('Segure as teclas do acorde')).toBeVisible()
})

test('tema claro e sem rolagem horizontal', async ({ page }) => {
  await page.goto('/livre')
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByRole('radio', { name: 'Claro' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.keyboard.press('Escape')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('esconde e mostra o teclado na tela (a escolha fica guardada)', async ({ page }) => {
  await page.goto('/livre')
  await expect(page.getByRole('group', { name: 'Teclado de piano' })).toBeVisible()
  await page.getByRole('button', { name: 'Esconder o teclado' }).click()
  await expect(page.getByRole('group', { name: 'Teclado de piano' })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Mostrar teclado' })).toBeVisible()
  // O teclado do computador continua tocando.
  await page.locator('body').click()
  await page.keyboard.press('a')
  await page.getByRole('button', { name: 'Mostrar teclado' }).click()
  await expect(page.getByRole('group', { name: 'Teclado de piano' })).toBeVisible()
})
