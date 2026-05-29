import { test, expect, type Page } from '@playwright/test'

// Feature 16 — in-app account deletion, end to end through the real UI.
//
// This is DESTRUCTIVE: it deletes auth users and, for the sole-parent case,
// whole households. It must only ever run against a LOCAL, disposable Supabase
// stack with the `delete-account` Edge Function served — never the hosted
// project. It is therefore guarded three ways and self-skips unless all hold:
//
//   1. Explicit opt-in:  E2E_ACCOUNT_DELETION=1
//   2. Local edge runtime is serving delete-account (probe ≠ 503/unreachable)
//   3. (implied) the dev server under test points at that SAME local stack
//
// See e2e/README.md for the one-time local setup.

const LOCAL_SUPABASE_URL =
  process.env.E2E_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const OPTED_IN = process.env.E2E_ACCOUNT_DELETION === '1'
const PASSWORD = 'sticker-test-123'

// A served function answers 401 (missing JWT) to an unauthenticated POST. A 503
// (Kong upstream down) or a network error means no local edge runtime — skip.
async function localFunctionServed(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
    })
    return res.status !== 503
  } catch {
    return false
  }
}

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto('/signin')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('form').getByRole('button', { name: 'Sign up' }).click()
  await page.waitForURL(/\/onboarding$/)
}

async function createHousehold(
  page: Page,
  opts: { household: string; kid: string; parent: string },
): Promise<void> {
  await page.locator('#household').fill(opts.household)
  await page.locator('#kid').fill(opts.kid)
  await page.locator('#parent').fill(opts.parent)
  await page.getByRole('button', { name: 'Create household' }).click()
  await page.waitForURL((url) => url.pathname === '/')
}

async function expectSignInRejected(page: Page, email: string): Promise<void> {
  await page.waitForURL(/\/signin$/)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click()
  // A deleted auth user can no longer authenticate.
  await expect(page.getByText(/invalid login credentials/i)).toBeVisible()
}

test.describe('account deletion (Feature 16)', () => {
  test.beforeAll(async () => {
    test.skip(
      !OPTED_IN,
      'Destructive — set E2E_ACCOUNT_DELETION=1 and point the dev server at a local stack (see e2e/README.md)',
    )
    test.skip(
      !(await localFunctionServed()),
      'Local delete-account function not served on 127.0.0.1:54321 — see e2e/README.md',
    )
  })

  test('sole parent: deletes the whole household and the auth user', async ({
    page,
  }) => {
    const email = `e2e-del-solo-${Date.now()}@example.com`
    const household = `Solo House ${Date.now()}`
    await signUp(page, email)
    await createHousehold(page, { household, kid: 'Pip', parent: 'Alex' })

    await page.goto('/setup/household')
    await expect(
      page.getByText(/only parent/i),
    ).toBeVisible() // sole-parent danger copy
    await page.getByRole('button', { name: 'Delete my account' }).click()

    const dialog = page.getByRole('dialog', { name: 'Delete your account' })
    await expect(dialog).toBeVisible()

    // Irreversible teardown is gated behind typing the household name.
    const confirm = dialog.getByRole('button', { name: 'Delete household' })
    await expect(confirm).toBeDisabled()
    await dialog.locator('input').fill(household)
    await expect(confirm).toBeEnabled()
    await confirm.click()

    await expectSignInRejected(page, email)
  })

  test('co-parent: removes only the leaver; the household survives', async ({
    browser,
  }) => {
    const stamp = Date.now()
    const household = `Shared House ${stamp}`
    const ownerEmail = `e2e-del-owner-${stamp}@example.com`
    const leaverEmail = `e2e-del-leaver-${stamp}@example.com`

    // --- Parent A creates the household and grabs the invite code ---
    const ctxA = await browser.newContext()
    const pageA = await ctxA.newPage()
    await signUp(pageA, ownerEmail)
    await createHousehold(pageA, { household, kid: 'Pip', parent: 'Alex' })
    await pageA.goto('/setup/household')
    const code = (
      await pageA.getByTestId('invite-code').innerText()
    ).trim()
    expect(code).toMatch(/\w+/)

    // --- Parent B joins the same household ---
    const ctxB = await browser.newContext()
    const pageB = await ctxB.newPage()
    await signUp(pageB, leaverEmail)
    await pageB.getByRole('button', { name: 'Join existing' }).click()
    await pageB.locator('#code').fill(code)
    await pageB.locator('#parent').fill('Sam')
    await pageB.getByRole('button', { name: 'Join household' }).click()
    await pageB.waitForURL((url) => url.pathname === '/')

    // --- Parent B deletes their account (co-parent path: no type-to-confirm) ---
    await pageB.goto('/setup/household')
    await expect(pageB.getByText(/keeps the household/i)).toBeVisible()
    await pageB.getByRole('button', { name: 'Delete my account' }).click()
    const dialogB = pageB.getByRole('dialog', { name: 'Delete your account' })
    await dialogB.getByRole('button', { name: 'Delete my account' }).click()
    await expectSignInRejected(pageB, leaverEmail)

    // --- The household survives for Parent A; Sam is gone from the members ---
    await pageA.reload()
    await expect(pageA.getByText(household)).toBeVisible()
    await expect(pageA.getByText('Alex')).toBeVisible()
    await expect(pageA.getByText('Sam')).toHaveCount(0)

    await ctxA.close()
    await ctxB.close()
  })
})
