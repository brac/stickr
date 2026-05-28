-- Harden the redeem_chapter SECURITY DEFINER function with an explicit
-- search_path, matching every other definer function in the schema. Without
-- this, the function resolves unqualified names against the caller's
-- search_path, a known privilege-escalation vector for SECURITY DEFINER.
alter function public.redeem_chapter(uuid, uuid, uuid, uuid)
  set search_path = public;
