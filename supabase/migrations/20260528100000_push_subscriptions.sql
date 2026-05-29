-- Web Push subscriptions, one row per device a parent has opted in on. The
-- send-award-push Edge Function (service role, bypasses RLS) reads these to
-- notify the *other* parent when a sticker is awarded. Feature 9.

create table push_subscription (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null references parent (id) on delete cascade,
  -- The push service endpoint uniquely identifies a device subscription, so we
  -- upsert on it: re-enabling on the same device refreshes rather than dupes.
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index push_subscription_parent_idx on push_subscription (parent_id);

alter table push_subscription enable row level security;

-- A parent may only see and manage their own device subscriptions.
create policy push_subscription_select on push_subscription
  for select to authenticated
  using (parent_id = (select current_parent_id()));
create policy push_subscription_insert on push_subscription
  for insert to authenticated
  with check (parent_id = (select current_parent_id()));
create policy push_subscription_update on push_subscription
  for update to authenticated
  using (parent_id = (select current_parent_id()))
  with check (parent_id = (select current_parent_id()));
create policy push_subscription_delete on push_subscription
  for delete to authenticated
  using (parent_id = (select current_parent_id()));
