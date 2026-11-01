import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173' },
  webServer: { command: 'bun run build && bun run preview --port 4173', port: 4173, reuseExistingServer: true, timeout: 120000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
  ],
})
