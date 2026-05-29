-- Kid profile pictures (Feature 15). Two nullable columns on kid:
--   avatar_path  — storage path of an uploaded (background-removed) cutout
--   avatar_emoji — chosen fallback emoji; null = the app's hardcoded default
-- Both null = default emoji. No churn on existing rows.
alter table kid
  add column avatar_path  text,
  add column avatar_emoji text;

-- kid rows are read-only under RLS, so avatar edits go through SECURITY DEFINER
-- RPCs guarded by household membership (mirrors update_kid_name). Pass null to
-- clear either field.

create or replace function public.set_kid_avatar_path(p_kid_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated';
  end if;

  select household_id into v_household_id
  from parent
  where auth_user_id = auth.uid();

  if v_household_id is null then
    raise exception 'not a member of a household';
  end if;

  update kid
  set avatar_path = p_path
  where id = p_kid_id and household_id = v_household_id;

  if not found then
    raise exception 'kid not found in your household';
  end if;
end;
$$;

create or replace function public.set_kid_avatar_emoji(p_kid_id uuid, p_emoji text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated';
  end if;

  select household_id into v_household_id
  from parent
  where auth_user_id = auth.uid();

  if v_household_id is null then
    raise exception 'not a member of a household';
  end if;

  update kid
  set avatar_emoji = nullif(trim(coalesce(p_emoji, '')), '')
  where id = p_kid_id and household_id = v_household_id;

  if not found then
    raise exception 'kid not found in your household';
  end if;
end;
$$;
