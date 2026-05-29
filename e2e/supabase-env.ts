import { readFileSync } from 'node:fs'
import { type Page } from '@playwright/test'

// Shared guards for the data-writing E2E specs. The goal: a write/destructive
// test must run ONLY against a local, disposable Supabase — never the hosted
// project. A blind health probe on :54321 isn't enough, because an unrelated
// local stack (another project) answers it while the dev server under test is
// still pointed at production. So we (1) skip unless the app is configured for a
// loopback backend, and (2) hard-block any Supabase request to a non-loopback
// host as a safety net, so a misconfigured env fails loudly instead of writing
// to remote.

export const LOCAL_SUPABASE_URL =
  process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321'

// Supabase REST/Auth/Functions/Storage API paths (the ones that carry writes).
const SUPABASE_API = /\/(auth|rest|functions|storage)\/v1\//

function isLoopbackHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]'
}

export function isLoopbackUrl(url: string): boolean {
  try {
    return isLoopbackHost(new URL(url).hostname)
  } catch {
    return false
  }
}

// The Supabase URL the dev server is actually configured with, resolved the way
// Vite does: an explicit process env wins, otherwise .env.local then .env.
export function configuredSupabaseUrl(): string | null {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL
  for (const file of ['../.env.local', '../.env']) {
    try {
      const contents = readFileSync(new URL(file, import.meta.url), 'utf8')
      const match = contents.match(/^\s*VITE_SUPABASE_URL\s*=\s*(.+?)\s*$/m)
      if (match) return match[1].replace(/^["']|["']$/g, '')
    } catch {
      // file absent — try the next
    }
  }
  return null
}

// Is the app under test pointed at a loopback Supabase? This is the real
// precondition for a write test — not "does something answer on :54321".
export function appTargetsLocalSupabase(): boolean {
  const url = configuredSupabaseUrl()
  return url != null && isLoopbackUrl(url)
}

// Is a local Supabase API actually up at the expected loopback URL?
export async function localSupabaseReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_SUPABASE_URL}/auth/v1/health`)
    return res.ok
  } catch {
    return false
  }
}

// Safety net: abort any Supabase API request that isn't going to a loopback
// host. With this installed, a dev server misconfigured to point at the hosted
// project can never write — the request is blocked and the test fails loudly
// with a clear reason instead of silently mutating production.
export async function blockNonLocalSupabase(page: Page): Promise<void> {
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (SUPABASE_API.test(url) && !isLoopbackUrl(url)) {
      console.error(
        `[e2e] BLOCKED a Supabase request to non-loopback host "${new URL(url).host}". ` +
          `The dev server under test must point at a local stack (see e2e/README.md).`,
      )
      return route.abort('blockedbyclient')
    }
    return route.continue()
  })
}
