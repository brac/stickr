import { defineConfig, devices } from '@playwright/test'

// E2E targets the locally-running dev server (reuseExistingServer) per the
// project workflow. The data-writing journey expects that dev server to be
// pointed at a LOCAL Supabase stack (see e2e/README.md) so signups and stickers
// stay disposable; it self-skips when local Supabase isn't reachable.
// Defaults to the locally-running dev server. Set E2E_BASE_URL to point at an
// alternate server — e.g. one started against a local Supabase stack for the
// data-writing journey test.
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
