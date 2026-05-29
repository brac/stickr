import { test, expect } from '@playwright/test'
import {
  appTargetsLocalSupabase,
  blockNonLocalSupabase,
  localSupabaseReachable,
} from './supabase-env'

// Guided onboarding (Feature 18): the create-household path is a 4-step wizard
// that seeds the chosen chores AND a reward tier, so a fresh signup lands on a
// working board — no trip to /setup, and no lone "Good job" placeholder chore.
//
// Like journey.spec.ts this writes real rows, so it self-skips unless the app
// under test is pointed at a LOCAL Supabase stack, and blockNonLocalSupabase()
// is a hard net so a misconfigured env can never write to the hosted project.

test.describe('guided onboarding: wizard seeds chores + reward', () => {
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

  test('signup → walk the wizard → board has picked chores + reward, no stray "Good job"', async ({
    page,
  }) => {
    const email = `e2e-onboard-${Date.now()}@example.com`
    const password = 'sticker-test-123'

    // --- Sign up (email confirmations are disabled locally) ---
    await page.goto('/signin')
    await page.getByRole('button', { name: 'Sign up' }).click()
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(password)
    await page.locator('form').getByRole('button', { name: 'Sign up' }).click()

    // --- Onboarding wizard ---
    await page.waitForURL(/\/onboarding$/)

    // Step 1 — household + you.
    await page.locator('#household').fill('The Onboarding Household')
    await page.locator('#parent').fill('Alex')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 2 — kid + age band. Picking "2–3" preselects that band's starter chores.
    await page.locator('#kid').fill('Pip')
    await page.getByRole('button', { name: '2–3', exact: true }).click()
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 3 — chores come preselected for the band; accept the defaults.
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 4 — reward (prefilled). Set explicit values, then submit.
    await page.locator('#reward-name').fill('Big reward')
    await page.locator('#reward-threshold').fill('10')
    await page.getByRole('button', { name: 'Create household' }).click()

    // --- Lands on the board ---
    await page.waitForURL((url) => url.pathname === '/')
    await expect(page.getByText("Pip's board")).toBeVisible()
    // The wizard seeds chores but zero stickers.
    await expect(page.getByTestId('sticker')).toHaveCount(0)

    // At least one of the band's default-selected chores is awardable on the board.
    // (defaultSelectedNames('2-3') → first four of the 2–3 catalog.)
    await expect(
      page.getByRole('button', { name: /Put toys in bin/ }),
    ).toBeVisible()

    // The placeholder "Good job" chore must NOT have been seeded.
    await expect(
      page.getByRole('button', { name: /Good job/ }),
    ).toHaveCount(0)

    // The reward tier was created during onboarding and shows on the rewards setup.
    await page.goto('/setup/rewards')
    await expect(page.getByText('Big reward')).toBeVisible()
  })

  // Minimal path: deselect every chore and clear the reward so the client sends
  // ONLY the 3 required args. This exercises the create_household DEFAULTs end to
  // end — it's the call shape that breaks if the migration leaves two overloads
  // (PGRST203 ambiguity) or forgets to grant the new signature. The board must
  // still come up, falling back to the single "Good job" seed.
  test('signup → skip all chores + reward → board falls back to "Good job"', async ({
    page,
  }) => {
    const email = `e2e-onboard-min-${Date.now()}@example.com`
    const password = 'sticker-test-123'

    await page.goto('/signin')
    await page.getByRole('button', { name: 'Sign up' }).click()
    await page.locator('#email').fill(email)
    await page.locator('#password').fill(password)
    await page.locator('form').getByRole('button', { name: 'Sign up' }).click()

    await page.waitForURL(/\/onboarding$/)

    // Step 1 — household + you.
    await page.locator('#household').fill('The Minimal Household')
    await page.locator('#parent').fill('Sam')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 2 — kid only; skip the age band (defaults to "older").
    await page.locator('#kid').fill('Bo')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 3 — deselect every preselected chore toggle.
    const preselected = page.locator('button[aria-pressed="true"]')
    for (let remaining = await preselected.count(); remaining > 0; remaining--) {
      await page.locator('button[aria-pressed="true"]').first().click()
    }
    await expect(preselected).toHaveCount(0)
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 4 — clear the reward entirely, then submit the minimal create.
    await page.locator('#reward-name').fill('')
    await page.getByRole('button', { name: 'Create household' }).click()

    // Board comes up despite the bare payload, with the fallback chore.
    await page.waitForURL((url) => url.pathname === '/')
    await expect(page.getByText("Bo's board")).toBeVisible()
    await expect(page.getByRole('button', { name: /Good job/ })).toBeVisible()
  })
})
