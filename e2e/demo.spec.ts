import { test, expect } from '@playwright/test'

// The /demo board is a client-side fixture: it lives outside auth, renders a
// pre-seeded board, and writes nothing. These checks run logged-out against any
// environment (like smoke.spec) — no Supabase round-trip required.

test('logged-out visitor sees a populated demo board', async ({ page }) => {
  await page.goto('/demo')

  await expect(page).toHaveURL(/\/demo$/)
  await expect(page.getByRole('heading', { name: 'Maya' })).toBeVisible()
  await expect(page.getByText('Demo board — nothing is saved')).toBeVisible()

  const stickers = page.getByTestId('sticker')
  await expect(stickers).toHaveCount(18)
  await expect(page.getByText('Movie night')).toBeVisible()
})

test('tapping a chore awards a sticker with no network write', async ({ page }) => {
  await page.goto('/demo')
  await expect(page.getByTestId('sticker')).toHaveCount(18)

  // Capture any mutating call to the Supabase data or storage layer during the
  // tap. "Writes nothing" means more than "no REST POST" — cover every mutating
  // verb and the storage surface too.
  const writes: string[] = []
  page.on('request', (req) => {
    const method = req.method()
    const url = req.url()
    const mutating = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
    if (mutating && (url.includes('/rest/v1/') || url.includes('/storage/v1/'))) {
      writes.push(`${method} ${url}`)
    }
  })

  await page.getByRole('button', { name: 'Brushed teeth' }).click()

  await expect(page.getByTestId('sticker')).toHaveCount(19)
  expect(writes).toEqual([])
})

test('demo awards reset on reload (nothing persists)', async ({ page }) => {
  await page.goto('/demo')
  await page.getByRole('button', { name: 'Got dressed' }).click()
  await expect(page.getByTestId('sticker')).toHaveCount(19)

  await page.reload()
  await expect(page.getByTestId('sticker')).toHaveCount(18)
})

test('the CTA routes a visitor into the signup funnel', async ({ page }) => {
  await page.goto('/demo')

  await page.getByRole('link', { name: 'Create your household' }).click()

  // Logged out, /onboarding is gated by RequireAuth and redirects to /signin, so
  // the visitor lands on the sign-in surface. Assert the real form rendered, not
  // just the URL, so a redirect to an error page wouldn't pass.
  await expect(page).toHaveURL(/\/(onboarding|signin)$/)
  await expect(page.getByRole('heading', { name: 'Stickr' })).toBeVisible()
})
