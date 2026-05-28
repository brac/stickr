import { supabase } from './supabase'
import type { Chore, Household, Kid, Parent, StickerEvent } from './types'
import type { StickerPosition } from './stickerPlacement'

export async function fetchMyParent(): Promise<Parent | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const userId = session?.user.id
  if (!userId) {
    return null
  }
  const { data, error } = await supabase
    .from('parent')
    .select('*')
    .eq('auth_user_id', userId)
    .maybeSingle()
  if (error) {
    throw error
  }
  return data
}

export async function fetchHousehold(householdId: string): Promise<Household | null> {
  const { data, error } = await supabase
    .from('household')
    .select('*')
    .eq('id', householdId)
    .maybeSingle()
  if (error) {
    throw error
  }
  return data
}

export async function fetchKid(householdId: string): Promise<Kid | null> {
  const { data, error } = await supabase
    .from('kid')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    throw error
  }
  return data
}

export async function fetchActiveChores(householdId: string): Promise<Chore[]> {
  const { data, error } = await supabase
    .from('chore')
    .select('*')
    .eq('household_id', householdId)
    .eq('active', true)
    .order('sort_order', { ascending: true })
  if (error) {
    throw error
  }
  return data ?? []
}

export async function fetchChapterEvents(chapterId: string): Promise<StickerEvent[]> {
  const { data, error } = await supabase
    .from('sticker_event')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('created_at', { ascending: true })
  if (error) {
    throw error
  }
  return data ?? []
}

interface AwardStickerArgs {
  id: string
  kidId: string
  choreId: string | null
  chapterId: string
  parentId: string
  position: StickerPosition
}

export async function awardSticker(args: AwardStickerArgs): Promise<void> {
  // One sticker_event = one sticker (amount=1). Phase 3 will loop for +N chores.
  const { error } = await supabase.from('sticker_event').insert({
    id: args.id,
    kid_id: args.kidId,
    chore_id: args.choreId,
    chapter_id: args.chapterId,
    awarded_by: args.parentId,
    amount: 1,
    position_x: args.position.x,
    position_y: args.position.y,
    rotation: args.position.rotation,
  })
  if (error) {
    throw error
  }
}

export async function removeStickerEvent(id: string): Promise<void> {
  const { error } = await supabase.from('sticker_event').delete().eq('id', id)
  if (error) {
    throw error
  }
}

export async function clearChapterStickers(chapterId: string): Promise<void> {
  const { error } = await supabase
    .from('sticker_event')
    .delete()
    .eq('chapter_id', chapterId)
  if (error) {
    throw error
  }
}

export async function createHousehold(args: {
  householdName: string
  parentName: string
  kidName: string
}): Promise<void> {
  const { error } = await supabase.rpc('create_household', {
    p_household_name: args.householdName,
    p_parent_name: args.parentName,
    p_kid_name: args.kidName,
  })
  if (error) {
    throw error
  }
}

export async function joinHousehold(args: {
  joinCode: string
  parentName: string
}): Promise<void> {
  const { error } = await supabase.rpc('join_household', {
    p_join_code: args.joinCode,
    p_parent_name: args.parentName,
  })
  if (error) {
    throw error
  }
}
