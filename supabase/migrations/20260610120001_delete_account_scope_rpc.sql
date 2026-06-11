-- Atomic scope decision for account deletion (adversarial review, 2026-06-10).
--
-- The delete-account edge function decided "sole parent → tear down household"
-- vs "co-parent → remove just me" with a COUNT followed by a DELETE — two
-- separate statements. Two co-parents deleting simultaneously both read
-- count=2, both took the co-parent path, and the household survived with ZERO
-- parents: permanently orphaned (no auth user maps to it, RLS hides it
-- forever) with its storage objects stranded.
--
-- This RPC serializes the decision on a household row lock: the second caller
-- blocks until the first commits, then recounts and correctly becomes the
-- last-parent-out ('household') case.
--
-- Division of labor with the edge function (which calls this with the CALLER's
-- JWT so auth.uid() resolves):
--   'self'      -> the parent row is already deleted here; the function only
--                  deletes the auth user.
--   'household' -> nothing is deleted here; the function purges storage, then
--                  deletes the household (cascades), then the auth user. The
--                  row deletions stay in the function so a failed storage
--                  purge leaves everything intact and retryable.
--
-- Accepted residual window: between this RPC committing 'household' and the
-- function deleting the household, a new parent could join via join_code and
-- be cascaded away. For a two-parent app this is vanishingly unlikely; closing
-- it would mean deleting the household inside the RPC, which would invert the
-- purge-before-delete ordering and orphan storage on a failed purge instead.

create or replace function public.delete_own_account_scope()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id    uuid;
  v_household_id uuid;
  v_count        integer;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated';
  end if;

  select id, household_id into v_parent_id, v_household_id
  from parent
  where auth_user_id = auth.uid();

  -- No membership (e.g. a retry after the DB step already ran): nothing to
  -- decide; the caller just removes the auth user.
  if v_parent_id is null then
    return 'self';
  end if;

  -- Serialize concurrent deletions in the same household.
  perform 1 from household where id = v_household_id for update;

  select count(*) into v_count from parent where household_id = v_household_id;
  if v_count <= 1 then
    return 'household';
  end if;

  delete from parent where id = v_parent_id;
  return 'self';
end;
$$;

revoke execute on function public.delete_own_account_scope() from public, anon;
grant execute on function public.delete_own_account_scope() to authenticated;
