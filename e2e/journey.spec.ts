import { test, expect } from '@playwright/test'

// Full v1 "definition of done" loop, end to end against a real backend:
//   sign up → onboard (create household) → define a chore + reward →
//   award stickers → board fills → redeem → chapter archives (board resets).
//
// This writes real rows, so it self-skips unless a LOCAL Supabase stack is
// reachable (see e2e/README.md). Never point it at the hosted project.

// Defaults to the standard local Supabase API port; override with
// E2E_SUPABASE_URL when the stack runs on a non-default port.
const LOCAL_SUPABASE_URL =
  process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321'

async function localSupabaseUp(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_SUPABASE_URL}/auth/v1/health`)
    return res.ok
  } catch {
    return false
  }
}

test.describe('core loop: award → board → redeem', () => {
  test.beforeAll(async () => {
    test.skip(
      !(await localSupabaseUp()),
      'Local Supabase not reachable on 127.0.0.1:54321 — see e2e/README.md',
    )
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

    // --- Onboarding: create a household ---
    await page.waitForURL(/\/onboarding$/)
    await page.locator('#household').fill('The E2E Household')
    await page.locator('#kid').fill('Pip')
    await page.locator('#parent').fill('Alex')
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
})
