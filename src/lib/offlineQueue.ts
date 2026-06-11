import type { NewSticker } from './queries'
import { reportError } from './monitoring'

// Awards taken while offline are persisted here so they survive a reload and
// flush on reconnect. NewSticker carries explicit ids, so when the queue
// flushes, realtime echoes and refetches dedupe cleanly against the board.
const KEY = 'stickr.offline.awards.v1'

export function getQueuedAwards(): NewSticker[] {
  let raw: string | null
  try {
    raw = localStorage.getItem(KEY)
  } catch (err) {
    // Storage inaccessible (private mode / disabled) — nothing to recover.
    reportError(err, { where: 'offlineQueue.getQueuedAwards: storage read' })
    return []
  }
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as NewSticker[]
    throw new Error('queued awards entry is not an array')
  } catch (err) {
    // Corrupt entry (e.g. app killed mid-write). Report once and clear it so
    // every subsequent read doesn't re-report the same corruption.
    reportError(err, { where: 'offlineQueue.getQueuedAwards: corrupt entry' })
    try {
      localStorage.removeItem(KEY)
    } catch {
      // Removal failing too means storage is broken; already reported above.
    }
    return []
  }
}

// Returns false when the queue could not be persisted — callers that just
// enqueued an award should warn the user it may not survive a reload.
function write(items: NewSticker[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
    return true
  } catch (err) {
    // localStorage unavailable (private mode / quota). The in-memory board
    // still reflects the award for this session; we just can't persist it.
    reportError(err, { where: 'offlineQueue.write' })
    return false
  }
}

export function enqueueAwards(stickers: NewSticker[]): boolean {
  if (stickers.length === 0) return true
  return write([...getQueuedAwards(), ...stickers])
}

export function removeQueuedAwards(ids: Set<string>): boolean {
  if (ids.size === 0) return true
  return write(getQueuedAwards().filter((sticker) => !ids.has(sticker.id)))
}

export function clearQueuedAwards(): boolean {
  return write([])
}
