-- Multiple kids per household (v2).
--
-- The data model already supports N kids; v1 only ever created the one kid in
-- create_household. This adds an RPC to create additional kids (kid rows are
-- read-only from the client, mirroring create_household), and a per-household
-- preference for the board display mode.

-- ---------------------------------------------------------------------------
-- create_kid: insert a kid and its first board_chapter atomically, scoped to
-- the caller's household. Mirrors the kid/chapter bootstrap in create_household.
-- ---------------------------------------------------------------------------
create or replace function public.create_kid(p_kid_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
  v_kid_id       uuid;
  v_chapter_id   uuid;
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

  if length(trim(coalesce(p_kid_name, ''))) = 0 then
    raise exception 'kid name is required';
  end if;

  insert into kid (household_id, name)
  values (v_household_id, trim(p_kid_name))
  returning id into v_kid_id;

  insert into board_chapter (kid_id)
  values (v_kid_id)
  returning id into v_chapter_id;

  update kid set current_chapter_id = v_chapter_id where id = v_kid_id;

  return v_kid_id;
end;
$$;

grant execute on function public.create_kid(text) to authenticated;

-- ---------------------------------------------------------------------------
-- household.board_layout: remembered board display mode.
--   'focused'      one kid at a time with a switcher (default; v1 behaviour)
--   'side_by_side' each kid's board in its own column
-- ---------------------------------------------------------------------------
alter table household
  add column if not exists board_layout text not null default 'focused'
    check (board_layout in ('focused', 'side_by_side'));

-- household is select-only from the client; persist the preference via an RPC
-- scoped to the caller's household.
create or replace function public.set_board_layout(p_layout text)
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
  if p_layout not in ('focused', 'side_by_side') then
    raise exception 'invalid board layout';
  end if;

  select household_id into v_household_id
  from parent
  where auth_user_id = auth.uid();

  if v_household_id is null then
    raise exception 'not a member of a household';
  end if;

  update household set board_layout = p_layout where id = v_household_id;
end;
$$;

grant execute on function public.set_board_layout(text) to authenticated;
