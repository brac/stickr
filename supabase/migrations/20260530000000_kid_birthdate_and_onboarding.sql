-- ---------------------------------------------------------------------------
-- Feature 18 — Guided onboarding.
-- Adds optional kid.birthdate and extends create_household so signup can seed
-- chosen chores + a reward tier atomically. All new params are DEFAULTed so
-- the existing 3-arg call site keeps working unchanged.
-- ---------------------------------------------------------------------------

alter table kid add column birthdate date;

-- The original 3-arg create_household (init.sql) is replaced by the 7-arg
-- version below. Postgres keys functions by their argument-type list, so adding
-- params — even DEFAULTed ones — would create a *second* overload rather than
-- replace the first, leaving the 3-arg signature callable and making the
-- minimal 3-key client call ambiguous (PGRST203). Drop it explicitly so only
-- the extended overload remains and every call resolves to it via the DEFAULTs.
drop function if exists public.create_household(text, text, text);

create or replace function public.create_household(
  p_household_name  text,
  p_parent_name     text,
  p_kid_name        text,
  p_birthdate       date    default null,
  p_chore_names     text[]  default null,
  p_reward_name     text    default null,
  p_reward_threshold int    default null
)
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
  if exists (select 1 from parent where auth_user_id = auth.uid()) then
    raise exception 'already a member of a household';
  end if;

  insert into household (name, join_code)
  values (trim(p_household_name), gen_join_code())
  returning id into v_household_id;

  insert into parent (household_id, display_name, auth_user_id)
  values (v_household_id, trim(p_parent_name), auth.uid());

  insert into kid (household_id, name, birthdate)
  values (v_household_id, trim(p_kid_name), p_birthdate)
  returning id into v_kid_id;

  insert into board_chapter (kid_id)
  values (v_kid_id)
  returning id into v_chapter_id;

  update kid set current_chapter_id = v_chapter_id where id = v_kid_id;

  -- Chores: fall back to the single 'Good job' seed when no names were given,
  -- otherwise batch-insert the chosen names in order.
  if p_chore_names is null or array_length(p_chore_names, 1) is null then
    insert into chore (household_id, name, sticker_value, sort_order)
    values (v_household_id, 'Good job', 1, 0);
  else
    -- Renumber densely over the *filtered* set so blank entries don't leave
    -- sort_order gaps.
    insert into chore (household_id, name, sticker_value, sort_order)
    select v_household_id, trim(c.name), 1,
           (row_number() over (order by c.ord)) - 1
    from unnest(p_chore_names) with ordinality as c(name, ord)
    where trim(c.name) <> '';
    -- If every provided name was blank, still give the board one button.
    if not found then
      insert into chore (household_id, name, sticker_value, sort_order)
      values (v_household_id, 'Good job', 1, 0);
    end if;
  end if;

  -- Reward: seed one tier when both a name and threshold were provided.
  if p_reward_name is not null and trim(p_reward_name) <> '' and p_reward_threshold is not null then
    insert into reward_tier (household_id, name, threshold, sort_order)
    values (v_household_id, trim(p_reward_name), p_reward_threshold, p_reward_threshold);
  end if;

  return v_household_id;
end;
$$;

-- Grants are per-overload (keyed by argument types); the init.sql grant only
-- covered the now-dropped 3-arg signature. Grant the new one explicitly, as
-- every other client-invoked RPC in this schema does.
grant execute on function
  public.create_household(text, text, text, date, text[], text, int)
  to authenticated;
