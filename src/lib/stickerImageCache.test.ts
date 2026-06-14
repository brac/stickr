import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('./stickerImages', () => ({
  fetchStickerImages: vi.fn(),
  signStickerImageUrls: vi.fn(),
}))
vi.mock('./monitoring', () => ({ reportError: vi.fn() }))

import {
  loadStickerImages,
  invalidateStickerImageRows,
  getSignedStickerUrls,
  readCachedStickerUrls,
  __resetStickerImageCache,
} from './stickerImageCache'
import { fetchStickerImages, signStickerImageUrls } from './stickerImages'
import { reportError } from './monitoring'
import type { StickerImage } from './types'

const STORE_KEY = 'stickr.stickerImageUrls.v1'
const ROWS_TTL_MS = 60_000
const URL_REUSE_TTL_MS = 10 * 60 * 60 * 1000
const BASE = new Date('2026-06-14T12:00:00.000Z').getTime()

function img(id: string): StickerImage {
  return {
    id,
    household_id: 'hh-1',
    storage_path: `hh-1/${id}.webp`,
    label: null,
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

// Sign whatever paths are passed, so tests can assert exactly which images were
// (re)signed via the mock's call args.
function signByPassedImages() {
  vi.mocked(signStickerImageUrls).mockImplementation(async (images) =>
    Object.fromEntries(images.map((i) => [i.id, `url-${i.id}`])),
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BASE)
  localStorage.clear()
  __resetStickerImageCache()
  vi.mocked(fetchStickerImages).mockReset()
  vi.mocked(signStickerImageUrls).mockReset()
  vi.mocked(reportError).mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('loadStickerImages (#1 in-session rows cache)', () => {
  it('fetches once and serves the cache on the next call within the TTL', async () => {
    vi.mocked(fetchStickerImages).mockResolvedValue([img('a')])

    const first = await loadStickerImages('hh-1')
    const second = await loadStickerImages('hh-1')

    expect(first).toEqual([img('a')])
    expect(second).toEqual([img('a')])
    expect(fetchStickerImages).toHaveBeenCalledTimes(1)
  })

  it('collapses concurrent calls into a single in-flight request', async () => {
    let resolveFetch!: (rows: StickerImage[]) => void
    vi.mocked(fetchStickerImages).mockReturnValue(
      new Promise<StickerImage[]>((res) => {
        resolveFetch = res
      }),
    )

    const p1 = loadStickerImages('hh-1')
    const p2 = loadStickerImages('hh-1')
    resolveFetch([img('a')])
    const [r1, r2] = await Promise.all([p1, p2])

    expect(fetchStickerImages).toHaveBeenCalledTimes(1)
    expect(r1).toEqual([img('a')])
    expect(r2).toEqual([img('a')])
  })

  it('refetches after the rows TTL expires', async () => {
    vi.mocked(fetchStickerImages).mockResolvedValue([img('a')])

    await loadStickerImages('hh-1')
    vi.setSystemTime(BASE + ROWS_TTL_MS + 1)
    await loadStickerImages('hh-1')

    expect(fetchStickerImages).toHaveBeenCalledTimes(2)
  })

  it('force refetches even within the TTL', async () => {
    vi.mocked(fetchStickerImages).mockResolvedValue([img('a')])

    await loadStickerImages('hh-1')
    await loadStickerImages('hh-1', { force: true })

    expect(fetchStickerImages).toHaveBeenCalledTimes(2)
  })

  it('invalidateStickerImageRows forces the next load to refetch', async () => {
    vi.mocked(fetchStickerImages).mockResolvedValue([img('a')])

    await loadStickerImages('hh-1')
    invalidateStickerImageRows('hh-1')
    await loadStickerImages('hh-1')

    expect(fetchStickerImages).toHaveBeenCalledTimes(2)
  })
})

describe('getSignedStickerUrls (#2 persisted URL cache)', () => {
  it('signs the full set on a cold cache and returns the map', async () => {
    signByPassedImages()

    const map = await getSignedStickerUrls('hh-1', [img('a'), img('b')])

    expect(map).toEqual({ a: 'url-a', b: 'url-b' })
    expect(signStickerImageUrls).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(STORE_KEY)).toContain('url-a')
  })

  it('reuses cached URLs without re-signing on the next call', async () => {
    signByPassedImages()

    await getSignedStickerUrls('hh-1', [img('a')])
    const again = await getSignedStickerUrls('hh-1', [img('a')])

    expect(again).toEqual({ a: 'url-a' })
    expect(signStickerImageUrls).toHaveBeenCalledTimes(1)
  })

  it('reuses URLs persisted in localStorage across a fresh module load', async () => {
    signByPassedImages()

    await getSignedStickerUrls('hh-1', [img('a')])
    // Simulate an app reload: in-memory mirror is gone, localStorage remains.
    __resetStickerImageCache()
    const afterReload = await getSignedStickerUrls('hh-1', [img('a')])

    expect(afterReload).toEqual({ a: 'url-a' })
    expect(signStickerImageUrls).toHaveBeenCalledTimes(1)
  })

  it('incrementally signs only newly added images, keeping existing tokens', async () => {
    signByPassedImages()

    await getSignedStickerUrls('hh-1', [img('a')])
    const map = await getSignedStickerUrls('hh-1', [img('a'), img('b')])

    expect(map).toEqual({ a: 'url-a', b: 'url-b' })
    expect(signStickerImageUrls).toHaveBeenCalledTimes(2)
    // The second call signs only the missing image, leaving a's token alone.
    expect(vi.mocked(signStickerImageUrls).mock.calls[1][0]).toEqual([img('b')])
  })

  it('re-signs the whole set after the reuse TTL expires', async () => {
    signByPassedImages()

    await getSignedStickerUrls('hh-1', [img('a')])
    vi.setSystemTime(BASE + URL_REUSE_TTL_MS + 1)
    await getSignedStickerUrls('hh-1', [img('a')])

    expect(signStickerImageUrls).toHaveBeenCalledTimes(2)
    expect(vi.mocked(signStickerImageUrls).mock.calls[1][0]).toEqual([img('a')])
  })

  it('omits URLs for images no longer requested (e.g. deleted)', async () => {
    signByPassedImages()

    await getSignedStickerUrls('hh-1', [img('a'), img('b')])
    const map = await getSignedStickerUrls('hh-1', [img('a')])

    expect(map).toEqual({ a: 'url-a' })
    // Still fresh and covers a → no extra sign.
    expect(signStickerImageUrls).toHaveBeenCalledTimes(1)
  })

  it('returns an empty map and skips signing for no images', async () => {
    await expect(getSignedStickerUrls('hh-1', [])).resolves.toEqual({})
    expect(signStickerImageUrls).not.toHaveBeenCalled()
  })

  it('propagates a signing error and persists nothing', async () => {
    const error = new Error('sign failed')
    vi.mocked(signStickerImageUrls).mockRejectedValue(error)

    await expect(
      getSignedStickerUrls('hh-1', [img('a')]),
    ).rejects.toBe(error)
    expect(localStorage.getItem(STORE_KEY)).toBeNull()
  })
})

describe('readCachedStickerUrls (synchronous instant-paint read)', () => {
  it('returns {} when nothing is cached', () => {
    expect(readCachedStickerUrls('hh-1', [img('a')])).toEqual({})
  })

  it('returns cached fresh URLs synchronously after a sign', async () => {
    signByPassedImages()
    await getSignedStickerUrls('hh-1', [img('a')])

    expect(readCachedStickerUrls('hh-1', [img('a')])).toEqual({ a: 'url-a' })
  })

  it('returns {} for an undefined household or empty image list', async () => {
    signByPassedImages()
    await getSignedStickerUrls('hh-1', [img('a')])

    expect(readCachedStickerUrls(undefined, [img('a')])).toEqual({})
    expect(readCachedStickerUrls('hh-1', [])).toEqual({})
  })

  it('returns {} once the cached URLs cross the reuse TTL', async () => {
    signByPassedImages()
    await getSignedStickerUrls('hh-1', [img('a')])

    vi.setSystemTime(BASE + URL_REUSE_TTL_MS + 1)
    expect(readCachedStickerUrls('hh-1', [img('a')])).toEqual({})
  })
})

describe('localStorage resilience', () => {
  it('reports and recovers from a corrupt URL cache entry', async () => {
    localStorage.setItem(STORE_KEY, '{ not json')
    __resetStickerImageCache()
    signByPassedImages()

    const map = await getSignedStickerUrls('hh-1', [img('a')])

    expect(map).toEqual({ a: 'url-a' })
    expect(reportError).toHaveBeenCalledWith(expect.anything(), {
      where: 'stickerImageCache.loadUrlStore: corrupt entry',
    })
  })

  it('treats a non-object cache entry as corrupt', async () => {
    localStorage.setItem(STORE_KEY, '[]')
    __resetStickerImageCache()
    signByPassedImages()

    await getSignedStickerUrls('hh-1', [img('a')])

    expect(reportError).toHaveBeenCalledWith(expect.anything(), {
      where: 'stickerImageCache.loadUrlStore: corrupt entry',
    })
  })

  it('runs without persistence when storage reads throw', async () => {
    const spy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('storage blocked')
      })
    __resetStickerImageCache()
    signByPassedImages()

    const map = await getSignedStickerUrls('hh-1', [img('a')])

    expect(map).toEqual({ a: 'url-a' })
    expect(reportError).toHaveBeenCalledWith(expect.anything(), {
      where: 'stickerImageCache.loadUrlStore: read',
    })
    spy.mockRestore()
  })
})
