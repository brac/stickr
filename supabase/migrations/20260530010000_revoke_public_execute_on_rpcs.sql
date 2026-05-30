-- Revoke the default PUBLIC EXECUTE grant on SECURITY DEFINER functions.
--
-- Root cause (Item 4 follow-up to 20260529201604 PART C): Postgres grants
-- EXECUTE to PUBLIC on every function by default. The earlier least-privilege
-- pass revoked EXECUTE from `anon`/`authenticated` *by name*, but left the
-- PUBLIC grant intact — so both roles still inherited EXECUTE through PUBLIC.
-- get_advisors(security) confirmed this: has_function_privilege('anon', …) is
-- still true via the PUBLIC ('-') ACL entry, so every RPC remained callable
-- without signing in (lints 0028 anon / 0029 authenticated).
--
-- This migration revokes the PUBLIC grant so the anon attack surface actually
-- closes, then re-grants EXECUTE to the roles that legitimately need each
-- function.
--
-- After this migration:
--   * ALL 0028 (anon) warnings clear — no public.* RPC is callable by anon.
--   * 0029 (authenticated) warnings remain for the 10 parent-facing RPCs and the
--     2 RLS helpers. That is BY DESIGN: those must be callable by signed-in
--     users — the RLS policies evaluate `(select current_household_id())`, and
--     the RPCs are the app's only write path. Fully clearing 0029 would mean
--     relocating them to a non-exposed schema (PostgREST only exposes `public`),
--     which is a larger refactor tracked separately and not worth it for a
--     two-parent app.
--
-- Safety:
--   * recompute_kid_balance() is a TRIGGER function — triggers fire regardless
--     of the invoking role's EXECUTE privilege, so revoking from everyone is
--     safe and it can no longer be poked directly via /rest/v1/rpc.
--   * current_household_id()/current_parent_id() keep an explicit `authenticated`
--     grant, so RLS policy evaluation is unaffected; only the anon REST exposure
--     is removed.
--   * Every parent-facing RPC is called with an authenticated session
--     (src/lib/queries.ts, src/lib/kidAvatars.ts; onboarding is behind
--     RequireAuth and each RPC self-derives the household from auth.uid(), so
--     anon could never have used them successfully).
--   * revoke/grant are idempotent — this migration is safely re-runnable, and it
--     does not change function bodies, so it does not touch local config.toml or
--     the E2E flow (which signs up an authenticated session before any RPC).

-- 1. Internal-only helpers — lock to platform roles only (clears BOTH lints).
revoke execute on function public.gen_join_code()        from public, anon, authenticated;
revoke execute on function public.recompute_kid_balance() from public, anon, authenticated;

-- 2. RLS helpers — drop anon/PUBLIC, KEEP authenticated (policies call them).
revoke execute on function public.current_household_id() from public, anon;
revoke execute on function public.current_parent_id()    from public, anon;
grant  execute on function public.current_household_id() to authenticated;
grant  execute on function public.current_parent_id()    to authenticated;

-- 3. Parent-facing RPCs — authenticated-only (signed-in parents), never anon.
revoke execute on function
  public.create_household(text, text, text, date, text[], text, integer)
  from public, anon;
grant execute on function
  public.create_household(text, text, text, date, text[], text, integer)
  to authenticated;

revoke execute on function public.join_household(text, text) from public, anon;
grant  execute on function public.join_household(text, text) to authenticated;

revoke execute on function public.create_kid(text) from public, anon;
grant  execute on function public.create_kid(text) to authenticated;

revoke execute on function public.redeem_chapter(uuid, uuid, uuid, uuid) from public, anon;
grant  execute on function public.redeem_chapter(uuid, uuid, uuid, uuid) to authenticated;

revoke execute on function public.set_board_layout(text) from public, anon;
grant  execute on function public.set_board_layout(text) to authenticated;

revoke execute on function public.set_kid_avatar_emoji(uuid, text) from public, anon;
grant  execute on function public.set_kid_avatar_emoji(uuid, text) to authenticated;

revoke execute on function public.set_kid_avatar_path(uuid, text) from public, anon;
grant  execute on function public.set_kid_avatar_path(uuid, text) to authenticated;

revoke execute on function public.update_household_name(text) from public, anon;
grant  execute on function public.update_household_name(text) to authenticated;

revoke execute on function public.update_kid_name(uuid, text) from public, anon;
grant  execute on function public.update_kid_name(uuid, text) to authenticated;

revoke execute on function public.regenerate_join_code() from public, anon;
grant  execute on function public.regenerate_join_code() to authenticated;
