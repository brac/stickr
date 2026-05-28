-- Atomically redeems a reward tier:
--   1. Inserts redemption_event
--   2. Archives current board_chapter
--   3. Opens a new board_chapter
--   4. Updates kid.current_chapter_id
-- Returns the new chapter id.
create or replace function redeem_chapter(
  p_kid_id        uuid,
  p_chapter_id    uuid,
  p_reward_tier_id uuid,
  p_redeemed_by   uuid
) returns uuid
language plpgsql security definer
as $$
declare
  v_redemption_id  uuid;
  v_new_chapter_id uuid;
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

  -- Verify the balance meets the tier threshold.
  if not exists (
    select 1
    from reward_tier rt
    join kid k on k.id = p_kid_id
    where rt.id = p_reward_tier_id
      and k.current_balance >= rt.threshold
  ) then
    raise exception 'balance below tier threshold';
  end if;

  insert into redemption_event (kid_id, chapter_id, reward_tier_id, redeemed_by)
  values (p_kid_id, p_chapter_id, p_reward_tier_id, p_redeemed_by)
  returning id into v_redemption_id;

  update board_chapter
  set ended_at = now(), ended_by_redemption_id = v_redemption_id
  where id = p_chapter_id;

  insert into board_chapter (kid_id)
  values (p_kid_id)
  returning id into v_new_chapter_id;

  update kid
  set current_chapter_id = v_new_chapter_id
  where id = p_kid_id;

  return v_new_chapter_id;
end;
$$;

grant execute on function redeem_chapter(uuid, uuid, uuid, uuid) to authenticated;
