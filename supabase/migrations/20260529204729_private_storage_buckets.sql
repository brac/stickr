-- Make the storage buckets PRIVATE (Feature 17 RLS hardening, follow-up to
-- 20260529201604_storage_listing_and_rpc_grants.sql).
--
-- Why: the household-scoped SELECT policy added in 20260529201604 makes list()
-- enforce RLS (verified: anon and cross-household list() return nothing even on
-- a public bucket). But a public bucket (public = true) still serves object
-- BYTES to anyone via the /object/public/<path> endpoint, which does NOT
-- consult storage.objects RLS. Verified empirically by toggling the flag: with
-- the scoped policy in place, list() was already blocked for anon + household A,
-- yet A could still DOWNLOAD household B's object while the bucket stayed public
-- (and flipping it private denied that download). So enumeration was closed by
-- 20260529201604, but direct read-by-URL of every household's sticker art and
-- kid-avatar photo was still open.
--
-- Flipping the buckets private closes that last gap. With public = false a read
-- also enforces RLS, so:
--   * anon gets nothing (no SELECT policy for the anon role on these buckets),
--   * an authenticated parent can only list/read/sign objects under their own
--     household folder ((storage.foldername(name))[1] = current_household_id()).
--
-- The client now reads images via short-lived signed URLs (createSignedUrl /
-- createSignedUrls) instead of getPublicUrl. Creating a signed URL requires
-- SELECT on the object, so the scoped SELECT policy gates who can sign — a
-- parent can only mint URLs for their own household's objects.
--
-- DEPLOY ORDER (no breakage window): the signed-URL client works against a
-- public bucket too, so ship the frontend first, THEN apply this migration.
-- Applying this before the new frontend deploys would 400 the old getPublicUrl
-- reads.
--
-- Service-role paths are unaffected: delete-account's admin .list()/remove()
-- bypasses RLS and the public flag alike.
--
-- Idempotent: re-running just re-asserts public = false.

update storage.buckets
  set public = false
  where id in ('sticker-images', 'kid-avatars');
