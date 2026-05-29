import { supabase } from './supabase'
import { processStickerImage } from './imageProcessing'
import type { Database } from './database.types'
import type { StickerImage } from './types'

const BUCKET = 'sticker-images'

type StickerImageInsert = Database['public']['Tables']['sticker_image']['Insert']

export function stickerImageUrl(storagePath: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl
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
    // Best-effort cleanup so we don't orphan the uploaded object.
    await supabase.storage.from(BUCKET).remove([path])
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
  await supabase.storage.from(BUCKET).remove([image.storage_path])
}
