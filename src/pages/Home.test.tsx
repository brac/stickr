import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../components/toast/ToastProvider'
import type { Household, Kid, Parent } from '../lib/types'

// --- Module mocks ----------------------------------------------------------
// Mock the data layer so the test drives Home's load orchestration directly,
// independent of Supabase. KidColumn is stubbed so we don't drag in the kid
// board's realtime subscription — this test is about Home's degrade/retry path.

vi.mock('../lib/queries', () => ({
  fetchMyParent: vi.fn(),
  fetchHousehold: vi.fn(),
  fetchKids: vi.fn(),
  fetchRewardTiers: vi.fn(),
  setBoardLayout: vi.fn().mockResolvedValue(undefined),
  awardStickers: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/chores', () => ({ fetchActiveChores: vi.fn() }))
vi.mock('../lib/stickerImageCache', () => ({ loadStickerImages: vi.fn() }))
vi.mock('../hooks/useStickerImageUrls', () => ({
  useStickerImageUrls: () => ({}),
}))
vi.mock('../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }))
vi.mock('../lib/offlineQueue', () => ({
  getQueuedAwards: vi.fn(() => []),
  removeQueuedAwards: vi.fn(),
}))
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}))
// Error reporting is additive (Item 2): the toast/error states stay the
// user-facing surface, while reportError ships the failure to the dashboard.
vi.mock('../lib/monitoring', () => ({
  reportError: vi.fn(),
  registerScrubNames: vi.fn(),
}))
vi.mock('../components/KidColumn', () => ({
  KidColumn: ({ kid }: { kid: Kid }) => <div data-testid="kid-column">{kid.name}</div>,
}))

import { Home } from './Home'
import {
  awardStickers,
  fetchMyParent,
  fetchHousehold,
  fetchKids,
  fetchRewardTiers,
  type NewSticker,
} from '../lib/queries'
import { fetchActiveChores } from '../lib/chores'
import { loadStickerImages } from '../lib/stickerImageCache'
import { getQueuedAwards, removeQueuedAwards } from '../lib/offlineQueue'
import { reportError } from '../lib/monitoring'

const parent = { id: 'p1', household_id: 'h1', display_name: 'Parent' } as Parent
const household = { id: 'h1', name: 'The Smiths', board_layout: 'focused' } as Household
const kid = { id: 'k1', name: 'Robin', household_id: 'h1' } as Kid

function renderHome() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <Home />
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(fetchMyParent).mockResolvedValue(parent)
  vi.mocked(fetchHousehold).mockResolvedValue(household)
  vi.mocked(fetchKids).mockResolvedValue([kid])
  vi.mocked(fetchActiveChores).mockResolvedValue([])
  vi.mocked(fetchRewardTiers).mockResolvedValue([])
  vi.mocked(loadStickerImages).mockResolvedValue([])
})

describe('Home load resilience', () => {
  it('renders the board on the all-success path', async () => {
    renderHome()
    const column = await screen.findByTestId('kid-column')
    expect(column.textContent).toBe('Robin')
    expect(screen.getByText('The Smiths')).toBeTruthy()
  })

  it('degrades gracefully when a secondary query fails', async () => {
    // A non-critical reward-tier failure must NOT blank the board.
    vi.mocked(fetchRewardTiers).mockRejectedValue(new Error('stale migration 400'))
    vi.mocked(reportError).mockClear()

    renderHome()

    // The board still renders with what loaded...
    const column = await screen.findByTestId('kid-column')
    expect(column.textContent).toBe('Robin')
    // ...plus a non-fatal warning, and the failure is reported to the dashboard.
    expect(await screen.findByText(/Some of the board/i)).toBeTruthy()
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
      where: 'Home: secondary board load',
    })
  })

  it('shows a retryable error state when a critical query fails', async () => {
    vi.mocked(fetchKids).mockRejectedValueOnce(new Error('network down'))
    vi.mocked(reportError).mockClear()

    renderHome()

    // Critical failure → real error state, not a blank board.
    const retry = await screen.findByRole('button', { name: /try again/i })
    expect(screen.getByText(/Couldn’t load the board/i)).toBeTruthy()
    expect(screen.queryByTestId('kid-column')).toBeNull()
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
      where: 'Home: critical board load',
    })

    // Retrying with healthy mocks recovers the board.
    fireEvent.click(retry)
    const column = await screen.findByTestId('kid-column')
    expect(column.textContent).toBe('Robin')
  })
})

describe('Home offline queue flush', () => {
  function makeQueued(id: string): NewSticker {
    return {
      id,
      kidId: 'k1',
      choreId: 'c1',
      chapterId: 'chap-1',
      parentId: 'p1',
      stickerImageId: null,
      label: null,
      createdAt: '2026-06-10T00:00:00.000Z',
      position: { x: 0, y: 0, rotation: 0 },
    }
  }

  beforeEach(() => {
    vi.mocked(awardStickers).mockReset().mockResolvedValue(undefined)
    vi.mocked(getQueuedAwards).mockReset().mockReturnValue([])
    vi.mocked(removeQueuedAwards).mockClear()
    vi.mocked(reportError).mockClear()
  })

  it('flushes one sticker at a time and clears each from the queue', async () => {
    vi.mocked(getQueuedAwards).mockReturnValueOnce([makeQueued('q1'), makeQueued('q2')])

    renderHome()

    expect(await screen.findByText('Synced 2 stickers.')).toBeTruthy()
    expect(awardStickers).toHaveBeenCalledTimes(2)
    expect(awardStickers).toHaveBeenNthCalledWith(1, [expect.objectContaining({ id: 'q1' })])
    expect(awardStickers).toHaveBeenNthCalledWith(2, [expect.objectContaining({ id: 'q2' })])
    expect(removeQueuedAwards).toHaveBeenCalledWith(new Set(['q1']))
    expect(removeQueuedAwards).toHaveBeenCalledWith(new Set(['q2']))
  })

  it('treats a duplicate-key reject (23505) as already-synced', async () => {
    vi.mocked(getQueuedAwards).mockReturnValueOnce([makeQueued('q1'), makeQueued('q2')])
    // q1 was inserted by a previous flush that died before clearing the queue.
    vi.mocked(awardStickers)
      .mockRejectedValueOnce({ code: '23505', message: 'duplicate key value' })
      .mockResolvedValueOnce(undefined)

    renderHome()

    expect(await screen.findByText('Synced 2 stickers.')).toBeTruthy()
    expect(removeQueuedAwards).toHaveBeenCalledWith(new Set(['q1']))
    expect(removeQueuedAwards).toHaveBeenCalledWith(new Set(['q2']))
  })

  it('drops unflushable awards (closed chapter) with a visible toast', async () => {
    vi.mocked(getQueuedAwards).mockReturnValueOnce([makeQueued('q1'), makeQueued('q2')])
    // q1's chapter was redeemed while it sat in the queue.
    vi.mocked(awardStickers)
      .mockRejectedValueOnce({ code: '42501', message: 'row-level security' })
      .mockResolvedValueOnce(undefined)

    renderHome()

    expect(await screen.findByText(/couldn’t sync — the board was redeemed/i)).toBeTruthy()
    expect(await screen.findByText('Synced 1 sticker.')).toBeTruthy()
    // The dead award is removed (no permanent retry loop) and reported.
    expect(removeQueuedAwards).toHaveBeenCalledWith(new Set(['q1']))
    expect(reportError).toHaveBeenCalledWith(expect.anything(), {
      where: 'Home flushQueue: unflushable award',
    })
  })

  it('keeps the queue intact on a transient failure', async () => {
    vi.mocked(getQueuedAwards).mockReturnValueOnce([makeQueued('q1'), makeQueued('q2')])
    vi.mocked(awardStickers).mockRejectedValue(new Error('network down'))

    renderHome()
    await screen.findByTestId('kid-column')

    // Stops at the first transient failure; nothing is removed, no false
    // success toast, and the failure is reported for the dashboard.
    expect(awardStickers).toHaveBeenCalledTimes(1)
    expect(removeQueuedAwards).not.toHaveBeenCalled()
    expect(screen.queryByText(/Synced/)).toBeNull()
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), {
      where: 'Home: offline flushQueue',
    })
  })
})
