import { useEffect, useState } from 'react'
import {
  getSignedStickerUrls,
  readCachedStickerUrls,
} from '../lib/stickerImageCache'
import { reportError } from '../lib/monitoring'
import type { StickerImage } from '../lib/types'

// Resolves display URLs for sticker images. The bucket is private, so this mints
// short-lived signed URLs (batched). URLs are cached per household and reused
// across reloads (see stickerImageCache) so the same string — and therefore the
// service worker's image cache entry — stays stable. Initial state is seeded
// synchronously from that cache for instant paint; until the async sign resolves
// for any uncached image, that entry is missing — consumers should tolerate it
// (render nothing / a placeholder) for that frame.
export function useStickerImageUrls(
  householdId: string | undefined,
  images: ReadonlyArray<Pick<StickerImage, 'id' | 'storage_path'>>,
): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>(() =>
    readCachedStickerUrls(householdId, images),
  )

  // Re-sign only when the household or the actual (id, path) set changes — not on
  // every new array identity from a refetch that returned the same images.
  const key = images.map((image) => `${image.id}:${image.storage_path}`).join('|')

  useEffect(() => {
    // No household yet → nothing to sign. Leave any seeded state in place rather
    // than blanking it; the effect re-runs once the household id resolves.
    if (!householdId) return
    let active = true
    getSignedStickerUrls(householdId, images)
      .then((map) => {
        if (active) setUrls(map)
      })
      .catch((err) => {
        // Signing failed (offline, expired session) — fall back to no art rather
        // than surfacing an error for a non-critical visual, but report it: a
        // persistent failure here blanks every sticker on the board.
        reportError(err, { where: 'useStickerImageUrls: sign' })
        if (active) setUrls({})
      })
    return () => {
      active = false
    }
    // `key` captures the meaningful contents of `images`; depending on the array
    // identity would re-sign needlessly on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, key])

  return urls
}
