-- redeem_chapter() was not idempotent: a retried or concurrent call with the
-- same chapter could insert a second redemption_event and spin up a duplicate
-- new chapter. Sequential retries are already caught by the `ended_at is null`
-- guard (the first call closes the chapter), but two calls racing before either
-- commits both pass that check and each create a redemption + a fresh chapter.
--
-- Defense in depth:
--   1. A UNIQUE (chapter_id) constraint on redemption_event makes a second
--      redemption for the same chapter impossible at the storage layer. A
--      concurrent loser blocks on the unique key, then fails when the winner
--      commits -- rolling back its whole transaction, so no duplicate chapter
--      or surplus move survives. (A chapter is redeemed at most once, so this
--      constraint is also just true of the domain.)
--   2. The RPC catches that unique_violation and re-raises it as a clean
--      'chapter already redeemed' error, so the client shows a friendly message
--      instead of a raw constraint string -- matching the existing
--      'chapter already closed' guard style.

alter table redemption_event
  add constraint redemption_event_chapter_unique unique (chapter_id);

-- (create-or-replace keeps the hardened search_path; body unchanged except for
-- the trailing exception handler.)
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

  -- Verify the chapter is still open.
  if not exists (
    select 1 from board_chapter
    where id = p_chapter_id and ended_at is null
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
