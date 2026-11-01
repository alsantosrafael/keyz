import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// Aplica os cabeçalhos reais de public/_headers e garante que o app roda sem nenhuma violação de CSP,
// inclusive o microfone (AudioWorklet + Web Worker).
const headers: Record<string, string> = {}
for (const line of readFileSync('public/_headers', 'utf8').split('\n')) {
  const m = line.match(/^\s{2}([\w-]+):\s*(.+)$/)
  if (m && !line.includes('Cache-Control')) headers[m[1].toLowerCase()] = m[2]
}

test.use({
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
})

test('CSP real: app e microfone funcionam sem violações', async ({ page }) => {
  expect(headers['content-security-policy']).toContain("default-src 'self'")
  const problems: string[] = []
  page.on('console', (m) => /content security policy|refused to|permissions-policy/i.test(m.text()) && problems.push(m.text()))
  page.on('pageerror', (e) => problems.push(e.message))
  await page.route('**/*', async (route) => {
    const response = await route.fetch()
    if (route.request().resourceType() === 'document') await route.fulfill({ response, headers: { ...response.headers(), ...headers } })
    else await route.fulfill({ response })
  })
  await page.goto('/entrada')
  await page.getByRole('region', { name: 'Microfone' }).getByRole('button', { name: 'Ativar microfone' }).click()
  await expect(page.getByRole('button', { name: 'Desligar' })).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(1000)
  expect(problems).toEqual([])
})
