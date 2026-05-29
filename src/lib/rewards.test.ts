import { describe, it, expect, beforeEach, vi } from 'vitest'
import { queryResult } from '../test/queryBuilder'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from: fromMock } }))

import {
  createRewardTier,
  updateRewardTier,
  removeRewardTier,
  setRewardTierActive,
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

  describe('removeRewardTier', () => {
    it('hard-deletes an unreferenced tier and reports "deleted"', async () => {
      const builder = queryResult({ error: null })
      fromMock.mockReturnValue(builder)

      await expect(removeRewardTier('tier-1')).resolves.toBe('deleted')
      expect(builder.delete).toHaveBeenCalled()
      // No archive update should have run when the delete succeeded.
      expect(builder.update).not.toHaveBeenCalled()
    })

    it('archives (active=false) a redeemed tier and reports "archived"', async () => {
      // First call (delete) hits the FK restrict; second call (update) succeeds.
      const deleteBuilder = queryResult({ error: { code: '23503', message: 'FK' } })
      const archiveBuilder = queryResult({ error: null })
      fromMock
        .mockReturnValueOnce(deleteBuilder)
        .mockReturnValueOnce(archiveBuilder)

      await expect(removeRewardTier('tier-1')).resolves.toBe('archived')
      expect(archiveBuilder.update).toHaveBeenCalledWith({ active: false })
      expect(archiveBuilder.eq).toHaveBeenCalledWith('id', 'tier-1')
    })

    it('surfaces non-FK delete errors via their message', async () => {
      fromMock.mockReturnValue(
        queryResult({ error: { code: '500', message: 'database exploded' } }),
      )
      await expect(removeRewardTier('tier-1')).rejects.toThrow('database exploded')
    })

    it('surfaces an archive failure that follows the FK block', async () => {
      fromMock
        .mockReturnValueOnce(queryResult({ error: { code: '23503', message: 'FK' } }))
        .mockReturnValueOnce(
          queryResult({ error: { code: '500', message: 'archive failed' } }),
        )
      await expect(removeRewardTier('tier-1')).rejects.toThrow('archive failed')
    })
  })

  describe('setRewardTierActive', () => {
    it('restores a tier by setting active=true on the id', async () => {
      const builder = queryResult({ error: null })
      fromMock.mockReturnValue(builder)

      await setRewardTierActive('tier-1', true)

      expect(builder.update).toHaveBeenCalledWith({ active: true })
      expect(builder.eq).toHaveBeenCalledWith('id', 'tier-1')
    })

    it('throws when the update fails', async () => {
      fromMock.mockReturnValue(
        queryResult({ error: { code: '500', message: 'update failed' } }),
      )
      await expect(setRewardTierActive('tier-1', false)).rejects.toThrow(
        'update failed',
      )
    })
  })
})
