import { supabase } from './supabase'
import { getErrorMessage } from './errors'
import type { RewardTier } from './types'

export interface RewardTierInput {
  name: string
  threshold: number
}

export async function createRewardTier(
  householdId: string,
  input: RewardTierInput,
): Promise<RewardTier> {
  const { data, error } = await supabase
    .from('reward_tier')
    .insert({
      household_id: householdId,
      name: input.name.trim(),
      threshold: input.threshold,
      sort_order: input.threshold,
    })
    .select('*')
    .single()
  if (error) {
    throw error
  }
  return data
}

export async function updateRewardTier(
  id: string,
  input: RewardTierInput,
): Promise<RewardTier> {
  const { data, error } = await supabase
    .from('reward_tier')
    .update({
      name: input.name.trim(),
      threshold: input.threshold,
      sort_order: input.threshold,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) {
    throw error
  }
  return data
}

export async function deleteRewardTier(id: string): Promise<void> {
  const { error } = await supabase.from('reward_tier').delete().eq('id', id)
  if (error) {
    // A tier that's already been redeemed is referenced by a redemption_event
    // (FK restrict). Translate the DB error into something a parent can act on.
    if (error.code === '23503') {
      throw new Error(
        "This reward has already been redeemed, so it can't be deleted.",
      )
    }
    throw new Error(getErrorMessage(error))
  }
}
