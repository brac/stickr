import { describe, it, expect, beforeEach, vi } from 'vitest'
import { queryResult } from '../test/queryBuilder'

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from: fromMock } }))

import {
  fetchActiveChores,
  fetchAllChores,
  createChore,
  updateChore,
  setChoreActive,
  type ChoreInput,
} from './chores'

const input: ChoreInput = {
  name: '  Make bed  ',
  stickerValue: 2,
  stickerImageId: 'img-1',
  sortOrder: 3,
}

describe('chores', () => {
  beforeEach(() => {
    fromMock.mockReset()
  })

  describe('fetchActiveChores', () => {
    it('returns the rows on success', async () => {
      const rows = [{ id: 'c1' }, { id: 'c2' }]
      fromMock.mockReturnValue(queryResult({ data: rows, error: null }))
      await expect(fetchActiveChores('hh-1')).resolves.toEqual(rows)
    })

    it('coalesces a null data payload to an empty array', async () => {
      fromMock.mockReturnValue(queryResult({ data: null, error: null }))
      await expect(fetchActiveChores('hh-1')).resolves.toEqual([])
    })

    it('throws the underlying error', async () => {
      const error = new Error('db down')
      fromMock.mockReturnValue(queryResult({ data: null, error }))
      await expect(fetchActiveChores('hh-1')).rejects.toBe(error)
    })
  })

  describe('fetchAllChores', () => {
    it('returns rows on success', async () => {
      fromMock.mockReturnValue(queryResult({ data: [{ id: 'c1' }], error: null }))
      await expect(fetchAllChores('hh-1')).resolves.toHaveLength(1)
    })
  })

  describe('createChore', () => {
    it('trims the name and shapes the insert payload', async () => {
      const builder = queryResult({ data: { id: 'new' }, error: null })
      fromMock.mockReturnValue(builder)

      const result = await createChore('hh-1', input)

      expect(result).toEqual({ id: 'new' })
      expect(fromMock).toHaveBeenCalledWith('chore')
      expect(builder.insert).toHaveBeenCalledWith({
        household_id: 'hh-1',
        name: 'Make bed',
        sticker_value: 2,
        sticker_image_id: 'img-1',
        sort_order: 3,
      })
    })

    it('throws when the insert fails', async () => {
      const error = new Error('insert failed')
      fromMock.mockReturnValue(queryResult({ data: null, error }))
      await expect(createChore('hh-1', input)).rejects.toBe(error)
    })
  })

  describe('updateChore', () => {
    it('trims the name and targets the id', async () => {
      const builder = queryResult({ data: { id: 'c1' }, error: null })
      fromMock.mockReturnValue(builder)

      await updateChore('c1', input)

      expect(builder.update).toHaveBeenCalledWith({
        name: 'Make bed',
        sticker_value: 2,
        sticker_image_id: 'img-1',
        sort_order: 3,
      })
      expect(builder.eq).toHaveBeenCalledWith('id', 'c1')
    })
  })

  describe('setChoreActive', () => {
    it('updates the active flag for the id', async () => {
      const builder = queryResult({ error: null })
      fromMock.mockReturnValue(builder)

      await setChoreActive('c1', false)

      expect(builder.update).toHaveBeenCalledWith({ active: false })
      expect(builder.eq).toHaveBeenCalledWith('id', 'c1')
    })

    it('throws on error', async () => {
      const error = new Error('nope')
      fromMock.mockReturnValue(queryResult({ error }))
      await expect(setChoreActive('c1', true)).rejects.toBe(error)
    })
  })
})
