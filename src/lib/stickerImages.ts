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
  const path = `${args.householdId}/${crypto.randomUUID()}.webp`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/webp', upsert: false })
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
