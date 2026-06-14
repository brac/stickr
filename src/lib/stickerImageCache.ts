import { fetchStickerImages, signStickerImageUrls } from './stickerImages'
import { reportError } from './monitoring'
import type { StickerImage } from './types'

// Caching layer over the raw sticker_image data access in stickerImages.ts.
//
// Two distinct wins, two distinct caches:
//
//   #1 In-memory rows cache — dedupes the sticker_image SELECT across pages and
//      StrictMode double-mounts within a session. Image rows change rarely (a
//      setup-time activity), so a short freshness window plus explicit
//      invalidation after a mutate is enough; we keep it in memory only so a
//      hard reload still revalidates against the DB (there is no realtime on
//      sticker_image, so the cache is how the *other* parent's changes surface).
//
//   #2 Persisted signed-URL cache — createSignedUrls() mints a fresh token on
//      every call, so a new URL string on every app open busts the service
//      worker's CacheFirst image cache and forces every sticker's bytes to be
//      re-downloaded. Persisting the URL strings and reusing them until they
//      near the 12h signing TTL keeps the URL — and therefore the SW cache key —
//      stable across reloads, so the bytes come from cache instead.

// Short enough that the other parent's uploads surface on the next navigation;
// long enough to collapse a burst of mounts (StrictMode, route changes) into one
// query.
const ROWS_TTL_MS = 60_000

// Reuse a signed URL until it is this old. Kept under the 12h signing TTL (see
// SIGNED_URL_TTL_SECONDS in stickerImages.ts) with a safety margin so a reused
// URL can never be handed out already-expired.
const URL_REUSE_TTL_MS = 10 * 60 * 60 * 1000
const URL_STORE_KEY = 'stickr.stickerImageUrls.v1'

interface RowsEntry {
  images: StickerImage[]
  fetchedAt: number
}

interface UrlEntry {
  urls: Record<string, string>
  signedAt: number
}

const rowsCache = new Map<string, RowsEntry>()
const rowsInFlight = new Map<string, Promise<StickerImage[]>>()

// localStorage mirror, hydrated lazily on first access so reads/writes go through
// one in-memory copy and we touch storage at most once per change.
let urlStore: Record<string, UrlEntry> | null = null

function loadUrlStore(): Record<string, UrlEntry> {
  if (urlStore) return urlStore
  let raw: string | null
  try {
    raw = localStorage.getItem(URL_STORE_KEY)
  } catch (err) {
    // Storage inaccessible (private mode / disabled) — run without persistence.
    reportError(err, { where: 'stickerImageCache.loadUrlStore: read' })
    urlStore = {}
    return urlStore
  }
  if (!raw) {
    urlStore = {}
    return urlStore
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      urlStore = parsed as Record<string, UrlEntry>
      return urlStore
    }
    throw new Error('sticker image URL cache is not an object')
  } catch (err) {
    // Corrupt entry (app killed mid-write). Report once and clear it so every
    // subsequent read doesn't re-report the same corruption.
    reportError(err, { where: 'stickerImageCache.loadUrlStore: corrupt entry' })
    try {
      localStorage.removeItem(URL_STORE_KEY)
    } catch {
      // Removal failing too means storage is broken; already reported above.
    }
    urlStore = {}
    return urlStore
  }
}

function saveUrlStore(store: Record<string, UrlEntry>): void {
  urlStore = store
  try {
    localStorage.setItem(URL_STORE_KEY, JSON.stringify(store))
  } catch (err) {
    // Quota / unavailable — the in-memory mirror still serves this session; we
    // just lose the cross-reload benefit.
    reportError(err, { where: 'stickerImageCache.saveUrlStore' })
  }
}

// Narrow a URL map to exactly the requested images, dropping any stale entries
// (e.g. an image the other parent deleted) from what callers see.
function pick(
  urls: Record<string, string>,
  images: ReadonlyArray<Pick<StickerImage, 'id'>>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const image of images) {
    const url = urls[image.id]
    if (url) out[image.id] = url
  }
  return out
}

// #1 — Cached sticker_image rows. Returns the in-memory copy when fresh, shares
// an in-flight request across concurrent callers, otherwise fetches.
export async function loadStickerImages(
  householdId: string,
  options?: { force?: boolean },
): Promise<StickerImage[]> {
  const force = options?.force ?? false
  const cached = rowsCache.get(householdId)
  if (!force && cached && Date.now() - cached.fetchedAt < ROWS_TTL_MS) {
    return cached.images
  }
  const existing = rowsInFlight.get(householdId)
  if (!force && existing) return existing

  const promise = fetchStickerImages(householdId)
    .then((images) => {
      rowsCache.set(householdId, { images, fetchedAt: Date.now() })
      return images
    })
    .finally(() => {
      // Only clear if we're still the registered in-flight request.
      if (rowsInFlight.get(householdId) === promise) {
        rowsInFlight.delete(householdId)
      }
    })
  rowsInFlight.set(householdId, promise)
  return promise
}

// Drop the cached rows so the next load refetches. Call after a mutate
// (upload/delete) so a navigation back within ROWS_TTL doesn't show stale rows.
// The URL cache is intentionally left alone: incremental signing covers a new
// image and pick() hides a deleted one, so existing tokens stay stable.
export function invalidateStickerImageRows(householdId: string): void {
  rowsCache.delete(householdId)
  rowsInFlight.delete(householdId)
}

// Synchronous read of whatever signed URLs are already cached and still fresh —
// used to seed component state for instant paint before the async sign resolves.
// Returns a partial map; missing entries fill in once getSignedStickerUrls runs.
export function readCachedStickerUrls(
  householdId: string | undefined,
  images: ReadonlyArray<Pick<StickerImage, 'id'>>,
): Record<string, string> {
  if (!householdId || images.length === 0) return {}
  const entry = loadUrlStore()[householdId]
  if (!entry || Date.now() - entry.signedAt >= URL_REUSE_TTL_MS) return {}
  return pick(entry.urls, images)
}

// #2 — Signed display URLs, reusing the persisted cache when fresh. Signs only
// the images not already cached (keeping existing tokens stable so the SW image
// cache stays warm), and re-signs the whole set once the batch nears expiry.
export async function getSignedStickerUrls(
  householdId: string,
  images: ReadonlyArray<Pick<StickerImage, 'id' | 'storage_path'>>,
): Promise<Record<string, string>> {
  if (images.length === 0) return {}
  const store = loadUrlStore()
  const entry = store[householdId]
  const fresh =
    entry && Date.now() - entry.signedAt < URL_REUSE_TTL_MS ? entry : null

  if (fresh) {
    const missing = images.filter((image) => !fresh.urls[image.id])
    if (missing.length === 0) {
      return pick(fresh.urls, images)
    }
    // Sign only the new images; keep the existing signedAt so the unchanged
    // tokens — and the SW cache entries keyed on them — survive.
    const signed = await signStickerImageUrls(missing)
    const merged = { ...fresh.urls, ...signed }
    saveUrlStore({
      ...store,
      [householdId]: { urls: merged, signedAt: fresh.signedAt },
    })
    return pick(merged, images)
  }

  // Cold or expired — sign the whole current set and reset the clock. Rebuilding
  // from the current images also prunes any tokens for deleted images.
  const urls = await signStickerImageUrls(images)
  saveUrlStore({ ...store, [householdId]: { urls, signedAt: Date.now() } })
  return urls
}

// Test-only: reset all in-memory + persisted cache state between cases.
export function __resetStickerImageCache(): void {
  rowsCache.clear()
  rowsInFlight.clear()
  urlStore = null
}
