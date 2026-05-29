-- Storage for kid profile pictures (Feature 15). Mirrors the sticker-images
-- bucket but allows PNG too (iOS Safari can't encode WebP and falls back to
-- PNG). Public bucket — a kid's face on the home board isn't sensitive, and it
-- matches the SW /object/public cache rule. Objects are household-scoped:
-- "{household_id}/{kid_id}/{uuid}.{ext}" (unique per upload so re-uploads get a
-- fresh URL and dodge the service-worker image cache).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kid-avatars', 'kid-avatars', true, 2097152, array['image/webp', 'image/png'])
on conflict (id) do nothing;

create policy "kid avatars are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'kid-avatars');

create policy "household members upload kid avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'kid-avatars'
    and (storage.foldername(name))[1] = (select current_household_id())::text
  );

create policy "household members update kid avatars"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'kid-avatars'
    and (storage.foldername(name))[1] = (select current_household_id())::text
  )
  with check (
    bucket_id = 'kid-avatars'
    and (storage.foldername(name))[1] = (select current_household_id())::text
  );

create policy "household members delete kid avatars"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'kid-avatars'
    and (storage.foldername(name))[1] = (select current_household_id())::text
  );
