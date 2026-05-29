-- Feature 16 (in-app account deletion): let a parent be deleted without
-- destroying or misattributing the history they created.
--
-- sticker_event.awarded_by and redemption_event.redeemed_by were declared
-- NOT NULL with the default RESTRICT foreign-key action. That blocks deleting
-- any parent who has ever awarded a sticker or redeemed a reward — which is
-- exactly the co-parent removal path of account deletion.
--
-- Switch both to ON DELETE SET NULL so a removed parent's events survive as
-- "by a since-removed parent" rather than blocking the delete. Reassigning to
-- the remaining parent was rejected: it would lie about who did it.
--
-- The constraints were created inline in init.sql, so Postgres named them with
-- its default convention: <table>_<column>_fkey.

alter table public.sticker_event
  alter column awarded_by drop not null;

alter table public.sticker_event
  drop constraint sticker_event_awarded_by_fkey,
  add constraint sticker_event_awarded_by_fkey
    foreign key (awarded_by) references public.parent (id) on delete set null;

alter table public.redemption_event
  alter column redeemed_by drop not null;

alter table public.redemption_event
  drop constraint redemption_event_redeemed_by_fkey,
  add constraint redemption_event_redeemed_by_fkey
    foreign key (redeemed_by) references public.parent (id) on delete set null;
