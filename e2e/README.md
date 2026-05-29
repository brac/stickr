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

### The full suite against local Supabase (recommended)

```bash
npm run e2e:local    # smoke + journey + account-deletion, all against local
```

`e2e:local` is self-contained: it starts its **own** dev server on `:5174`
pointed at the local stack (`http://127.0.0.1:54321`) via inline
`VITE_SUPABASE_*` env vars, and flips on the destructive opt-in
(`E2E_ACCOUNT_DELETION=1`). You do **not** edit `.env.local` — that file stays
on whatever you use for normal dev (typically the hosted project), and your
`npm run dev` server on `:5173` is left untouched. The only prerequisites are
that the local stack is up and migrated (see below).

### Read-only / against whatever `:5173` already targets

```bash
npm run e2e          # headless; reuses the running `npm run dev` server
npm run e2e:ui       # Playwright UI mode
npm run e2e:report   # open the last HTML report
```

Plain `npm run e2e` targets the locally-running dev server
(`http://localhost:5173`) and reuses it if it's already up
(`reuseExistingServer`). The smoke specs always run; the data-writing specs
self-skip unless that server is pointed at local Supabase (so use `e2e:local`
for those).

## Prerequisite: a local, disposable Supabase stack

The journey and account-deletion specs write (and delete) real rows, so they
must run against a **local, disposable** Supabase — never the hosted project.
`npm run e2e:local` handles pointing the app at it; you just need the stack up:

1. Start the local stack (requires Docker):
   ```bash
   supabase start
   ```
2. Apply migrations to it (`supabase db reset` or `supabase migration up`).

That's it — `npm run e2e:local` supplies the loopback `VITE_SUPABASE_*` values
itself. (If you instead run plain `npm run e2e`, you'd have to point the dev
server at local by hand: set `.env.local` to the values printed by
`supabase start` and restart `npm run dev`.)

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
local-stack prerequisite it needs:

1. The `delete-account` Edge Function served against the **same local stack**.
   The edge runtime that `supabase start` brings up serves it automatically; if
   yours doesn't, serve it explicitly:
   ```bash
   supabase functions serve delete-account
   ```
2. Explicit opt-in, because it is destructive. `npm run e2e:local` sets this for
   you (`E2E_ACCOUNT_DELETION=1`); to run the spec on its own:
   ```bash
   npm run e2e:local -- account-deletion.spec.ts
   ```

Without the opt-in flag, or if the local function isn't served (probe returns
503 / unreachable), the whole spec self-skips. It never runs against a remote
project.
