import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../lib/supabase'
import {
  awardStickers,
  clearChapterStickers,
  fetchChapterEvents,
  fetchHousehold,
  fetchKid,
  fetchMyParent,
  fetchRewardTiers,
  newStickerToEvent,
  redeemChapter,
  removeStickerEvent,
  type NewSticker,
} from '../lib/queries'
import { fetchActiveChores } from '../lib/chores'
import { fetchStickerImages, stickerImageUrl } from '../lib/stickerImages'
import { computeStickerPosition } from '../lib/stickerPlacement'
import { useBoardLayout } from '../hooks/useBoardLayout'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import {
  enqueueAwards,
  getQueuedAwards,
  removeQueuedAwards,
} from '../lib/offlineQueue'
import { getErrorMessage } from '../lib/errors'
import { vibrateAward, vibrateRedeem, vibrateUndo } from '../lib/haptics'
import { celebrateRedemption } from '../lib/celebrate'
import { useToast } from '../components/toast/useToast'
import type {
  Chore,
  Household,
  Kid,
  Parent,
  RewardTier,
  StickerEvent,
  StickerImage,
} from '../lib/types'
import { FullScreenSpinner } from '../components/FullScreenSpinner'
import { StickerBoard } from '../components/StickerBoard'
import { ProgressBar } from '../components/ProgressBar'
import { BoardMenu } from '../components/BoardMenu'
import { RedemptionSheet } from '../components/RedemptionSheet'
import {
  CustomAwardModal,
  type CustomAwardInput,
} from '../components/CustomAwardModal'
import { TodayLog } from '../components/TodayLog'

interface AwardParams {
  choreId: string | null
  stickerImageId: string | null
  label: string | null
  count: number
}

// How long a freshly awarded sticker keeps its drop-in flag, after which it is
// cleared from state. Comfortably past the 460ms drop animation.
const NEW_STICKER_MS = 600

function pluralStickers(count: number): string {
  return `${count} ${count === 1 ? 'sticker' : 'stickers'}`
}

export function Home() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const online = useOnlineStatus()
  const [loading, setLoading] = useState(true)
  const [parent, setParent] = useState<Parent | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  const [kid, setKid] = useState<Kid | null>(null)
  const [chores, setChores] = useState<Chore[]>([])
  const [events, setEvents] = useState<StickerEvent[]>([])
  const [rewardTiers, setRewardTiers] = useState<RewardTier[]>([])
  const [stickerImages, setStickerImages] = useState<StickerImage[]>([])
  const [awardingId, setAwardingId] = useState<string | null>(null)
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(() => new Set())
  const [showRedemption, setShowRedemption] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const { ref: boardRef, layout } = useBoardLayout()
  const flushingRef = useRef(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const myParent = await fetchMyParent()
        if (!active) return
        if (!myParent) {
          setNeedsOnboarding(true)
          return
        }
        setParent(myParent)
        const [hh, theKid, activeChores, tiers, images] = await Promise.all([
          fetchHousehold(myParent.household_id),
          fetchKid(myParent.household_id),
          fetchActiveChores(myParent.household_id),
          fetchRewardTiers(myParent.household_id),
          fetchStickerImages(myParent.household_id),
        ])
        if (!active) return
        setHousehold(hh)
        setKid(theKid)
        setChores(activeChores)
        setRewardTiers(tiers)
        setStickerImages(images)
        // Events load in the chapter-keyed effect below, so they reload
        // automatically when a redemption switches to a fresh chapter.
      } catch (err) {
        if (active) toast.error(getErrorMessage(err))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [toast])

  // Load + live-sync the current chapter's stickers. Keyed on chapterId so a
  // redemption (which moves the kid to a fresh chapter) reloads the board.
  const chapterId = kid?.current_chapter_id ?? null
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

  // Realtime: watch the kid row so a redemption on either device (which changes
  // current_chapter_id) propagates here — the chapter-keyed effect then reloads
  // the now-empty board.
  const kidId = kid?.id ?? null
  useEffect(() => {
    if (!kidId) return
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
            prev &&
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

  // sticker_image_id -> public URL, for chore buttons and board rendering.
  const imageUrls = useMemo(() => {
    const map: Record<string, string> = {}
    for (const image of stickerImages) {
      map[image.id] = stickerImageUrl(image.storage_path)
    }
    return map
  }, [stickerImages])

  // chore_id -> name, for the Today strip.
  const choreNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const chore of chores) map[chore.id] = chore.name
    return map
  }, [chores])

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

  // Holds the latest submitAward so the retry action can call it without the
  // callback referencing itself (which breaks memoization).
  const submitAwardRef = useRef<((params: AwardParams) => void) | null>(null)

  // Shared award path for both chore taps and custom awards. Optimistically
  // drops stickers, then persists. On failure: queue if offline (keep the
  // stickers), otherwise roll back and offer a retry.
  const submitAward = useCallback(
    async (params: AwardParams) => {
      if (!parent || !kid?.current_chapter_id) return
      const awardChapterId = kid.current_chapter_id
      const baseIndex = events.length
      const now = new Date().toISOString()
      const newStickers: NewSticker[] = []
      for (let i = 0; i < params.count; i++) {
        const id = crypto.randomUUID()
        newStickers.push({
          id,
          kidId: kid.id,
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
              onClick: () => submitAwardRef.current?.(params),
            },
          })
        }
      }
    },
    [parent, kid, events.length, layout, markNew, toast],
  )

  useEffect(() => {
    submitAwardRef.current = submitAward
  }, [submitAward])

  const handleAward = useCallback(
    async (chore: Chore) => {
      setAwardingId(chore.id)
      try {
        await submitAward({
          choreId: chore.id,
          stickerImageId: chore.sticker_image_id,
          label: null,
          count: chore.sticker_value,
        })
      } finally {
        setAwardingId(null)
      }
    },
    [submitAward],
  )

  const handleCustomAward = useCallback(
    async (input: CustomAwardInput) => {
      await submitAward({
        choreId: null,
        stickerImageId: input.stickerImageId,
        label: input.label,
        count: input.value,
      })
      setShowCustom(false)
    },
    [submitAward],
  )

  // Flush queued offline awards when connectivity returns (and on mount).
  const flushQueue = useCallback(async () => {
    if (flushingRef.current) return
    const queued = getQueuedAwards()
    if (queued.length === 0) return
    flushingRef.current = true
    try {
      await awardStickers(queued)
      removeQueuedAwards(new Set(queued.map((sticker) => sticker.id)))
      toast.success(`Synced ${pluralStickers(queued.length)}.`)
    } catch {
      // Still unreachable; leave queued for the next reconnect.
    } finally {
      flushingRef.current = false
    }
  }, [toast])

  useEffect(() => {
    if (online) void flushQueue()
  }, [online, flushQueue])

  const handleUndoLast = useCallback(async () => {
    const last = events[events.length - 1]
    if (!last) return
    vibrateUndo()
    setEvents((prev) => prev.filter((event) => event.id !== last.id))
    try {
      await removeStickerEvent(last.id)
    } catch (err) {
      setEvents((prev) => [...prev, last])
      toast.error(getErrorMessage(err))
    }
  }, [events, toast])

  const handleResetBoard = useCallback(async () => {
    if (!kid?.current_chapter_id) return
    const confirmed = window.confirm(
      'Remove all stickers from the board? This cannot be undone.',
    )
    if (!confirmed) return
    const chapterToClear = kid.current_chapter_id
    const previous = events
    setEvents([])
    try {
      await clearChapterStickers(chapterToClear)
    } catch (err) {
      setEvents(previous)
      toast.error(getErrorMessage(err))
    }
  }, [kid, events, toast])

  const handleRedeem = useCallback(
    async (tier: RewardTier) => {
      if (!parent || !kid || !kid.current_chapter_id) return
      try {
        const newChapterId = await redeemChapter({
          kidId: kid.id,
          chapterId: kid.current_chapter_id,
          rewardTierId: tier.id,
          redeemedBy: parent.id,
        })
        // Stickers earned beyond the threshold carry onto the fresh chapter.
        // The server moves the most recent surplus events, so optimistically
        // keep that same tail (same ids) — the chapter-keyed effect then
        // refetches the new chapter and confirms.
        const surplus = Math.max(0, total - tier.threshold)
        const carried = surplus > 0 ? events.slice(-surplus) : []
        setEvents(carried)
        setKid((prev) =>
          prev
            ? { ...prev, current_chapter_id: newChapterId, current_balance: surplus }
            : prev,
        )
        setShowRedemption(false)
        vibrateRedeem()
        void celebrateRedemption()
        toast.success(`"${tier.name}" claimed!`)
      } catch (err) {
        toast.error(getErrorMessage(err))
      }
    },
    [parent, kid, total, events, toast],
  )

  if (loading) {
    return <FullScreenSpinner />
  }
  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 pb-8 sm:px-8 lg:px-12">
      <header className="flex items-center justify-between py-4">
        <div>
          <p className="text-sm font-medium text-ink-muted">{household?.name}</p>
          {household && (
            <p className="text-xs text-ink-muted">
              Invite code:{' '}
              <span className="font-mono tracking-widest text-ink">
                {household.join_code}
              </span>
            </p>
          )}
        </div>
        <BoardMenu
          undoDisabled={events.length === 0}
          onSetup={() => navigate('/setup')}
          onHistory={() => navigate('/history')}
          onUndoLast={() => void handleUndoLast()}
          onResetBoard={() => void handleResetBoard()}
          onSignOut={() => void signOut()}
        />
      </header>

      {!online && (
        <p className="rounded-lg bg-amber-100 px-3 py-2 text-center text-sm text-amber-800">
          Offline — stickers are saved and will sync when you reconnect.
        </p>
      )}

      <section className="mt-1">
        <p className="text-center text-sm uppercase tracking-[0.2em] text-ink-muted">
          {kid?.name}'s board
        </p>
        <div ref={boardRef} className="mt-3 w-full">
          <StickerBoard
            events={events}
            layout={layout}
            imageUrls={imageUrls}
            newIds={newIds}
          />
        </div>
        <ProgressBar
          total={total}
          tiers={rewardTiers}
          onClaimClick={() => setShowRedemption(true)}
        />
      </section>

      <TodayLog events={events} choreNames={choreNames} imageUrls={imageUrls} />

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {chores.map((chore) => {
          const choreImage = chore.sticker_image_id
            ? imageUrls[chore.sticker_image_id]
            : undefined
          return (
            <button
              key={chore.id}
              type="button"
              disabled={awardingId !== null}
              onClick={() => void handleAward(chore)}
              className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] bg-accent px-4 py-5 font-medium text-white shadow-sm transition-transform active:scale-95 disabled:opacity-60"
            >
              {choreImage && (
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/15">
                  <img
                    src={choreImage}
                    alt=""
                    className="h-11 w-11 object-contain"
                    draggable={false}
                  />
                </span>
              )}
              <span className="text-base">{chore.name}</span>
              <span className="text-sm text-white/80">+{chore.sticker_value}</span>
            </button>
          )
        })}

        <button
          type="button"
          disabled={awardingId !== null}
          onClick={() => setShowCustom(true)}
          className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-accent/40 px-4 py-5 font-medium text-accent transition-[transform,colors] hover:border-accent hover:bg-accent/5 active:scale-95 disabled:opacity-60"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 text-2xl leading-none">
            +
          </span>
          <span className="text-base">Custom</span>
        </button>
      </section>

      {chores.length === 0 && (
        <button
          type="button"
          onClick={() => navigate('/setup/chores')}
          className="mt-3 rounded-[var(--radius-card)] border-2 border-dashed border-black/15 px-4 py-4 text-sm text-ink-muted transition-colors hover:border-accent/50 hover:text-ink"
        >
          No chores yet — tap to add one
        </button>
      )}

      {showRedemption && (
        <RedemptionSheet
          tiers={rewardTiers}
          total={total}
          onRedeem={handleRedeem}
          onClose={() => setShowRedemption(false)}
        />
      )}

      {showCustom && (
        <CustomAwardModal
          stickerImages={stickerImages}
          imageUrls={imageUrls}
          onAward={handleCustomAward}
          onClose={() => setShowCustom(false)}
        />
      )}
    </div>
  )
}
