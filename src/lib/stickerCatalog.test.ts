import { describe, it, expect } from 'vitest'
import { pickStickerArt } from './stickerCatalog'

// The default catalog is whatever lives in src/assets/stickers (the bundled
// star-*.svg set ships with v1). pickStickerArt must assign a stable choice
// per seed so a sticker shows the same art everywhere.

describe('pickStickerArt', () => {
  it('returns a non-empty url from the bundled catalog', () => {
    const art = pickStickerArt('evt-1')
    expect(art).toBeTruthy()
    expect(typeof art).toBe('string')
  })

  it('is deterministic for a given seed', () => {
    expect(pickStickerArt('evt-42')).toBe(pickStickerArt('evt-42'))
  })

  it('spreads different seeds across more than one artwork', () => {
    const picks = new Set(
      Array.from({ length: 50 }, (_, i) => pickStickerArt(`seed-${i}`)),
    )
    expect(picks.size).toBeGreaterThan(1)
  })
})
