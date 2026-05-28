// Deterministic placement for stickers on the board.
//
// The board fills the available width: rowSize is derived from the measured
// container at render time, so phones get ~6 per row and a laptop gets more.
// Each sticker's jitter is seeded from its event id, so a given sticker always
// looks the same on a given screen width (and identical across refreshes).
//
// Positions are recomputed on render rather than read from the DB so the
// layout can re-flow as the viewport changes. The DB columns still receive a
// snapshot at award time for history/audit.

export const STICKER_SIZE = 48
export const CELL_SIZE = 56 // sticker + gap
const PAD_TOP = 12
const PAD_SIDE = 8
const JITTER_X = 8
const JITTER_Y = 6
const JITTER_ROT_DEG = 15
const MIN_ROW_SIZE = 4
const MAX_ROW_SIZE = 24

export interface BoardLayout {
  width: number
  rowSize: number
  cellWidth: number
}

export function layoutFor(width: number): BoardLayout {
  const safeWidth = Math.max(width, MIN_ROW_SIZE * CELL_SIZE + PAD_SIDE * 2)
  const fit = Math.floor((safeWidth - PAD_SIDE * 2) / CELL_SIZE)
  const rowSize = Math.max(MIN_ROW_SIZE, Math.min(MAX_ROW_SIZE, fit))
  // Distribute remaining width across rowSize cells so stickers spread evenly.
  const cellWidth = (safeWidth - PAD_SIDE * 2) / rowSize
  return { width: safeWidth, rowSize, cellWidth }
}

export function boardHeight(count: number, rowSize: number): number {
  const rows = Math.max(1, Math.ceil(count / rowSize))
  return PAD_TOP * 2 + rows * CELL_SIZE
}

// xmur3 string hash → 32-bit seed.
export function hashStringToSeed(input: string): number {
  let h = 1779033703 ^ input.length
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

// mulberry32 PRNG — small, fast, sufficient for visual jitter.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface StickerPosition {
  x: number
  y: number
  rotation: number
}

export function computeStickerPosition(
  seedId: string,
  index: number,
  layout: BoardLayout,
): StickerPosition {
  const col = index % layout.rowSize
  const row = Math.floor(index / layout.rowSize)
  const rand = mulberry32(hashStringToSeed(seedId))
  const jx = (rand() * 2 - 1) * JITTER_X
  const jy = (rand() * 2 - 1) * JITTER_Y
  const jr = (rand() * 2 - 1) * JITTER_ROT_DEG
  const baseX =
    PAD_SIDE + col * layout.cellWidth + (layout.cellWidth - STICKER_SIZE) / 2
  const baseY = PAD_TOP + row * CELL_SIZE
  return { x: baseX + jx, y: baseY + jy, rotation: jr }
}
