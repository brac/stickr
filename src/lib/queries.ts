import { supabase } from './supabase'
import type { Household, Kid, Parent, RewardTier, StickerEvent } from './types'
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

export interface NewSticker {
  id: string
  kidId: string
  choreId: string | null
  chapterId: string
  parentId: string
  stickerImageId: string | null
  position: StickerPosition
}

// One sticker_event = one sticker (amount=1). A +N chore awards N at once,
// each with its own id and position.
export async function awardStickers(stickers: NewSticker[]): Promise<void> {
  if (stickers.length === 0) return
  const rows = stickers.map((sticker) => ({
    id: sticker.id,
    kid_id: sticker.kidId,
    chore_id: sticker.choreId,
    chapter_id: sticker.chapterId,
    awarded_by: sticker.parentId,
    sticker_image_id: sticker.stickerImageId,
    amount: 1,
    position_x: sticker.position.x,
    position_y: sticker.position.y,
    rotation: sticker.position.rotation,
  }))
  const { error } = await supabase.from('sticker_event').insert(rows)
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

export interface PastChapter {
  id: string
  kid_id: string
  started_at: string
  ended_at: string
  reward_name: string | null
}

export async function fetchPastChapters(kidId: string): Promise<PastChapter[]> {
  const { data, error } = await supabase
    .from('board_chapter')
    .select(`
      id, kid_id, started_at, ended_at,
      redemption_event!board_chapter_ended_by_redemption_fk (
        reward_tier ( name )
      )
    `)
    .eq('kid_id', kidId)
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false })
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => {
    const redemption = Array.isArray(row.redemption_event)
      ? row.redemption_event[0]
      : row.redemption_event
    const tier = redemption?.reward_tier
    const rewardName = Array.isArray(tier) ? (tier[0]?.name ?? null) : (tier?.name ?? null)
    return {
      id: row.id,
      kid_id: row.kid_id,
      started_at: row.started_at,
      ended_at: row.ended_at as string,
      reward_name: rewardName,
    }
  })
}

export async function fetchRewardTiers(householdId: string): Promise<RewardTier[]> {
  const { data, error } = await supabase
    .from('reward_tier')
    .select('*')
    .eq('household_id', householdId)
    .order('threshold', { ascending: true })
  if (error) {
    throw error
  }
  return data ?? []
}

interface RedeemChapterArgs {
  kidId: string
  chapterId: string
  rewardTierId: string
  redeemedBy: string
}

export async function redeemChapter(args: RedeemChapterArgs): Promise<string> {
  const { data, error } = await supabase.rpc('redeem_chapter', {
    p_kid_id: args.kidId,
    p_chapter_id: args.chapterId,
    p_reward_tier_id: args.rewardTierId,
    p_redeemed_by: args.redeemedBy,
  })
  if (error) {
    throw error
  }
  return data as string
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
