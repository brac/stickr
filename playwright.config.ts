import { defineConfig, devices } from '@playwright/test'

// E2E targets the locally-running dev server (reuseExistingServer) per the
// project workflow. The data-writing journey expects that dev server to be
// pointed at a LOCAL Supabase stack (see e2e/README.md) so signups and stickers
// stay disposable; it self-skips when local Supabase isn't reachable.
// Defaults to the locally-running dev server. Set E2E_BASE_URL to point at an
// alternate server — e.g. one started against a local Supabase stack for the
// data-writing journey test.
//
// `npm run e2e:local` sets E2E_LOCAL=1 plus loopback VITE_SUPABASE_* vars. In
// that mode we start our OWN dev server on a dedicated port that inherits those
// vars, instead of reusing whatever the user's :5173 server happens to target.
// That makes the full write/destructive suite runnable without hand-editing
// .env.local — and guarantees it can never reach the hosted project.
const isLocal = !!process.env.E2E_LOCAL
const LOCAL_PORT = 5174
const defaultURL = isLocal
  ? `http://localhost:${LOCAL_PORT}`
  : 'http://localhost:5173'
const baseURL = process.env.E2E_BASE_URL ?? defaultURL

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
    // Local mode starts a fresh server bound to LOCAL_PORT so it inherits the
    // loopback VITE_SUPABASE_* env from `npm run e2e:local` (never reusing the
    // user's prod-pointed :5173). Otherwise reuse the running dev server.
    command: isLocal
      ? `vite --port ${LOCAL_PORT} --strictPort`
      : 'npm run dev',
    url: baseURL,
    reuseExistingServer: !isLocal,
    timeout: 120_000,
  },
})
