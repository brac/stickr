import { test, expect } from '@playwright/test'

// Read-only smoke checks: routing + the sign-in surface render. These write
// nothing to the backend, so they are safe to run against any environment and
// validate that the app boots and the Playwright harness is wired correctly.

test('unauthenticated visit to the board redirects to sign in', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/signin$/)
})

test('sign-in screen renders the household auth form', async ({ page }) => {
  await page.goto('/signin')

  await expect(page.getByRole('heading', { name: 'Stickr' })).toBeVisible()
  await expect(page.getByText('Sign in to your household')).toBeVisible()
  await expect(page.locator('#email')).toBeVisible()
  await expect(page.locator('#password')).toBeVisible()
  await expect(
    page.locator('form').getByRole('button', { name: 'Sign in' }),
  ).toBeVisible()
})

test('can toggle between sign in and sign up', async ({ page }) => {
  await page.goto('/signin')

  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page.getByText('Create your account')).toBeVisible()
  await expect(
    page.locator('form').getByRole('button', { name: 'Sign up' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Sign in to your household')).toBeVisible()
})
