import { supabase } from './supabase'
import type { Chore } from './types'

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

export async function fetchAllChores(householdId: string): Promise<Chore[]> {
  const { data, error } = await supabase
    .from('chore')
    .select('*')
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true })
  if (error) {
    throw error
  }
  return data ?? []
}

export interface ChoreInput {
  name: string
  stickerValue: number
  stickerImageId: string | null
  sortOrder: number
}

export async function createChore(
  householdId: string,
  input: ChoreInput,
): Promise<Chore> {
  const { data, error } = await supabase
    .from('chore')
    .insert({
      household_id: householdId,
      name: input.name.trim(),
      sticker_value: input.stickerValue,
      sticker_image_id: input.stickerImageId,
      sort_order: input.sortOrder,
    })
    .select('*')
    .single()
  if (error) {
    throw error
  }
  return data
}

export async function updateChore(
  id: string,
  input: ChoreInput,
): Promise<Chore> {
  const { data, error } = await supabase
    .from('chore')
    .update({
      name: input.name.trim(),
      sticker_value: input.stickerValue,
      sticker_image_id: input.stickerImageId,
      sort_order: input.sortOrder,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) {
    throw error
  }
  return data
}

export async function setChoreActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('chore').update({ active }).eq('id', id)
  if (error) {
    throw error
  }
}
