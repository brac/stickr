import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { Kid, Parent, StickerEvent } from '../lib/types'

// --- Module mocks ----------------------------------------------------------
// The realtime channel is the unit under test here: subscribe-before-fetch,
// refetch-on-rejoin, the reconcile merge, and channel-error reporting.

const { channels, removeChannel, toastMock } = vi.hoisted(() => {
  interface MockChannel {
    name: string
    statusCb: ((status: string, err?: Error) => void) | null
    on: (...args: unknown[]) => MockChannel
    subscribe: (cb?: (status: string, err?: Error) => void) => MockChannel
  }
  const channels: MockChannel[] = []
  function makeChannel(name: string): MockChannel {
    const channel: MockChannel = {
      name,
      statusCb: null,
      on: () => channel,
      subscribe: (cb) => {
        channel.statusCb = cb ?? null
        return channel
      },
    }
    channels.push(channel)
    return channel
  }
  return {
    channels,
    makeChannel,
    removeChannel: vi.fn(),
    toastMock: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    },
  }
})

vi.mock('../lib/supabase', () => ({
  supabase: {
    channel: (name: string) => {
      const channel = {
        name,
        statusCb: null as ((status: string, err?: Error) => void) | null,
        on: () => channel,
        subscribe: (cb?: (status: string, err?: Error) => void) => {
          channel.statusCb = cb ?? null
          return channel
        },
      }
      channels.push(channel)
      return channel
    },
    removeChannel,
  },
}))
vi.mock('../lib/queries', () => ({
  fetchChapterEvents: vi.fn(),
  fetchKidById: vi.fn().mockResolvedValue(null),
  awardStickers: vi.fn(),
  redeemChapter: vi.fn(),
  removeStickerEvent: vi.fn(),
  clearChapterStickers: vi.fn(),
  newStickerToEvent: (s: { id: string }) =>
    ({ id: s.id, amount: 1 }) as StickerEvent,
}))
vi.mock('../lib/offlineQueue', () => ({
  getQueuedAwards: vi.fn(() => []),
  enqueueAwards: vi.fn(() => true),
}))
vi.mock('../lib/monitoring', () => ({ reportError: vi.fn() }))
vi.mock('../components/toast/useToast', () => ({ useToast: () => toastMock }))
vi.mock('../lib/haptics', () => ({
  vibrateAward: vi.fn(),
  vibrateRedeem: vi.fn(),
  vibrateUndo: vi.fn(),
}))
vi.mock('../lib/celebrate', () => ({ celebrateRedemption: vi.fn() }))
vi.mock('../lib/juice', () => ({ flashRedemption: vi.fn() }))

import { useKidBoard } from './useKidBoard'
import { fetchChapterEvents, awardStickers } from '../lib/queries'
import { reportError } from '../lib/monitoring'

const kid = {
  id: 'k1',
  name: 'Robin',
  household_id: 'h1',
  current_chapter_id: 'chap-1',
  current_balance: 0,
} as Kid

const parent = { id: 'p1', household_id: 'h1' } as Parent

const layout = { width: 320, rowSize: 5, cellWidth: 60 }

function makeEvent(id: string): StickerEvent {
  return { id, amount: 1, chapter_id: 'chap-1', kid_id: 'k1' } as StickerEvent
}

function chapterChannel() {
  const channel = channels.find((c) => c.name === 'chapter-events-chap-1')
  if (!channel) throw new Error('chapter channel not created')
  return channel
}

function renderBoard() {
  return renderHook(() =>
    useKidBoard(kid, { parent, getLayout: () => layout }),
  )
}

beforeEach(() => {
  channels.length = 0
  removeChannel.mockClear()
  vi.mocked(reportError).mockClear()
  vi.mocked(fetchChapterEvents).mockReset().mockResolvedValue([])
  vi.mocked(awardStickers).mockReset().mockResolvedValue(undefined)
  toastMock.error.mockClear()
})

describe('useKidBoard realtime', () => {
  it('does not fetch until the channel reports SUBSCRIBED', async () => {
    renderBoard()
    // Channel exists, fetch hasn't happened: the subscribe-first ordering is
    // what closes the missed-event gap.
    expect(chapterChannel().statusCb).not.toBeNull()
    expect(fetchChapterEvents).not.toHaveBeenCalled()

    await act(async () => {
      chapterChannel().statusCb!('SUBSCRIBED')
    })
    expect(fetchChapterEvents).toHaveBeenCalledExactlyOnceWith('chap-1')
  })

  it('refetches on every SUBSCRIBED (reconnect heals missed events)', async () => {
    const { result } = renderBoard()
    vi.mocked(fetchChapterEvents).mockResolvedValueOnce([makeEvent('e1')])
    await act(async () => {
      chapterChannel().statusCb!('SUBSCRIBED')
    })
    expect(result.current.events.map((e) => e.id)).toEqual(['e1'])

    // Disconnect + rejoin: the second fetch returns what was missed.
    vi.mocked(fetchChapterEvents).mockResolvedValueOnce([
      makeEvent('e1'),
      makeEvent('e2'),
    ])
    await act(async () => {
      chapterChannel().statusCb!('SUBSCRIBED')
    })
    expect(fetchChapterEvents).toHaveBeenCalledTimes(2)
    expect(result.current.events.map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  it('reports a channel outage once and flips live false, recovering on rejoin', async () => {
    const { result } = renderBoard()
    expect(result.current.live).toBe(true)

    await act(async () => {
      chapterChannel().statusCb!('CHANNEL_ERROR', new Error('socket gone'))
      chapterChannel().statusCb!('CHANNEL_ERROR', new Error('socket gone'))
    })
    expect(result.current.live).toBe(false)
    // Once per outage, not once per flap.
    expect(reportError).toHaveBeenCalledTimes(1)

    await act(async () => {
      chapterChannel().statusCb!('SUBSCRIBED')
    })
    expect(result.current.live).toBe(true)
  })

  it('reconcile keeps in-flight optimistic awards and drops stale locals', async () => {
    const { result } = renderBoard()
    // Initial join: server knows e1 and eStale.
    vi.mocked(fetchChapterEvents).mockResolvedValueOnce([
      makeEvent('e1'),
      makeEvent('eStale'),
    ])
    await act(async () => {
      chapterChannel().statusCb!('SUBSCRIBED')
    })
    expect(result.current.events.map((e) => e.id)).toEqual(['e1', 'eStale'])

    // An award whose insert never settles — its sticker is optimistic-only.
    vi.mocked(awardStickers).mockReturnValue(new Promise(() => {}))
    act(() => {
      void result.current.award({
        choreId: null,
        stickerImageId: null,
        label: 'star',
        count: 1,
      })
    })
    expect(result.current.events).toHaveLength(3)
    const pendingId = result.current.events[2].id

    // Rejoin: server still doesn't know the pending award, and eStale was
    // deleted by the other parent while we were disconnected.
    vi.mocked(fetchChapterEvents).mockResolvedValueOnce([makeEvent('e1')])
    await act(async () => {
      chapterChannel().statusCb!('SUBSCRIBED')
    })
    expect(result.current.events.map((e) => e.id)).toEqual(['e1', pendingId])
  })

  it('cleans up both channels on unmount', () => {
    const { unmount } = renderBoard()
    expect(channels.map((c) => c.name).sort()).toEqual([
      'chapter-events-chap-1',
      'kid-k1',
    ])
    unmount()
    expect(removeChannel).toHaveBeenCalledTimes(2)
  })
})
