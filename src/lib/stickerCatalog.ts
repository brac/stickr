// Default sticker artwork — the drop-in slot.
//
// Anything you drop into `src/assets/stickers/` (.png, .svg, .jpg, .jpeg, .webp)
// is auto-imported at build time and becomes part of the rotation. Delete the
// default star-*.svg files to start fresh, or add your own alongside them.
// The seeded picker assigns a stable choice per sticker event, so a given
// sticker always shows the same artwork across devices.
//
// In Phase 3, per-household uploads via Supabase Storage will plug into the
// same rendering path via URL — the <Sticker /> component doesn't care
// whether the URL came from this folder or from the network.

import { hashStringToSeed } from './stickerPlacement'

const modules = import.meta.glob(
  '../assets/stickers/*.{png,svg,jpg,jpeg,webp}',
  { eager: true, query: '?url', import: 'default' },
)

const CATALOG: readonly string[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url as string)

export function pickStickerArt(seedId: string): string | null {
  if (CATALOG.length === 0) {
    return null
  }
  return CATALOG[hashStringToSeed(seedId) % CATALOG.length]
}
