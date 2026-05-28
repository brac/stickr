# E2E tests (Playwright)

End-to-end coverage of the critical user flows, driven through the real UI
against a real Supabase backend.

## Layout

- `smoke.spec.ts` — read-only routing + sign-in render checks. Safe against any
  environment; writes nothing.
- `journey.spec.ts` — the full v1 loop: sign up → onboard → define a chore +
  reward → award → redeem → board archives. **Writes real rows**, so it
  self-skips unless a local Supabase stack is reachable.

## Running

The suite targets the locally-running dev server (`http://localhost:5173`) and
reuses it if it's already up (`reuseExistingServer`), matching the normal
workflow of running `npm run dev` in a separate terminal.

```bash
npm run e2e          # headless
npm run e2e:ui       # Playwright UI mode
npm run e2e:report   # open the last HTML report
```

## Prerequisite for the journey test

The journey writes households, chores, rewards, and sticker events. It must run
against a **local, disposable** Supabase — never the hosted project.

1. Start the local stack (requires Docker):
   ```bash
   supabase start
   ```
2. Apply migrations to it (`supabase db reset` or `supabase migration up`).
3. Point the dev server at local Supabase — set `.env.local` to the values
   printed by `supabase start`:
   ```
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_ANON_KEY=<local anon key from `supabase start`>
   ```
   Restart `npm run dev` so it picks them up.

Email confirmations are disabled in `supabase/config.toml`
(`enable_confirmations = false`), so the test signs up a fresh unique user and
gets a session immediately — no inbox step.

If local Supabase isn't reachable on `127.0.0.1:54321`, the journey test skips
with a message and only the smoke tests run.
