import { describe, it, expect, beforeEach, vi } from 'vitest'
import { queryResult } from '../test/queryBuilder'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from: fromMock } }))

import {
  createRewardTier,
  updateRewardTier,
  deleteRewardTier,
  type RewardTierInput,
} from './rewards'

const input: RewardTierInput = { name: '  Ice cream  ', threshold: 25 }

describe('rewards', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  describe('createRewardTier', () => {
    it('trims the name and mirrors threshold into sort_order', async () => {
      const builder = queryResult({ data: { id: 'r1' }, error: null })
      fromMock.mockReturnValue(builder)

      await createRewardTier('hh-1', input)

      expect(builder.insert).toHaveBeenCalledWith({
        household_id: 'hh-1',
        name: 'Ice cream',
        threshold: 25,
        sort_order: 25,
      })
    })

    it('throws when insert fails', async () => {
      const error = new Error('insert failed')
      fromMock.mockReturnValue(queryResult({ data: null, error }))
      await expect(createRewardTier('hh-1', input)).rejects.toBe(error)
    })
  })

  describe('updateRewardTier', () => {
    it('trims the name, mirrors sort_order, and targets the id', async () => {
      const builder = queryResult({ data: { id: 'r1' }, error: null })
      fromMock.mockReturnValue(builder)

      await updateRewardTier('r1', input)

      expect(builder.update).toHaveBeenCalledWith({
        name: 'Ice cream',
        threshold: 25,
        sort_order: 25,
      })
      expect(builder.eq).toHaveBeenCalledWith('id', 'r1')
    })
  })

  describe('deleteRewardTier', () => {
    it('resolves when the delete succeeds', async () => {
      fromMock.mockReturnValue(queryResult({ error: null }))
      await expect(deleteRewardTier('tier-1')).resolves.toBeUndefined()
    })

    it('translates an FK-violation (already redeemed) into a parent-friendly message', async () => {
      fromMock.mockReturnValue(
        queryResult({ error: { code: '23503', message: 'FK violated' } }),
      )
      await expect(deleteRewardTier('tier-1')).rejects.toThrow(
        "This reward has already been redeemed, so it can't be deleted.",
      )
    })

    it('surfaces other DB errors via their message', async () => {
      fromMock.mockReturnValue(
        queryResult({ error: { code: '500', message: 'database exploded' } }),
      )
      await expect(deleteRewardTier('tier-1')).rejects.toThrow('database exploded')
    })
  })
})
