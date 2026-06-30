# Stickr

> A household sticker reward board — the online half of a physical sticker board
> that lives on a wall in the house.

Stickr is a two-parent installable **PWA** for running a young child's sticker
reward system. Tap a button when your kid does something good, watch a sticker
appear on a virtual board, and redeem rewards at fixed thresholds. The app is
the source of truth; the wall board is an optional, decorative mirror.

It's a small, real app built for one household — open-sourced as a reference for
a Vite + React + Supabase PWA with realtime sync, offline-tolerant logging, and
row-level-security-backed multi-tenant data.

## Features

- **One-tap awarding.** Logging a sticker is the hot path — one tap from the home
  screen. Awards appear on a visual board with deterministic, seeded jitter so the
  same event renders in the same place on every device.
- **Two-parent realtime sync.** When one parent awards a sticker, the other
  parent's phone reflects it within a couple of seconds (Supabase Postgres
  changefeeds), so nobody double-logs.
- **Rewards & chapters.** Define reward tiers at fixed thresholds; redeeming a
  reward archives the current "chapter" and starts a fresh board. History view
  shows past chapters as static snapshots.
- **Custom sticker images.** Parents upload images (resized client-side, optional
  background removal) into a household-scoped library; each chore references one.
- **Installable & offline-tolerant.** Works as a PWA on iOS and Android; logging
  queues offline and syncs when back online via a service worker.
- **Optional push notifications** when the other parent awards a sticker.

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | Vite + React 19 + TypeScript (strict), Tailwind CSS |
| PWA | `vite-plugin-pwa` (service worker, installable, offline queue) |
| Backend | Supabase — Postgres + Auth + Realtime + Storage |
| Security | Row-Level Security on every table; hardened `SECURITY DEFINER` RPCs |
| Edge Functions | `send-award-push` (web push fan-out), `delete-account` |
| Error tracking | Sentry (no-ops unless configured) |
| Hosting | Vercel static build + hosted Supabase |
| Tests | Vitest (unit) + Playwright (E2E) |

## Getting started

Prerequisites: Node 20+ and a Supabase project (or the
[Supabase CLI](https://supabase.com/docs/guides/cli) for a local stack).

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
#   then fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from
#   your Supabase project (Settings → API). The anon key is public —
#   Row-Level Security is the security boundary.

# 3. Apply the database schema (against a linked Supabase project)
supabase db push        # or `supabase db reset` for a local stack

# 4. Run the dev server
npm run dev
```

Open the printed local URL. To install as a PWA, use your browser's "Install app"
/ "Add to Home Screen" action.

### Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck (`tsc -b`) + production build |
| `npm run lint` | ESLint |
| `npm run test` | Unit tests (Vitest) |
| `npm run e2e` | End-to-end tests (Playwright) |
| `npm run preview` | Preview the production build locally |

## Project structure

```
src/
  auth/         Auth context + sign-in flow
  components/   UI components (board, onboarding, toasts, …)
  hooks/        React hooks (realtime subscriptions, etc.)
  lib/          Typed Supabase client, sticker placement, helpers
  pages/        Route-level screens
supabase/
  migrations/   Canonical schema (apply with `supabase db push`)
  functions/    Edge Functions (send-award-push, delete-account)
e2e/            Playwright specs
```

For the design principles, scope, and data model, see [`CLAUDE.md`](CLAUDE.md) —
the project bible.

## Scope

This is a v1 household tool for **one kid, one household, two parents**. The data
model allows for multi-kid / multi-household, but the UI intentionally doesn't
surface them. There is **no** negative-behavior mechanic — stickers only go up or
are redeemed. See [`CLAUDE.md`](CLAUDE.md) for the full set of constraints.

## License

[MIT](LICENSE) © Ben Bracamonte
