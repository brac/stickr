import type { NewSticker } from './queries'

// Awards taken while offline are persisted here so they survive a reload and
// flush on reconnect. NewSticker carries explicit ids, so when the queue
// flushes, realtime echoes and refetches dedupe cleanly against the board.
const KEY = 'stickr.offline.awards.v1'

export function getQueuedAwards(): NewSticker[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as NewSticker[]) : []
  } catch {
    return []
  }
}

function write(items: NewSticker[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // localStorage unavailable (private mode / quota). The in-memory board
    // still reflects the award for this session; we just can't persist it.
  }
}

export function enqueueAwards(stickers: NewSticker[]): void {
  if (stickers.length === 0) return
  write([...getQueuedAwards(), ...stickers])
}

export function removeQueuedAwards(ids: Set<string>): void {
  if (ids.size === 0) return
  write(getQueuedAwards().filter((sticker) => !ids.has(sticker.id)))
}

export function clearQueuedAwards(): void {
  write([])
}
