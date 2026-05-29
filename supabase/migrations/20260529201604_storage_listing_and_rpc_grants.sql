-- Storage listing lockdown + RPC execute grants (Feature 17 RLS hardening,
-- follow-up to 20260528150000_rls_hardening.sql).
--
-- PART A — block storage list()/listBucket() enumeration WITHOUT breaking
-- public object reads.
--
-- Why this is safe: both 'sticker-images' and 'kid-avatars' buckets are
-- public=true, and the client reads images EXCLUSIVELY via getPublicUrl()
-- (src/lib/kidAvatars.ts:9, src/lib/stickerImages.ts:11), which hits
-- /object/public/<bucket>/<path>. The public object endpoint serves bytes
-- WITHOUT consulting storage.objects RLS, so the service-worker cache rule
-- (keyed on /object/public) keeps working regardless of this SELECT policy.
-- The SELECT policy here only governs the authenticated /object route and
-- list()/listBucket() — exactly the enumeration vector we want to close.
--
-- The original SELECT policies were "for select to public", which let an
-- unauthenticated client enumerate every object in the bucket via list().
-- Replace them with an authenticated, household-prefix-scoped SELECT that
-- mirrors the existing INSERT/UPDATE/DELETE predicate
-- ((storage.foldername(name))[1] = (select current_household_id())::text),
-- so a caller can only list objects inside their own household folder and
-- anon list() returns nothing.
--
-- Safety notes:
--   (1) Do NOT alter storage.buckets — both stay public=true so the
--       /object/public endpoint keeps serving bytes (and the SW cache works).
--   (2) Do NOT touch the INSERT/UPDATE/DELETE policies — household-scoped
--       writes are unchanged.
--   (3) delete-account's service-role .list(householdId)
--       (supabase/functions/delete-account/index.ts:50) uses the admin client,
--       which bypasses RLS, so this SELECT change does not affect account
--       deletion.
--   (4) Every policy is dropped with `drop policy if exists` before being
--       (re)created, so this migration is idempotent / re-runnable.

-- sticker-images: replace the public SELECT with a household-scoped one.
drop policy if exists "sticker images are publicly readable" on storage.objects;
drop policy if exists "household members list sticker images" on storage.objects;
create policy "household members list sticker images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'sticker-images'
    and (storage.foldername(name))[1] = (select current_household_id())::text
  );

-- kid-avatars: replace the public SELECT with a household-scoped one.
drop policy if exists "kid avatars are publicly readable" on storage.objects;
drop policy if exists "household members list kid avatars" on storage.objects;
create policy "household members list kid avatars"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'kid-avatars'
    and (storage.foldername(name))[1] = (select current_household_id())::text
  );

-- PART B — grant EXECUTE on the 5 client-invoked management RPCs.
--
-- All 5 are called from the client (regenerate_join_code at queries.ts:295,
-- update_household_name at queries.ts:303, update_kid_name at queries.ts:310,
-- set_kid_avatar_path at kidAvatars.ts:41 & :59, set_kid_avatar_emoji at
-- kidAvatars.ts:76) but were never granted to the authenticated role. Each RPC
-- is SECURITY DEFINER, self-derives the household from auth.uid(), and
-- not-found-guards the kid id, so granting execute is least-privilege-safe.
-- Signatures verified against 20260528110000_household_management.sql and
-- 20260528120000_kid_avatar.sql (p_name/p_path/p_emoji are text, p_kid_id is
-- uuid). `grant execute` is idempotent — re-running is a no-op.
grant execute on function public.regenerate_join_code() to authenticated;
grant execute on function public.update_household_name(text) to authenticated;
grant execute on function public.update_kid_name(uuid, text) to authenticated;
grant execute on function public.set_kid_avatar_path(uuid, text) to authenticated;
grant execute on function public.set_kid_avatar_emoji(uuid, text) to authenticated;

-- PART C — least-privilege revokes on internal helpers.
--
-- These helpers are never called from the client (confirmed: no
-- supabase.rpc('current_household_id'|'current_parent_id'|'gen_join_code'|
-- 'recompute_kid_balance') anywhere in src/; they only appear in the generated
-- database.types.ts). Signatures verified against 20260528014429_init.sql
-- (all are zero-arg public functions). `revoke` is idempotent.
--
-- gen_join_code() and recompute_kid_balance() are only used internally by other
-- SECURITY DEFINER functions / triggers, so neither role needs execute.
revoke execute on function public.gen_join_code() from anon, authenticated;
revoke execute on function public.recompute_kid_balance() from anon, authenticated;

-- current_household_id() / current_parent_id() must stay callable by the
-- authenticated role: RLS policies reference them via
-- (select current_household_id()), so revoking from authenticated could break
-- policy evaluation for the calling role. Only strip anon's execute.
revoke execute on function public.current_household_id() from anon;
revoke execute on function public.current_parent_id() from anon;
