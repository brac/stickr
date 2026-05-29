import { supabase } from './supabase'
import { processStickerImage } from './imageProcessing'
import { getErrorMessage } from './errors'
import type { Kid } from './types'

const BUCKET = 'kid-avatars'

export function kidAvatarUrl(storagePath: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl
}

// Resize/encode the (already background-removed) image, upload it under a unique
// per-upload path, point the kid row at it, and clean up the previous object.
// A fresh path each time means re-uploads dodge the service-worker image cache.
// Returns the new storage path.
export async function uploadKidAvatar(args: {
  file: File
  householdId: string
  kidId: string
}): Promise<string> {
  const blob = await processStickerImage(args.file)
  const contentType = blob.type === 'image/webp' ? 'image/webp' : 'image/png'
  const ext = contentType === 'image/webp' ? 'webp' : 'png'
  const path = `${args.householdId}/${args.kidId}/${crypto.randomUUID()}.${ext}`

  // Note the existing avatar so we can remove it once the new one is in place.
  const { data: existing } = await supabase
    .from('kid')
    .select('avatar_path')
    .eq('id', args.kidId)
    .maybeSingle()
  const oldPath = existing?.avatar_path ?? null

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType, upsert: false })
  if (uploadError) {
    throw new Error(getErrorMessage(uploadError))
  }

  const { error } = await supabase.rpc('set_kid_avatar_path', {
    p_kid_id: args.kidId,
    p_path: path,
  })
  if (error) {
    // Don't orphan the just-uploaded object if the row update fails.
    await supabase.storage.from(BUCKET).remove([path])
    throw new Error(getErrorMessage(error))
  }

  if (oldPath && oldPath !== path) {
    // Best-effort cleanup of the previous photo.
    await supabase.storage.from(BUCKET).remove([oldPath])
  }
  return path
}

export async function removeKidAvatar(kid: Kid): Promise<void> {
  const { error } = await supabase.rpc('set_kid_avatar_path', {
    p_kid_id: kid.id,
    p_path: null,
  })
  if (error) {
    throw new Error(getErrorMessage(error))
  }
  if (kid.avatar_path) {
    await supabase.storage.from(BUCKET).remove([kid.avatar_path])
  }
}

// Set or clear (null) the fallback emoji shown when there's no photo.
export async function setKidAvatarEmoji(
  kidId: string,
  emoji: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('set_kid_avatar_emoji', {
    p_kid_id: kidId,
    p_emoji: emoji,
  })
  if (error) {
    throw new Error(getErrorMessage(error))
  }
}
