import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  awardStickers,
  clearChapterStickers,
  fetchChapterEvents,
  newStickerToEvent,
  redeemChapter,
  removeStickerEvent,
  type NewSticker,
} from '../lib/queries'
import { computeStickerPosition, type BoardLayout } from '../lib/stickerPlacement'
import { enqueueAwards, getQueuedAwards } from '../lib/offlineQueue'
import { getErrorMessage } from '../lib/errors'
import { vibrateAward, vibrateRedeem, vibrateUndo } from '../lib/haptics'
import { celebrateRedemption } from '../lib/celebrate'
import { useToast } from '../components/toast/useToast'
import type { Kid, Parent, RewardTier, StickerEvent } from '../lib/types'

export interface AwardParams {
  choreId: string | null
  stickerImageId: string | null
  label: string | null
  count: number
}

export interface UseKidBoardOptions {
  parent: Parent | null
  // Read the current board layout lazily so resizes don't recreate callbacks or
  // resubscribe realtime. Each board column passes its own column's layout.
  getLayout: () => BoardLayout
}

export interface KidBoard {
  kid: Kid
  events: StickerEvent[]
  total: number
  newIds: ReadonlySet<string>
  award: (params: AwardParams) => Promise<void>
  undoLast: () => Promise<void>
  resetBoard: () => Promise<void>
  redeem: (tier: RewardTier) => Promise<void>
}

// How long a freshly awarded sticker keeps its drop-in flag, after which it is
// cleared. Comfortably past the 460ms drop animation.
const NEW_STICKER_MS = 600

function pluralStickers(count: number): string {
  return `${count} ${count === 1 ? 'sticker' : 'stickers'}`
}

// Owns one kid's board: the current chapter's events, the two realtime
// subscriptions (chapter sticker_event INSERT/DELETE, and the kid row UPDATE),
// and the optimistic award/undo/reset/redeem logic. Mount one instance per kid.
//
// Offline-queue *flushing* is deliberately NOT here — it's drained once at the
// Home level so multiple mounted boards don't race on the shared queue. Each
// board still enqueues its own awards when an award fails offline.
export function useKidBoard(
  initialKid: Kid,
  { parent, getLayout }: UseKidBoardOptions,
): KidBoard {
  const toast = useToast()
  const [kid, setKid] = useState<Kid>(initialKid)
  const [events, setEvents] = useState<StickerEvent[]>([])
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(() => new Set())

  // Refs so the award/undo/reset/redeem callbacks stay stable (no churn on
  // every sticker) while still reading the latest values. Synced in effects so
  // we never mutate a ref during render; callbacks run post-commit.
  const eventsRef = useRef(events)
  useEffect(() => {
    eventsRef.current = events
  }, [events])
  const kidRef = useRef(kid)
  useEffect(() => {
    kidRef.current = kid
  }, [kid])

  const chapterId = kid.current_chapter_id ?? null

  // Load + live-sync the current chapter's stickers. Keyed on chapterId so a
  // redemption (which moves the kid to a fresh chapter) reloads the board.
  useEffect(() => {
    if (!chapterId) return
    let active = true
    fetchChapterEvents(chapterId)
      .then((rows) => {
        if (!active) return
        // Re-show any awards queued offline for this chapter (survives reload).
        const existing = new Set(rows.map((row) => row.id))
        const queued = getQueuedAwards()
          .filter((q) => q.chapterId === chapterId && !existing.has(q.id))
          .map(newStickerToEvent)
        setEvents([...rows, ...queued])
      })
      .catch((err) => {
        if (active) toast.error(getErrorMessage(err))
      })
    const channel = supabase
      .channel(`chapter-events-${chapterId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'sticker_event',
          filter: `chapter_id=eq.${chapterId}`,
        },
        (payload) => {
          const incoming = payload.new as StickerEvent
          setEvents((prev) =>
            prev.some((e) => e.id === incoming.id) ? prev : [...prev, incoming],
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'sticker_event',
          filter: `chapter_id=eq.${chapterId}`,
        },
        (payload) => {
          const removed = payload.old as { id?: string }
          if (!removed.id) return
          setEvents((prev) => prev.filter((e) => e.id !== removed.id))
        },
      )
      .subscribe()
    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [chapterId, toast])

  // Watch the kid row so a redemption on either device (which changes
  // current_chapter_id) propagates here — the chapter-keyed effect then reloads
  // the now-fresh board.
  const kidId = kid.id
  useEffect(() => {
    const channel = supabase
      .channel(`kid-${kidId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'kid',
          filter: `id=eq.${kidId}`,
        },
        (payload) => {
          const next = payload.new as Kid
          setKid((prev) =>
            prev.current_chapter_id === next.current_chapter_id &&
            prev.current_balance === next.current_balance
              ? prev
              : next,
          )
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [kidId])

  const total = useMemo(
    () => events.reduce((sum, event) => sum + event.amount, 0),
    [events],
  )

  // Flag just-awarded ids so they drop in with extra flourish, then clear them
  // shortly after the animation has played.
  const markNew = useCallback((ids: string[]) => {
    setNewIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.add(id))
      return next
    })
    window.setTimeout(() => {
      setNewIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
    }, NEW_STICKER_MS)
  }, [])

  // Holds the latest award so the retry toast action can call it without the
  // callback referencing itself (which would break memoization).
  const awardRef = useRef<((params: AwardParams) => void) | null>(null)

  // Optimistically drops stickers, then persists. On failure: queue if offline
  // (keep the stickers), otherwise roll back and offer a retry.
  const award = useCallback(
    async (params: AwardParams) => {
      const currentKid = kidRef.current
      if (!parent || !currentKid.current_chapter_id) return
      const awardChapterId = currentKid.current_chapter_id
      const layout = getLayout()
      const baseIndex = eventsRef.current.length
      const now = new Date().toISOString()
      const newStickers: NewSticker[] = []
      for (let i = 0; i < params.count; i++) {
        const id = crypto.randomUUID()
        newStickers.push({
          id,
          kidId: currentKid.id,
          choreId: params.choreId,
          chapterId: awardChapterId,
          parentId: parent.id,
          stickerImageId: params.stickerImageId,
          label: params.label,
          createdAt: now,
          position: computeStickerPosition(id, baseIndex + i, layout),
        })
      }
      const optimistic = newStickers.map(newStickerToEvent)
      const awardedIds = new Set(newStickers.map((sticker) => sticker.id))
      setEvents((prev) => [...prev, ...optimistic])
      markNew([...awardedIds])
      vibrateAward()
      try {
        await awardStickers(newStickers)
      } catch (err) {
        if (!navigator.onLine) {
          enqueueAwards(newStickers)
          toast.info(
            `Offline — ${pluralStickers(params.count)} queued, will sync when you reconnect.`,
          )
        } else {
          setEvents((prev) => prev.filter((event) => !awardedIds.has(event.id)))
          toast.error(getErrorMessage(err), {
            action: {
              label: 'Retry',
              onClick: () => awardRef.current?.(params),
            },
          })
        }
      }
    },
    [parent, getLayout, markNew, toast],
  )

  useEffect(() => {
    awardRef.current = award
  }, [award])

  const undoLast = useCallback(async () => {
    const last = eventsRef.current[eventsRef.current.length - 1]
    if (!last) return
    vibrateUndo()
    setEvents((prev) => prev.filter((event) => event.id !== last.id))
    try {
      await removeStickerEvent(last.id)
    } catch (err) {
      setEvents((prev) => [...prev, last])
      toast.error(getErrorMessage(err))
    }
  }, [toast])

  const resetBoard = useCallback(async () => {
    const chapterToClear = kidRef.current.current_chapter_id
    if (!chapterToClear) return
    const confirmed = window.confirm(
      'Remove all stickers from the board? This cannot be undone.',
    )
    if (!confirmed) return
    const previous = eventsRef.current
    setEvents([])
    try {
      await clearChapterStickers(chapterToClear)
    } catch (err) {
      setEvents(previous)
      toast.error(getErrorMessage(err))
    }
  }, [toast])

  const redeem = useCallback(
    async (tier: RewardTier) => {
      const currentKid = kidRef.current
      if (!parent || !currentKid.current_chapter_id) return
      try {
        const newChapterId = await redeemChapter({
          kidId: currentKid.id,
          chapterId: currentKid.current_chapter_id,
          rewardTierId: tier.id,
          redeemedBy: parent.id,
        })
        // Stickers earned beyond the threshold carry onto the fresh chapter.
        // The server moves the most recent surplus events, so optimistically
        // keep that same tail (same ids) — the chapter-keyed effect then
        // refetches the new chapter and confirms.
        const currentEvents = eventsRef.current
        const currentTotal = currentEvents.reduce((sum, e) => sum + e.amount, 0)
        const surplus = Math.max(0, currentTotal - tier.threshold)
        const carried = surplus > 0 ? currentEvents.slice(-surplus) : []
        setEvents(carried)
        setKid((prev) => ({
          ...prev,
          current_chapter_id: newChapterId,
          current_balance: surplus,
        }))
        vibrateRedeem()
        void celebrateRedemption()
        toast.success(`"${tier.name}" claimed!`)
      } catch (err) {
        toast.error(getErrorMessage(err))
      }
    },
    [parent, toast],
  )

  return { kid, events, total, newIds, award, undoLast, resetBoard, redeem }
}
