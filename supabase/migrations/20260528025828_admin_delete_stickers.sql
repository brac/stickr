-- Admin/correction: allow removing stickers (NOT a punishment mechanic — see
-- CLAUDE.md "pure positive"). Used to undo a mis-tap or reset the board.
-- The existing recompute_kid_balance trigger already fires on DELETE, so
-- kid.current_balance stays correct automatically.

create policy sticker_event_delete on sticker_event
  for delete to authenticated
  using (
    exists (
      select 1 from kid k
      where k.id = sticker_event.kid_id
        and k.household_id = (select current_household_id())
    )
  );

-- Expose the full old row in WAL so Realtime DELETE payloads carry chapter_id
-- (needed both for the realtime filter and for the RLS check on the deleted
-- row, since the row no longer exists to be re-read).
alter table sticker_event replica identity full;
