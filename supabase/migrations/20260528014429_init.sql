-- Stickr v1 initial schema.
-- One household, two parents, one kid. See CLAUDE.md for the data model.
-- All app access is household-scoped via RLS. Bootstrap (create/join household)
-- goes through SECURITY DEFINER RPCs to avoid the RLS chicken-and-egg.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table household (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  join_code   text not null unique,
  created_at  timestamptz not null default now()
);

create table parent (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household (id) on delete cascade,
  display_name  text not null,
  auth_user_id  uuid not null unique references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now()
);
create index parent_household_idx on parent (household_id);

create table sticker_image (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household (id) on delete cascade,
  storage_path  text not null,
  label         text,
  created_at    timestamptz not null default now()
);
create index sticker_image_household_idx on sticker_image (household_id);

-- kid.current_chapter_id references board_chapter (created below); the FK is
-- added via ALTER once board_chapter exists (circular reference).
create table kid (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references household (id) on delete cascade,
  name               text not null,
  current_balance    integer not null default 0,
  current_chapter_id uuid,
  created_at         timestamptz not null default now()
);
create index kid_household_idx on kid (household_id);

create table chore (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references household (id) on delete cascade,
  name             text not null,
  sticker_image_id uuid references sticker_image (id) on delete set null,
  sticker_value    integer not null default 1 check (sticker_value between 1 and 3),
  sort_order       integer not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
create index chore_household_idx on chore (household_id);

create table reward_tier (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household (id) on delete cascade,
  threshold     integer not null check (threshold > 0),
  name          text not null,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);
create index reward_tier_household_idx on reward_tier (household_id);

-- board_chapter.ended_by_redemption_id references redemption_event (created
-- below); FK added via ALTER (circular reference).
create table board_chapter (
  id                     uuid primary key default gen_random_uuid(),
  kid_id                 uuid not null references kid (id) on delete cascade,
  started_at             timestamptz not null default now(),
  ended_at               timestamptz,
  ended_by_redemption_id uuid,
  created_at             timestamptz not null default now()
);
create index board_chapter_kid_idx on board_chapter (kid_id);

create table sticker_event (
  id               uuid primary key default gen_random_uuid(),
  kid_id           uuid not null references kid (id) on delete cascade,
  chore_id         uuid references chore (id) on delete set null,
  chapter_id       uuid not null references board_chapter (id) on delete cascade,
  sticker_image_id uuid references sticker_image (id) on delete set null,
  awarded_by       uuid not null references parent (id),
  amount           integer not null default 1 check (amount > 0),
  position_x       real not null default 0,
  position_y       real not null default 0,
  rotation         real not null default 0,
  created_at       timestamptz not null default now()
);
create index sticker_event_chapter_idx on sticker_event (chapter_id);
create index sticker_event_kid_idx on sticker_event (kid_id);

create table redemption_event (
  id             uuid primary key default gen_random_uuid(),
  kid_id         uuid not null references kid (id) on delete cascade,
  chapter_id     uuid not null references board_chapter (id) on delete cascade,
  reward_tier_id uuid not null references reward_tier (id),
  redeemed_by    uuid not null references parent (id),
  created_at     timestamptz not null default now()
);
create index redemption_event_kid_idx on redemption_event (kid_id);

-- Circular FKs, added after both sides exist.
alter table kid
  add constraint kid_current_chapter_fk
  foreign key (current_chapter_id) references board_chapter (id) on delete set null;

alter table board_chapter
  add constraint board_chapter_ended_by_redemption_fk
  foreign key (ended_by_redemption_id) references redemption_event (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they bypass RLS and avoid recursion
-- when used inside policies on the parent table).
-- ---------------------------------------------------------------------------

create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.parent where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.current_parent_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.parent where auth_user_id = auth.uid() limit 1;
$$;

-- Generate a short, human-readable, unguessable join code (no ambiguous chars).
create or replace function public.gen_join_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i integer;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.household where join_code = code);
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bootstrap RPCs (SECURITY DEFINER): create or join a household. These run
-- before the caller has a parent row, so they cannot rely on RLS.
-- ---------------------------------------------------------------------------

create or replace function public.create_household(
  p_household_name text,
  p_parent_name    text,
  p_kid_name       text
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

  insert into kid (household_id, name)
  values (v_household_id, trim(p_kid_name))
  returning id into v_kid_id;

  insert into board_chapter (kid_id)
  values (v_kid_id)
  returning id into v_chapter_id;

  update kid set current_chapter_id = v_chapter_id where id = v_kid_id;

  -- Seed one default chore so the home screen has a button on day one.
  insert into chore (household_id, name, sticker_value, sort_order)
  values (v_household_id, 'Good job', 1, 0);

  return v_household_id;
end;
$$;

create or replace function public.join_household(
  p_join_code   text,
  p_parent_name text
)
returns uuid
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
  if exists (select 1 from parent where auth_user_id = auth.uid()) then
    raise exception 'already a member of a household';
  end if;

  select id into v_household_id
  from household
  where join_code = upper(trim(p_join_code));

  if v_household_id is null then
    raise exception 'no household found for that code';
  end if;

  insert into parent (household_id, display_name, auth_user_id)
  values (v_household_id, trim(p_parent_name), auth.uid());

  return v_household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Balance recompute trigger. kid.current_balance = sum of sticker amounts in
-- the kid's CURRENT chapter. Runs SECURITY DEFINER so it can update kid
-- regardless of the caller's RLS.
-- ---------------------------------------------------------------------------

create or replace function public.recompute_kid_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kid_id uuid;
begin
  v_kid_id := coalesce(new.kid_id, old.kid_id);
  update kid k
  set current_balance = coalesce((
    select sum(se.amount)
    from sticker_event se
    where se.kid_id = v_kid_id
      and se.chapter_id = k.current_chapter_id
  ), 0)
  where k.id = v_kid_id;
  return null;
end;
$$;

create trigger trg_sticker_event_balance
after insert or delete on sticker_event
for each row execute function recompute_kid_balance();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table household        enable row level security;
alter table parent           enable row level security;
alter table kid              enable row level security;
alter table sticker_image    enable row level security;
alter table chore            enable row level security;
alter table reward_tier      enable row level security;
alter table board_chapter    enable row level security;
alter table sticker_event    enable row level security;
alter table redemption_event enable row level security;

-- household: members can read their own household.
create policy household_select on household
  for select to authenticated
  using (id = (select current_household_id()));

-- parent: members can read everyone in their household; update only own row.
create policy parent_select on parent
  for select to authenticated
  using (household_id = (select current_household_id()));
create policy parent_update_self on parent
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

-- kid: read-only from the client (created/updated via RPC + balance trigger).
create policy kid_select on kid
  for select to authenticated
  using (household_id = (select current_household_id()));

-- sticker_image: full CRUD within household.
create policy sticker_image_select on sticker_image
  for select to authenticated using (household_id = (select current_household_id()));
create policy sticker_image_insert on sticker_image
  for insert to authenticated with check (household_id = (select current_household_id()));
create policy sticker_image_update on sticker_image
  for update to authenticated
  using (household_id = (select current_household_id()))
  with check (household_id = (select current_household_id()));
create policy sticker_image_delete on sticker_image
  for delete to authenticated using (household_id = (select current_household_id()));

-- chore: full CRUD within household.
create policy chore_select on chore
  for select to authenticated using (household_id = (select current_household_id()));
create policy chore_insert on chore
  for insert to authenticated with check (household_id = (select current_household_id()));
create policy chore_update on chore
  for update to authenticated
  using (household_id = (select current_household_id()))
  with check (household_id = (select current_household_id()));
create policy chore_delete on chore
  for delete to authenticated using (household_id = (select current_household_id()));

-- reward_tier: full CRUD within household.
create policy reward_tier_select on reward_tier
  for select to authenticated using (household_id = (select current_household_id()));
create policy reward_tier_insert on reward_tier
  for insert to authenticated with check (household_id = (select current_household_id()));
create policy reward_tier_update on reward_tier
  for update to authenticated
  using (household_id = (select current_household_id()))
  with check (household_id = (select current_household_id()));
create policy reward_tier_delete on reward_tier
  for delete to authenticated using (household_id = (select current_household_id()));

-- board_chapter: read-only from client (managed via RPC).
create policy board_chapter_select on board_chapter
  for select to authenticated
  using (exists (
    select 1 from kid k
    where k.id = board_chapter.kid_id and k.household_id = (select current_household_id())
  ));

-- sticker_event: read within household; insert must target your household's
-- kid and be attributed to your own parent row.
create policy sticker_event_select on sticker_event
  for select to authenticated
  using (exists (
    select 1 from kid k
    where k.id = sticker_event.kid_id and k.household_id = (select current_household_id())
  ));
create policy sticker_event_insert on sticker_event
  for insert to authenticated
  with check (
    awarded_by = (select current_parent_id())
    and exists (
      select 1 from kid k
      where k.id = sticker_event.kid_id and k.household_id = (select current_household_id())
    )
    and exists (
      select 1 from board_chapter bc
      where bc.id = sticker_event.chapter_id and bc.kid_id = sticker_event.kid_id
    )
  );

-- redemption_event: read within household (insert handled via RPC in Phase 4).
create policy redemption_event_select on redemption_event
  for select to authenticated
  using (exists (
    select 1 from kid k
    where k.id = redemption_event.kid_id and k.household_id = (select current_household_id())
  ));

-- ---------------------------------------------------------------------------
-- Grants. RLS does the gating; roles still need table/function privileges.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  household, parent, kid, sticker_image, chore, reward_tier,
  board_chapter, sticker_event, redemption_event
  to authenticated;

grant execute on function
  public.create_household(text, text, text),
  public.join_household(text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: parents' phones subscribe to live changes.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table kid;
alter publication supabase_realtime add table sticker_event;
