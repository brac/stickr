-- Household management RPCs (Feature 13). household and kid rows are read-only
-- under RLS, so edits go through SECURITY DEFINER functions guarded by
-- household membership, mirroring create_kid / set_board_layout.

-- Issue a fresh, unique invite code for the caller's household. Returns the new
-- code so the UI can show it immediately. Invalidates any previously shared
-- code that hasn't been used yet.
create or replace function public.regenerate_join_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_code         text;
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

  v_code := gen_join_code();
  update household set join_code = v_code where id = v_household_id;
  return v_code;
end;
$$;

-- Rename the caller's household.
create or replace function public.update_household_name(p_name text)
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
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'household name is required';
  end if;

  select household_id into v_household_id
  from parent
  where auth_user_id = auth.uid();

  if v_household_id is null then
    raise exception 'not a member of a household';
  end if;

  update household set name = trim(p_name) where id = v_household_id;
end;
$$;

-- Rename a kid — but only one that belongs to the caller's household.
create or replace function public.update_kid_name(p_kid_id uuid, p_name text)
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
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'kid name is required';
  end if;

  select household_id into v_household_id
  from parent
  where auth_user_id = auth.uid();

  if v_household_id is null then
    raise exception 'not a member of a household';
  end if;

  update kid
  set name = trim(p_name)
  where id = p_kid_id and household_id = v_household_id;

  if not found then
    raise exception 'kid not found in your household';
  end if;
end;
$$;
