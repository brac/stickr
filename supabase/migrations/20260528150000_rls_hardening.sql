-- Feature 17 — RLS & multi-tenancy hardening.
--
-- Static audit (docs/SECURITY-RLS.md) found one real cross-tenant write vector
-- plus a couple of belt-and-suspenders tightenings. Everything else in the
-- schema already re-derives scope from auth.uid() and was left unchanged.
--
-- ---------------------------------------------------------------------------
-- FINDING 1 (the real one): parent_update_self let a parent change household_id.
-- ---------------------------------------------------------------------------
-- The parent_update_self policy's WITH CHECK only re-asserted
-- `auth_user_id = auth.uid()`. It never pinned household_id, so an authenticated
-- parent could
--     update parent set household_id = '<another household uuid>'
--     where auth_user_id = auth.uid();
-- and silently move themselves into another household — bypassing join_code
-- entirely. The new row still satisfies the old WITH CHECK (auth_user_id is
-- unchanged), so RLS allowed it. Exploiting it requires knowing a target
-- household's UUID (unguessable v4, and RLS hides other households' ids), which
-- is why this is a latent/defense-in-depth gap rather than a live breach — but
-- it is a genuine tenant-isolation hole and gets closed two ways:
--
--   (a) Column-level privilege: the client only ever needs to write
--       display_name on parent (it never updates household_id, auth_user_id, or
--       id — confirmed against src/). Restricting UPDATE to (display_name)
--       makes household_id physically unwritable from the anon/authenticated
--       role regardless of policy.
--   (b) Re-assert household scope in the policy's WITH CHECK as well, so the
--       intent is explicit and survives any future column-grant change.

revoke update on public.parent from authenticated;
grant update (display_name) on public.parent to authenticated;

drop policy parent_update_self on public.parent;
create policy parent_update_self on public.parent
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (
    auth_user_id = (select auth.uid())
    and household_id = (select current_household_id())
  );
