-- Custom (ad-hoc) awards have no chore, so they carry their own name. Chore
-- awards leave this null and read their name from the chore. The label is what
-- the "Today" activity strip shows for a custom sticker; persisting it means
-- both parents' phones see the same name, not just the device that awarded it.
alter table sticker_event
  add column label text;
