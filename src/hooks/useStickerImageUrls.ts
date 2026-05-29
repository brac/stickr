import { useEffect, useState } from 'react'
import { signStickerImageUrls } from '../lib/stickerImages'
import type { StickerImage } from '../lib/types'

// Resolves display URLs for sticker images. The bucket is private, so this mints
// short-lived signed URLs (batched) and re-signs when the set of images changes.
// Until the URLs resolve, the returned map is empty — consumers should tolerate
// a missing entry (render nothing / a placeholder) for that frame.
export function useStickerImageUrls(
  images: ReadonlyArray<Pick<StickerImage, 'id' | 'storage_path'>>,
): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({})

  // Re-sign only when the actual (id, path) set changes — not on every new array
  // identity from a refetch that returned the same images.
  const key = images.map((image) => `${image.id}:${image.storage_path}`).join('|')

  useEffect(() => {
    let active = true
    // signStickerImageUrls([]) resolves to {} — keep the reset in the async
    // callback so we never call setState synchronously inside the effect body.
    signStickerImageUrls(images)
      .then((map) => {
        if (active) setUrls(map)
      })
      .catch(() => {
        // Signing failed (offline, expired session) — fall back to no art rather
        // than surfacing an error for a non-critical visual.
        if (active) setUrls({})
      })
    return () => {
      active = false
    }
    // `key` captures the meaningful contents of `images`; depending on the array
    // identity would re-sign needlessly on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return urls
}
