import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  getQueuedAwards,
  enqueueAwards,
  removeQueuedAwards,
  clearQueuedAwards,
} from './offlineQueue'
import { reportError } from './monitoring'
import type { NewSticker } from './queries'

vi.mock('./monitoring', () => ({
  reportError: vi.fn(),
}))

const KEY = 'stickr.offline.awards.v1'

function makeSticker(id: string): NewSticker {
  return {
    id,
    kidId: 'kid-1',
    choreId: 'chore-1',
    chapterId: 'chap-1',
    parentId: 'parent-1',
    stickerImageId: null,
    label: null,
    createdAt: '2026-05-28T00:00:00.000Z',
    position: { x: 1, y: 2, rotation: 3 },
  }
}

describe('offlineQueue', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(reportError).mockClear()
  })

  it('returns an empty array when nothing is queued', () => {
    expect(getQueuedAwards()).toEqual([])
  })

  it('enqueues and reads back awards', () => {
    enqueueAwards([makeSticker('a'), makeSticker('b')])
    expect(getQueuedAwards().map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('appends rather than replacing on a second enqueue', () => {
    enqueueAwards([makeSticker('a')])
    enqueueAwards([makeSticker('b')])
    expect(getQueuedAwards().map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('is a no-op when enqueuing an empty list', () => {
    enqueueAwards([])
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('removes only the listed ids', () => {
    enqueueAwards([makeSticker('a'), makeSticker('b'), makeSticker('c')])
    removeQueuedAwards(new Set(['b']))
    expect(getQueuedAwards().map((s) => s.id)).toEqual(['a', 'c'])
  })

  it('skips the write when the remove set is empty', () => {
    enqueueAwards([makeSticker('a')])
    const before = localStorage.getItem(KEY)
    removeQueuedAwards(new Set())
    expect(localStorage.getItem(KEY)).toBe(before)
  })

  it('clears the queue', () => {
    enqueueAwards([makeSticker('a')])
    clearQueuedAwards()
    expect(getQueuedAwards()).toEqual([])
  })

  it('returns an empty array for corrupt JSON, reports it, and clears the entry', () => {
    localStorage.setItem(KEY, '{not valid json')
    expect(getQueuedAwards()).toEqual([])
    expect(reportError).toHaveBeenCalledTimes(1)
    // The corrupt entry is gone, so the next read doesn't re-report.
    expect(localStorage.getItem(KEY)).toBeNull()
    expect(getQueuedAwards()).toEqual([])
    expect(reportError).toHaveBeenCalledTimes(1)
  })

  it('returns an empty array when stored value is not an array, reports + clears', () => {
    localStorage.setItem(KEY, JSON.stringify({ foo: 'bar' }))
    expect(getQueuedAwards()).toEqual([])
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('reports success from write-path helpers as true', () => {
    expect(enqueueAwards([makeSticker('a')])).toBe(true)
    expect(removeQueuedAwards(new Set(['a']))).toBe(true)
    expect(clearQueuedAwards()).toBe(true)
  })

  describe('when localStorage is unavailable', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('returns false and reports on write failure (private mode / quota)', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
      expect(enqueueAwards([makeSticker('a')])).toBe(false)
      expect(reportError).toHaveBeenCalledTimes(1)
    })

    it('returns an empty array and reports if reading throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('access denied')
      })
      expect(getQueuedAwards()).toEqual([])
      expect(reportError).toHaveBeenCalledTimes(1)
    })
  })
})
