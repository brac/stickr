import { supabase } from './supabase'
import { processStickerImage } from './imageProcessing'
import { reportError } from './monitoring'
import type { Database } from './database.types'
import type { StickerImage } from './types'

const BUCKET = 'sticker-images'

// The bucket is private (see the storage-privatization migration), so reads go
// through short-lived signed URLs instead of public URLs. 12h covers a long
// wall-mounted / kid-board session; the URL is signed once per load and reused.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 12

type StickerImageInsert = Database['public']['Tables']['sticker_image']['Insert']

// Mint signed display URLs for a set of sticker images in one batch request,
// keyed by image.id for the `imageUrls` maps the boards consume. Creating a
// signed URL requires SELECT on the object, so RLS still scopes this to the
// caller's household. Images that fail to sign are simply omitted.
export async function signStickerImageUrls(
  images: ReadonlyArray<Pick<StickerImage, 'id' | 'storage_path'>>,
): Promise<Record<string, string>> {
  if (images.length === 0) return {}
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      images.map((image) => image.storage_path),
      SIGNED_URL_TTL_SECONDS,
    )
  if (error) {
    throw error
  }
  const urlByPath = new Map(
    (data ?? [])
      .filter((entry) => entry.signedUrl && !entry.error)
      .map((entry) => [entry.path, entry.signedUrl]),
  )
  const map: Record<string, string> = {}
  for (const image of images) {
    const url = urlByPath.get(image.storage_path)
    if (url) map[image.id] = url
  }
  return map
}

export async function fetchStickerImages(
  householdId: string,
): Promise<StickerImage[]> {
  const { data, error } = await supabase
    .from('sticker_image')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
  if (error) {
    throw error
  }
  return data ?? []
}

export async function uploadStickerImage(args: {
  file: File
  householdId: string
  label: string
}): Promise<StickerImage> {
  const blob = await processStickerImage(args.file)
  // canvas.toBlob falls back to PNG when a browser can't encode WebP (notably
  // iOS Safari), so upload the type we actually produced rather than assuming
  // WebP. supabase-js uploads a Blob as multipart and takes its content type
  // from the blob itself, so the path extension must match too.
  const contentType = blob.type === 'image/webp' ? 'image/webp' : 'image/png'
  const ext = contentType === 'image/webp' ? 'webp' : 'png'
  const path = `${args.householdId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType, upsert: false })
  if (uploadError) {
    throw uploadError
  }

  const row: StickerImageInsert = {
    household_id: args.householdId,
    storage_path: path,
    label: args.label.trim() || null,
  }
  const { data, error } = await supabase
    .from('sticker_image')
    .insert(row)
    .select('*')
    .single()
  if (error) {
    // Best-effort cleanup so we don't orphan the uploaded object. Storage
    // .remove() reports failure via the error field rather than throwing, so
    // surface a cleanup failure to the dashboard (the row insert error is
    // what the user sees).
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove([path])
    if (removeError) {
      reportError(removeError, { where: 'uploadStickerImage: cleanup', path })
    }
    throw error
  }
  return data
}

export async function deleteStickerImage(image: StickerImage): Promise<void> {
  const { error } = await supabase
    .from('sticker_image')
    .delete()
    .eq('id', image.id)
  if (error) {
    throw error
  }
  // FK references (chore, sticker_event) are ON DELETE SET NULL, so history
  // simply falls back to default art. Remove the storage object too.
  //
  // Accepted window: the other parent may hold a still-valid signed URL (up to
  // SIGNED_URL_TTL_SECONDS) for this object in an already-loaded session, so
  // stickers awarded with this art can render broken there until their next
  // app open — signStickerImageUrls then omits the dead entry and the board
  // falls back cleanly. Keeping the object instead would leak storage for the
  // life of the household over a cosmetic, self-healing window.
  const { error: removeError } = await supabase.storage
    .from(BUCKET)
    .remove([image.storage_path])
  if (removeError) {
    // The row is gone either way; an orphaned object is invisible to the app
    // and gets purged with the household — report it, don't fail the delete.
    reportError(removeError, {
      where: 'deleteStickerImage: storage remove',
      path: image.storage_path,
    })
  }
}
