import { test, expect } from '@playwright/test'
import {
  appTargetsLocalSupabase,
  blockNonLocalSupabase,
  localSupabaseReachable,
} from './supabase-env'

// Full v1 "definition of done" loop, end to end against a real backend:
//   sign up → onboard (create household) → define a chore + reward →
//   award stickers → board fills → redeem → chapter archives (board resets).
//
// This writes real rows, so it self-skips unless the app under test is pointed
// at a LOCAL Supabase stack (see e2e/README.md). The skip is gated on the dev
// server's *configured* backend being loopback — not just "something answers on
// :54321" — and blockNonLocalSupabase() is a hard net so a misconfigured env can
// never write to the hosted project.

test.describe('core loop: award → board → redeem', () => {
  test.beforeAll(async () => {
    test.skip(
      !appTargetsLocalSupabase(),
      'Dev server is not configured for a local Supabase (VITE_SUPABASE_URL is not loopback) — see e2e/README.md',
    )
    test.skip(
      !(await localSupabaseReachable()),
      'Local Supabase not reachable on 127.0.0.1:54321 — see e2e/README.md',
    )
  })

  test.beforeEach(async ({ page }) => {
    await blockNonLocalSupabase(page)
  })

  test('sign up, set up a chore + reward, award stickers, then redeem', async ({
    page,
  }) => {
    const email = `e2e-${Date.now()}@example.com`
    const password = 'sticker-test-123'

    // --- Sign up (email confirmations are disabled locally) ---
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Sign up' }).click()
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(password)
    await page.locator('form').getByRole('button', { name: 'Sign up' }).click()

    // --- Onboarding: walk the create-household wizard ---
    await page.waitForURL(/\/onboarding$/)
    // Step 1 — household + you.
    await page.locator('#household').fill('The E2E Household')
    await page.locator('#parent').fill('Alex')
    await page.getByRole('button', { name: 'Next' }).click()
    // Step 2 — kid + age band.
    await page.locator('#kid').fill('Pip')
    await page.getByRole('button', { name: '2–3', exact: true }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    // Step 3 — chores preselected for the band; accept the defaults.
    await page.getByRole('button', { name: 'Next' }).click()
    // Step 4 — reward (prefilled); submit.
    await page.getByRole('button', { name: 'Create household' }).click()

    // Lands on the board.
    await page.waitForURL((url) => url.pathname === '/')
    await expect(page.getByText("Pip's board")).toBeVisible()
    await expect(page.getByTestId('sticker')).toHaveCount(0)

    // --- Setup: add a +3 chore ---
    await page.goto('/setup/chores')
    await page.getByRole('button', { name: 'Add a chore' }).click()
    await page.locator('#chore-name').fill('Tidy room')
    await page.getByRole('button', { name: '+3', exact: true }).click()
    await page.getByRole('button', { name: 'Add chore' }).click()
    await expect(page.getByText('Tidy room')).toBeVisible()

    // --- Setup: add a reward unlocked at 3 stickers ---
    await page.goto('/setup/rewards')
    await page.getByRole('button', { name: 'Add a reward' }).click()
    await page.locator('#reward-name').fill('Ice cream')
    await page.locator('#reward-threshold').fill('3')
    await page.getByRole('button', { name: 'Add reward' }).click()
    await expect(page.getByText('Ice cream')).toBeVisible()

    // --- Award: one tap of the +3 chore fills the board with 3 stickers ---
    await page.goto('/')
    await expect(page.getByTestId('sticker-board')).toBeVisible()
    await page.getByRole('button', { name: /Tidy room/ }).click()
    await expect(page.getByTestId('sticker')).toHaveCount(3)

    // --- Claim: the progress bar surfaces the unlocked reward ---
    const claim = page.getByRole('button', { name: /Claim/ })
    await expect(claim).toBeVisible()
    await claim.click()

    // --- Redeem in the bottom sheet ---
    const sheet = page.getByRole('dialog', { name: 'Claim a reward' })
    await sheet.getByRole('button', { name: /Ice cream/ }).click()
    await sheet.getByRole('button', { name: 'Claim "Ice cream"' }).click()

    // --- Chapter archives: fresh board, zero stickers carried (exact threshold) ---
    await expect(page.getByText('"Ice cream" claimed!')).toBeVisible()
    await expect(page.getByTestId('sticker')).toHaveCount(0)
  })

  test('multiple kids: add, switch, award independently', async ({
    page,
  }) => {
    const email = `e2e-mk-${Date.now()}@example.com`

    // Sign up + onboard. The wizard seeds the band's starter chores; we award the
    // first one ("Put toys in bin" for the 2–3 band) below.
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Sign up' }).click()
    await page.locator('#email').fill(email)
    await page.locator('#password').fill('sticker-test-123')
    await page.locator('form').getByRole('button', { name: 'Sign up' }).click()

    await page.waitForURL(/\/onboarding$/)
    // Step 1 — household + you.
    await page.locator('#household').fill('Two-Kid Household')
    await page.locator('#parent').fill('Alex')
    await page.getByRole('button', { name: 'Next' }).click()
    // Step 2 — kid + age band.
    await page.locator('#kid').fill('Pip')
    await page.getByRole('button', { name: '2–3', exact: true }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    // Step 3 — chores preselected for the band; accept the defaults.
    await page.getByRole('button', { name: 'Next' }).click()
    // Step 4 — reward (prefilled); submit.
    await page.getByRole('button', { name: 'Create household' }).click()
    await page.waitForURL((url) => url.pathname === '/')

    // One kid → no switcher yet.
    await expect(
      page.getByRole('tablist', { name: 'Choose kid' }),
    ).toHaveCount(0)

    // Add a second kid.
    await page.goto('/setup/kids')
    await page.getByRole('button', { name: 'Add a kid' }).click()
    await page.locator('#kid-name').fill('Mo')
    await page.getByRole('button', { name: 'Add kid' }).click()
    await expect(page.getByText('Mo')).toBeVisible()

    // Home now shows the kid switcher.
    await page.goto('/')
    const tabs = page.getByRole('tablist', { name: 'Choose kid' })
    await expect(tabs.getByRole('tab', { name: 'Pip' })).toBeVisible()
    await expect(tabs.getByRole('tab', { name: 'Mo' })).toBeVisible()

    // Award to Pip (selected by default).
    await page.getByRole('button', { name: /Put toys in bin/ }).click()
    await expect(page.getByTestId('sticker')).toHaveCount(1)

    // Switch to Mo — independent, empty board — then award.
    await tabs.getByRole('tab', { name: 'Mo' }).click()
    await expect(page.getByTestId('sticker')).toHaveCount(0)
    await page.getByRole('button', { name: /Put toys in bin/ }).click()
    await expect(page.getByTestId('sticker')).toHaveCount(1)

    // Back to Pip — its sticker persisted.
    await tabs.getByRole('tab', { name: 'Pip' }).click()
    await expect(page.getByTestId('sticker')).toHaveCount(1)
  })
})
