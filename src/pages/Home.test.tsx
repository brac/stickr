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
vi.mock('../lib/stickerImages', () => ({ fetchStickerImages: vi.fn() }))
vi.mock('../hooks/useStickerImageUrls', () => ({
  useStickerImageUrls: () => ({}),
}))
vi.mock('../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }))
vi.mock('../lib/offlineQueue', () => ({
  getQueuedAwards: () => [],
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
  fetchMyParent,
  fetchHousehold,
  fetchKids,
  fetchRewardTiers,
} from '../lib/queries'
import { fetchActiveChores } from '../lib/chores'
import { fetchStickerImages } from '../lib/stickerImages'
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
  vi.mocked(fetchStickerImages).mockResolvedValue([])
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
