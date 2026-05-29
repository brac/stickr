# E2E tests (Playwright)

End-to-end coverage of the critical user flows, driven through the real UI
against a real Supabase backend.

## Layout

- `smoke.spec.ts` — read-only routing + sign-in render checks. Safe against any
  environment; writes nothing.
- `journey.spec.ts` — the full v1 loop: sign up → onboard → define a chore +
  reward → award → redeem → board archives. **Writes real rows**, so it
  self-skips unless a local Supabase stack is reachable.
- `account-deletion.spec.ts` — Feature 16: sole-parent household teardown and
  co-parent removal through the danger zone. **Destructive** (deletes auth users
  and whole households) and additionally needs the `delete-account` Edge Function
  served locally. Guarded so it can never hit the hosted project — see below.

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

The data-writing specs decide to run based on the dev server's **configured**
backend, not just "something answers on :54321". A spec self-skips unless
`VITE_SUPABASE_URL` resolves to a loopback host (`127.0.0.1` / `localhost`) **and**
that local stack is reachable. As a hard safety net, every write spec aborts any
Supabase request to a non-loopback host — so a dev server still pointed at the
hosted project can never write to it; the test fails loudly instead. This closes
the trap where an unrelated local stack answers the health probe while the app is
actually talking to production.

## Prerequisite for the account-deletion test

`account-deletion.spec.ts` deletes auth users and households, so on top of the
journey prerequisites it needs:

1. The `delete-account` Edge Function served against the **same local stack**:
   ```bash
   supabase functions serve delete-account
   ```
   (or rely on the edge runtime that `supabase start` brings up, if present).
2. The dev server pointed at that local stack (same `.env.local` as above) — so
   the destructive flow hits local, not the hosted project.
3. Explicit opt-in, because it is destructive:
   ```bash
   E2E_ACCOUNT_DELETION=1 npm run e2e -- account-deletion.spec.ts
   ```

Without the opt-in flag, or if the local function isn't served (probe returns
503 / unreachable), the whole spec self-skips. It never runs against a remote
project.
