-- Sticker-event / redemption integrity hardening (adversarial review, 2026-06-10).
--
-- Two related holes let a sticker land in (or be stranded in) a *closed*
-- chapter, corrupting the archived snapshot and silently dropping the sticker
-- from the kid's balance:
--
--   1. The sticker_event_insert policy verified the chapter belongs to the kid
--      but never that it is still open (`ended_at is null`). A direct insert —
--      or, far more realistically, an offline-queued award flushed after the
--      other parent redeemed the chapter — landed in the archived chapter.
--
--   2. redeem_chapter() raced concurrent awards under READ COMMITTED: it read
--      kid.current_balance, and a sticker INSERT committing between that read
--      and the chapter close ended up in the closed chapter, counted nowhere.
--
-- The fix needs two cooperating pieces, because neither alone closes the race:
--
--   * redeem_chapter() now takes `for update` on the kid row before reading the
--     balance. The balance trigger's `update kid` blocks on that lock, so an
--     award that wins the lock first is fully counted before redeem reads, and
--     its sticker carries onto the fresh board correctly.
--
--   * If redeem wins the lock first instead, the racing INSERT already passed
--     the RLS policy against a pre-commit snapshot (the chapter still looked
--     open), so the policy alone can't stop it. recompute_kid_balance() —
--     whose `update kid` is the statement that serializes on the kid lock —
--     re-checks the chapter after unblocking: in READ COMMITTED that statement
--     sees redeem's committed close, raises 'chapter closed', and rolls the
--     whole insert back. The award fails *loudly* (client rolls back the
--     optimistic sticker / drops the queued award with a toast) instead of
--     stranding the sticker.
--
-- Also in this migration:
--   * redeem_chapter() validates p_chapter_id belongs to p_kid_id (a same-
--     household caller could previously redeem kid A against kid B's chapter,
--     moving surplus stickers between kids and burning the chapter's unique
--     redemption slot).
--   * Indexes on the three unindexed FK columns (awarded_by, redeemed_by,
--     ended_by_redemption_id) — their ON DELETE SET NULL cascades otherwise
--     seq-scan at account-deletion time.
--   * An explicit grant on push_subscription: it worked only via Supabase's
--     default privileges, unlike every other table (init.sql grants by name).

-- ---------------------------------------------------------------------------
-- 1. Inserts must target an OPEN chapter.
-- ---------------------------------------------------------------------------

drop policy sticker_event_insert on public.sticker_event;
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
      where bc.id = sticker_event.chapter_id
        and bc.kid_id = sticker_event.kid_id
        and bc.ended_at is null
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Balance trigger: serialize-then-re-check against a racing redeem.
--    (Body unchanged except the post-update INSERT re-check.)
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
  -- The UPDATE above blocks on redeem_chapter()'s `for update` kid lock. If a
  -- redeem closed this insert's chapter while we waited, fail the insert
  -- loudly (READ COMMITTED: this statement sees the committed close) instead
  -- of stranding the sticker in a closed chapter. DELETE is exempt — undoing
  -- a sticker on a just-closed chapter should still succeed.
  if tg_op = 'INSERT' and exists (
    select 1 from board_chapter
    where id = new.chapter_id and ended_at is not null
  ) then
    raise exception 'chapter closed';
  end if;
  return null;
end;
$$;

comment on function public.recompute_kid_balance() is
  'Recomputes kid.current_balance after sticker_event INSERT/DELETE. '
  'Intentionally NOT fired on UPDATE: the only UPDATE path is redeem_chapter()''s '
  'surplus carry, which moves chapter_id and sets the balance itself in the same '
  'transaction — an UPDATE trigger would recompute against a stale '
  'current_chapter_id mid-move. Raises ''chapter closed'' when an INSERT races a '
  'redeem that closed its chapter (see 20260610120000_sticker_event_integrity).';

-- ---------------------------------------------------------------------------
-- 3. redeem_chapter: kid-row lock + chapter-ownership validation.
--    (Body otherwise identical to 20260528140000_redeem_chapter_idempotent.)
-- ---------------------------------------------------------------------------

create or replace function public.redeem_chapter(
  p_kid_id         uuid,
  p_chapter_id     uuid,
  p_reward_tier_id uuid,
  p_redeemed_by    uuid
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_redemption_id  uuid;
  v_new_chapter_id uuid;
  v_balance        integer;
  v_threshold      integer;
  v_surplus        integer;
begin
  -- Verify the calling user is a parent in the same household as the kid.
  if not exists (
    select 1
    from parent pr
    join kid k on k.household_id = pr.household_id
    where pr.id = p_redeemed_by
      and pr.auth_user_id = auth.uid()
      and k.id = p_kid_id
  ) then
    raise exception 'unauthorized';
  end if;

  -- Serialize against concurrent sticker awards on this kid: the balance
  -- trigger's `update kid` blocks on this lock, so the balance read below
  -- can't be recomputed under us mid-redemption. Must come before the chapter
  -- check and balance read.
  perform 1 from kid where id = p_kid_id for update;

  -- Verify the chapter is still open AND belongs to this kid (a mismatched
  -- chapter would move surplus stickers between kids and burn the chapter's
  -- unique redemption slot).
  if not exists (
    select 1 from board_chapter
    where id = p_chapter_id and kid_id = p_kid_id and ended_at is null
  ) then
    raise exception 'chapter already closed';
  end if;

  -- Capture the balance and threshold, then verify the threshold is met.
  select k.current_balance, rt.threshold
    into v_balance, v_threshold
  from reward_tier rt
  join kid k on k.id = p_kid_id
  where rt.id = p_reward_tier_id;

  if v_threshold is null or v_balance < v_threshold then
    raise exception 'balance below tier threshold';
  end if;

  v_surplus := v_balance - v_threshold;

  insert into redemption_event (kid_id, chapter_id, reward_tier_id, redeemed_by)
  values (p_kid_id, p_chapter_id, p_reward_tier_id, p_redeemed_by)
  returning id into v_redemption_id;

  update board_chapter
  set ended_at = now(), ended_by_redemption_id = v_redemption_id
  where id = p_chapter_id;

  insert into board_chapter (kid_id)
  values (p_kid_id)
  returning id into v_new_chapter_id;

  -- Carry the most recently earned surplus stickers onto the fresh board.
  -- Moving the chapter_id is enough: the client recomputes board positions
  -- from each event's order on render, so the carried stickers re-flow to the
  -- top of the new board automatically.
  if v_surplus > 0 then
    update sticker_event
    set chapter_id = v_new_chapter_id
    where id in (
      select id from sticker_event
      where chapter_id = p_chapter_id
      order by created_at desc, id desc
      limit v_surplus
    );
  end if;

  -- Point the kid at the fresh chapter; its balance is the carried surplus.
  update kid
  set current_chapter_id = v_new_chapter_id,
      current_balance = v_surplus
  where id = p_kid_id;

  return v_new_chapter_id;
exception
  -- A concurrent redeem for the same chapter trips redemption_event_chapter_unique.
  -- The winner already produced the redemption + new chapter; surface a clean
  -- error for the loser rather than the raw constraint violation.
  when unique_violation then
    raise exception 'chapter already redeemed';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. FK indexes (ON DELETE SET NULL cascades seq-scan without them).
-- ---------------------------------------------------------------------------

create index sticker_event_awarded_by_idx on sticker_event (awarded_by);
create index redemption_event_redeemed_by_idx on redemption_event (redeemed_by);
create index board_chapter_ended_by_redemption_idx on board_chapter (ended_by_redemption_id);

-- ---------------------------------------------------------------------------
-- 5. push_subscription grant: was working only via Supabase's default
--    privileges; make it explicit like every other table (init.sql ~line 395).
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.push_subscription to authenticated;
