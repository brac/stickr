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

export type RemoveRewardTierResult = 'deleted' | 'archived'

// Hard-delete a tier that has no dependents; archive (active = false) one that's
// already been redeemed. History resolves an old chapter's reward name by
// joining to the live reward_tier row, so a redeemed tier's row must survive —
// archiving hides it from the manager and redemption picker without erasing it.
export async function removeRewardTier(id: string): Promise<RemoveRewardTierResult> {
  const { error } = await supabase.from('reward_tier').delete().eq('id', id)
  if (!error) {
    return 'deleted'
  }
  // 23503 = FK restrict: a redemption_event still references this tier.
  if (error.code !== '23503') {
    throw new Error(getErrorMessage(error))
  }

  const { error: archiveError } = await supabase
    .from('reward_tier')
    .update({ active: false })
    .eq('id', id)
  if (archiveError) {
    throw new Error(getErrorMessage(archiveError))
  }
  return 'archived'
}

export async function setRewardTierActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from('reward_tier')
    .update({ active })
    .eq('id', id)
  if (error) {
    throw new Error(getErrorMessage(error))
  }
}
