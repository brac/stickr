# delete-account

Permanently deletes the signed-in parent's account (Feature 16). Required for an
App Store submission — Apple guideline 5.1.1(v) — and good hygiene for the PWA.

Auth-user deletion needs the **service role**, so it can't run in the browser.
The client invokes this function with its session JWT; the function resolves the
caller, decides the deletion scope, and does the work with the service role.

## Two paths

Decided by how many parents are in the household:

- **Sole parent** → tears down the **whole household**: kids, chapters, sticker
  events, redemptions, chores, reward tiers, sticker images, avatars, and push
  subscriptions (all via the `household` row's `ON DELETE CASCADE`), plus the
  household's Storage objects, plus the auth user.
- **Co-parent (2+ parents)** → removes only this parent row and auth user; the
  household and all its history survive for the remaining parent.

The auth-user deletion happens **last** so a failed DB/storage step leaves the
account intact and safe to retry (a retry with no `parent` row just removes the
lingering auth user — idempotent).

## Prerequisites

- Migration `…_parent_delete_set_null.sql` must be applied. It switches
  `sticker_event.awarded_by` / `redemption_event.redeemed_by` to
  `ON DELETE SET NULL`; without it, deleting a co-parent who has ever awarded a
  sticker fails on the foreign key.
- No new secrets. The function uses the platform-injected `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_ANON_KEY`.

## Deploy

```bash
supabase functions deploy delete-account
```

`verify_jwt = true` (the default; set explicitly in `config.toml`) so the gateway
rejects unauthenticated calls. The function also re-derives the caller from the
JWT and never trusts a client-supplied id.

## Notes

- Storage purge lists up to 1000 objects per bucket per household — far beyond
  any real household. Paginate if that ever changes.
- Deletion is irreversible: there is no soft-delete or undo. The client gates it
  behind a typed confirmation for the sole-parent (whole-household) case.
