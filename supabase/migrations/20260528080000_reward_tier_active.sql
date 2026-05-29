-- Soft-delete support for reward tiers, mirroring the chore.active pattern.
--
-- A reward tier that has never been redeemed can be hard-deleted, but once a
-- redemption_event references it the FK (restrict) blocks deletion — and we
-- can't safely repurpose the row either, because History resolves an old
-- chapter's reward name by joining back to the live reward_tier row. So instead
-- of deleting, we archive: active = false hides the tier from the reward manager
-- and the redemption picker while keeping the row alive for history.
alter table reward_tier
  add column active boolean not null default true;

-- Active-tier lookups (manager list + redemption picker) are always scoped to a
-- household; a partial index keeps those reads cheap as archived tiers pile up.
create index if not exists reward_tier_active_idx
  on reward_tier (household_id)
  where active;
