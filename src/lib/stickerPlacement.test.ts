import { describe, it, expect } from 'vitest'
import {
  STICKER_SIZE,
  CELL_SIZE,
  layoutFor,
  boardHeight,
  hashStringToSeed,
  computeStickerPosition,
} from './stickerPlacement'

// Placement determinism is load-bearing: the same event must render in the same
// spot across devices, refreshes, and history views (see CLAUDE.md). These
// tests pin the jitter bounds and the grid math that the board renders from.

const MIN_ROW_SIZE = 4
const MAX_ROW_SIZE = 24

describe('layoutFor', () => {
  it('fits more stickers per row as width grows', () => {
    const phone = layoutFor(390)
    const laptop = layoutFor(1280)
    expect(laptop.rowSize).toBeGreaterThan(phone.rowSize)
  })

  it('never drops below the minimum row size, even on a tiny/zero width', () => {
    expect(layoutFor(0).rowSize).toBe(MIN_ROW_SIZE)
    expect(layoutFor(100).rowSize).toBe(MIN_ROW_SIZE)
  })

  it('caps row size at the maximum on very wide screens', () => {
    expect(layoutFor(100_000).rowSize).toBe(MAX_ROW_SIZE)
  })

  it('spreads cellWidth to fill the available width', () => {
    const layout = layoutFor(800)
    // rowSize cells plus the side padding should reconstruct the safe width.
    expect(layout.cellWidth * layout.rowSize + 8 * 2).toBeCloseTo(layout.width, 5)
    // A spread cell is at least as wide as the packed cell baseline.
    expect(layout.cellWidth).toBeGreaterThanOrEqual(CELL_SIZE - 1)
  })

  it('is pure: same width yields an equal layout', () => {
    expect(layoutFor(640)).toEqual(layoutFor(640))
  })
})

describe('boardHeight', () => {
  it('reserves one row for an empty/single board', () => {
    expect(boardHeight(0, 5)).toBe(boardHeight(1, 5))
  })

  it('grows by one cell per additional row', () => {
    const oneRow = boardHeight(5, 5)
    const twoRows = boardHeight(6, 5)
    expect(twoRows - oneRow).toBe(CELL_SIZE)
  })

  it('rounds a partial row up to a full row', () => {
    // 11 stickers at 5/row = 3 rows (5,5,1).
    expect(boardHeight(11, 5)).toBe(boardHeight(15, 5))
  })
})

describe('hashStringToSeed', () => {
  it('is deterministic for the same input', () => {
    expect(hashStringToSeed('event-abc')).toBe(hashStringToSeed('event-abc'))
  })

  it('returns an unsigned 32-bit integer', () => {
    const seed = hashStringToSeed('some-uuid-value')
    expect(Number.isInteger(seed)).toBe(true)
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThanOrEqual(0xffffffff)
  })

  it('distinguishes different inputs', () => {
    expect(hashStringToSeed('a')).not.toBe(hashStringToSeed('b'))
  })

  it('handles the empty string without throwing', () => {
    expect(() => hashStringToSeed('')).not.toThrow()
  })
})

describe('computeStickerPosition', () => {
  const layout = layoutFor(390)

  it('is deterministic for the same seed, index, and layout', () => {
    const a = computeStickerPosition('evt-1', 7, layout)
    const b = computeStickerPosition('evt-1', 7, layout)
    expect(a).toEqual(b)
  })

  it('keeps jitter within the documented bounds (±8px x, ±6px y, ±28° rot)', () => {
    // Sweep many seeds: every offset from the base cell must stay in range.
    for (let i = 0; i < 200; i++) {
      const seed = `seed-${i}`
      const pos = computeStickerPosition(seed, i, layout)
      const col = i % layout.rowSize
      const row = Math.floor(i / layout.rowSize)
      const baseX = 8 + col * layout.cellWidth + (layout.cellWidth - STICKER_SIZE) / 2
      const baseY = 12 + row * CELL_SIZE
      expect(Math.abs(pos.x - baseX)).toBeLessThanOrEqual(8)
      expect(Math.abs(pos.y - baseY)).toBeLessThanOrEqual(6)
      expect(Math.abs(pos.rotation)).toBeLessThanOrEqual(28)
    }
  })

  it('wraps to the next row when index crosses rowSize', () => {
    const lastOfRow = computeStickerPosition('x', layout.rowSize - 1, layout)
    const firstOfNext = computeStickerPosition('x', layout.rowSize, layout)
    // New row sits a full cell lower, within jitter tolerance.
    expect(firstOfNext.y - lastOfRow.y).toBeGreaterThan(CELL_SIZE - 12)
  })

  it('places different seeds at the same index in distinct spots', () => {
    const a = computeStickerPosition('seed-a', 0, layout)
    const b = computeStickerPosition('seed-b', 0, layout)
    expect(a).not.toEqual(b)
  })
})
