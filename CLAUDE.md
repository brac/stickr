# Stickr — Project Bible

> A household sticker board PWA. The online half of a physical sticker board
> that lives on a wall in the house.

This document is the source of truth for the project. When working on this
codebase (especially via Claude Code in agentic mode), read this first and stay
inside the constraints described here. If something here conflicts with a
specific user instruction in a session, the user's instruction wins for that
session — but flag the conflict so this doc can be updated.

---

## What this is

A two-parent PWA for running a household sticker reward system for a young
child. It is the **online half** of a physical
sticker board that lives on a wall in the house. The app is the source of
truth; the wall board is an optional, decorative mirror that gets updated by
hand when convenient.

Single sentence: *Tap a button when your kid does something good, watch a
sticker appear on a virtual board, redeem rewards at fixed thresholds.*

## Who uses it

- **Two parents.** Both have the PWA installed on their phones. They are the
  only users who ever open the app.
- **The kid never opens the app.** They see stickers on the wall board (and
  optionally on a parent's phone screen when shown to them).
- **One household, one kid in v1.** Multi-kid and multi-household are
  intentional v2+ work. The data model should *allow* for them but the UI
  should not surface them.

## Core design principles

1. **Logging is the hot path.** Awarding a sticker must take one tap from the
   home screen. If anything in the codebase makes that harder, push back.
2. **The visual board is the product.** Stickers on the board are not chrome
   around a counter — they *are* the counter. Treat the board rendering as
   load-bearing UI, not decoration.
3. **Two-parent realtime sync is mandatory.** When one parent awards a sticker,
   the other parent's phone reflects it within a couple of seconds. Stale
   state causes double-logging.
4. **Pure positive.** Stickers only go up (or are redeemed). There is no
   "lose a sticker for bad behavior" mechanic. Do not add one.
5. **Tight v1 scope.** Build the chore→sticker→reward loop end-to-end before
   adding anything else. Streaks, analytics, multi-kid, the baby tracker —
   all out of v1.
6. **Parent-tool aesthetic.** The home screen has a playful hero (the board),
   but the rest of the UI is a tool, not a toy. Sentence case, clean
   typography, no infantilizing UI patterns.

## Stack

- **Frontend:** Vite + React + TypeScript, Tailwind for styling, PWA
  (installable, offline-tolerant logging via service worker queue).
- **Backend:** Supabase (Postgres + Auth + Realtime + Storage).
  - Auth: email magic link or password — whichever ships fastest.
  - Realtime: Postgres changefeed subscriptions on `sticker_event` and
    `kid` rows.
  - Storage: Supabase Storage bucket for uploaded sticker images.
- **Hosting:** Static bundle deployed to a hosting provider TBD (Vercel,
  Netlify, or DigitalOcean App Platform — pick whichever is fastest at the
  time).
- **Domain:** subdomain off `brac.dev` (e.g. `stickr.brac.dev`) — or a
  dedicated domain. Not blocking.

## Why these choices

- **PWA over native:** zero app store friction, installable on both parents'
  phones, works the same on iOS/Android, deploy = push to main.
- **Supabase over a custom ASP.NET backend:** realtime sync would otherwise
  require writing SignalR, plus the app is small enough that the overhead of
  a hand-rolled backend isn't justified. Supabase gives auth + realtime +
  storage in one box.
- **React over Angular:** Angular would also work fine, but React + Vite has
  the lightest setup for a PWA of this size, and the ecosystem for PWA
  tooling is more mature.

## Data model

Tables (see schema.sql for canonical version):

- `household` — id, name, join_code, created_at
- `parent` — id, household_id, display_name, auth_user_id (FK to Supabase auth)
- `kid` — id, household_id, name, current_balance (cached), current_chapter_id
- `chore` — id, household_id, name, sticker_image_id, sticker_value, sort_order,
  active
- `sticker_image` — id, household_id, storage_path, label, created_at
- `reward_tier` — id, household_id, threshold, name, sort_order
- `board_chapter` — id, kid_id, started_at, ended_at, ended_by_redemption_id
- `sticker_event` — id, kid_id, chore_id, chapter_id, sticker_image_id,
  awarded_by, amount, position_x, position_y, rotation, created_at
- `redemption_event` — id, kid_id, chapter_id, reward_tier_id, redeemed_by,
  created_at

Notes:
- `kid.current_balance` is derived but cached. Recomputed via trigger on
  insert/delete of `sticker_event` and `redemption_event`.
- `position_x`, `position_y`, `rotation` are computed at award time using a
  seeded jitter algorithm — see `lib/stickerPlacement.ts`.
- When a `redemption_event` fires for the highest unlocked tier *and* it ends
  the chapter, a new `board_chapter` row is created and `kid.current_chapter_id`
  is updated. (Chapter end rules are TBD — see open questions.)

## Placement algorithm (sticker positions)

Stickers fill the board in rows, top-to-bottom, with deterministic jitter:

1. Each chapter has a `sticker_count` (derived from sticker_events in that
   chapter).
2. Given `n = sticker_count` and board dimensions, compute the base grid
   position: `row = floor(n / row_size)`, `col = n % row_size`.
3. Apply seeded jitter using the sticker_event's id as the random seed:
   - x offset: ±8px
   - y offset: ±6px
   - rotation: ±15°
4. Store the final position on the sticker_event row so renders are stable.

Why deterministic: the same event must always render in the same place across
devices, refreshes, and history views.

## Sticker images

- Parents upload custom images via a sticker library screen.
- Uploaded images are resized client-side to ~256x256 max before upload.
- Stored in Supabase Storage in a household-scoped bucket path.
- Each `chore` references one `sticker_image`.
- When a sticker is awarded, the event references the sticker_image_id so the
  history is stable even if the chore's sticker is later changed.

## Things explicitly NOT in v1

Do not build these until v1 is shipped and used for a few weeks:

- Per-chore streaks
- Daily/weekly recurring chore reminders
- Push notifications
- The baby tracker (separate problem, possibly separate app)
- Photo attachments on sticker events
- Multiple kids in the UI
- Multi-household
- Analytics, charts, weekly summaries
- Negative behavior tracking
- A separate kid-facing view
- Themes / customization beyond sticker images

If a v1 task tempts you toward any of these, stop and check with the user.

## Conventions

- **TypeScript strict mode.** No implicit any.
- **Component naming:** PascalCase files, one component per file.
- **State management:** Start with React state + Supabase realtime
  subscriptions. Reach for a state library only if there's a concrete
  reason — there probably won't be.
- **Styling:** Tailwind utility classes inline. Extract to a component only
  when the same combination repeats 3+ times.
- **Database access:** All queries through a typed Supabase client. No raw
  SQL strings in components.
- **Error handling:** User-facing errors are toast notifications. Silent
  failures get reported to console + a future error log table.
- **Tests:** v1 ships without tests. (Yes, really — the surface area is small,
  the user is two people, and we want to ship.) Tests come in v1.1 once the
  shape is stable.

## Open questions (decide before/during build)

- Chapter end trigger: does any redemption end the chapter, or only the
  highest tier? Working assumption: **any redemption ends the chapter** —
  simpler model, fresh board after every reward feels good.
- Sticker board row size: how many stickers per row? Working assumption: **5
  per row**, scaled to viewport width. Adjust during Phase 2.
- What happens at >50 stickers if no redemption? Working assumption: **stickers
  shrink slightly past row 8** so the board stays visually full but readable.
  Or scroll. Decide in Phase 2.
- Sign-in flow for the second parent: invite link with household join_code?
  Working assumption: **yes, household has a join_code; second parent signs
  up via a magic link that includes the code.**

## Definition of "done" for v1

- Both parents can install the PWA on their phones.
- Both parents can sign in to the same household.
- Tapping a chore button awards a sticker, the sticker appears on the board
  with jittered placement, and the partner's phone reflects the change within
  a few seconds.
- Parents can define chores, sticker images, and reward tiers.
- Parent can redeem a reward; board archives the chapter and starts fresh.
- History view shows past chapters as static board snapshots.
- App works offline for at least logging (events queue and sync when online).