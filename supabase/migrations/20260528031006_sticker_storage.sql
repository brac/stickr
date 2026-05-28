-- Storage for uploaded sticker images. Public bucket (the art isn't sensitive
-- and public URLs make rendering trivial + cacheable). Objects are stored under
-- a household-scoped path: "{household_id}/{uuid}.webp".

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sticker-images', 'sticker-images', true, 2097152, array['image/webp'])
on conflict (id) do nothing;

-- Public read (matches the public bucket + the SW cache rule for /object/public).
create policy "sticker images are publicly readable"
  on storage.objects for select
  to public
  using (bucket_id = 'sticker-images');

-- Only household members may write/remove objects under their household folder.
create policy "household members upload sticker images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sticker-images'
    and (storage.foldername(name))[1] = (select current_household_id())::text
  );

create policy "household members delete sticker images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'sticker-images'
    and (storage.foldername(name))[1] = (select current_household_id())::text
  );
