-- iOS Safari can't encode WebP via canvas.toBlob and silently falls back to
-- producing a PNG, so processed stickers arrive as image/png on those devices.
-- The bucket previously allowed only image/webp, which rejected those uploads
-- with "mime type image/png is not supported". Allow PNG alongside WebP.
update storage.buckets
  set allowed_mime_types = array['image/webp', 'image/png']
  where id = 'sticker-images';
