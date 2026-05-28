import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import {
  awardSticker,
  clearChapterStickers,
  fetchActiveChores,
  fetchChapterEvents,
  fetchHousehold,
  fetchKid,
  fetchMyParent,
  fetchRewardTiers,
  redeemChapter,
  removeStickerEvent,
} from '../lib/queries'
import { computeStickerPosition } from '../lib/stickerPlacement'
import { useBoardLayout } from '../hooks/useBoardLayout'
import { getErrorMessage } from '../lib/errors'
import type { Chore, Household, Kid, Parent, RewardTier, StickerEvent } from '../lib/types'
import { FullScreenSpinner } from '../components/FullScreenSpinner'
import { StickerBoard } from '../components/StickerBoard'
import { ProgressBar } from '../components/ProgressBar'
import { BoardMenu } from '../components/BoardMenu'
import { RedemptionSheet } from '../components/RedemptionSheet'

export function Home() {
  const { signOut } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [parent, setParent] = useState<Parent | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  const [kid, setKid] = useState<Kid | null>(null)
  const [chores, setChores] = useState<Chore[]>([])
  const [events, setEvents] = useState<StickerEvent[]>([])
  const [rewardTiers, setRewardTiers] = useState<RewardTier[]>([])
  const [awardingId, setAwardingId] = useState<string | null>(null)
  const [showRedemption, setShowRedemption] = useState(false)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const { ref: boardRef, layout } = useBoardLayout()

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
        const [hh, theKid, activeChores, tiers] = await Promise.all([
          fetchHousehold(myParent.household_id),
          fetchKid(myParent.household_id),
          fetchActiveChores(myParent.household_id),
          fetchRewardTiers(myParent.household_id),
        ])
        if (!active) return
        setHousehold(hh)
        setKid(theKid)
        setChores(activeChores)
        setRewardTiers(tiers)
        if (theKid?.current_chapter_id) {
          const chapterEvents = await fetchChapterEvents(theKid.current_chapter_id)
          if (!active) return
          setEvents(chapterEvents)
        }
      } catch (err) {
        if (active) setError(getErrorMessage(err))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  // Realtime: append new stickers from the partner's phone as they land.
  const chapterId = kid?.current_chapter_id ?? null
  useEffect(() => {
    if (!chapterId) return
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
      supabase.removeChannel(channel)
    }
  }, [chapterId])

  const total = useMemo(
    () => events.reduce((sum, event) => sum + event.amount, 0),
    [events],
  )

  const handleAward = useCallback(
    async (chore: Chore) => {
      if (!parent || !kid || !kid.current_chapter_id) return
      const id = crypto.randomUUID()
      const position = computeStickerPosition(id, events.length, layout)
      const optimistic: StickerEvent = {
        id,
        kid_id: kid.id,
        chore_id: chore.id,
        chapter_id: kid.current_chapter_id,
        sticker_image_id: null,
        awarded_by: parent.id,
        amount: 1,
        position_x: position.x,
        position_y: position.y,
        rotation: position.rotation,
        created_at: new Date().toISOString(),
      }
      setEvents((prev) => [...prev, optimistic])
      setAwardingId(chore.id)
      setError(null)
      try {
        await awardSticker({
          id,
          kidId: kid.id,
          choreId: chore.id,
          chapterId: kid.current_chapter_id,
          parentId: parent.id,
          position,
        })
      } catch (err) {
        setEvents((prev) => prev.filter((event) => event.id !== id))
        setError(getErrorMessage(err))
      } finally {
        setAwardingId(null)
      }
    },
    [parent, kid, events.length, layout],
  )

  const handleUndoLast = useCallback(async () => {
    const last = events[events.length - 1]
    if (!last) return
    setEvents((prev) => prev.filter((event) => event.id !== last.id))
    setError(null)
    try {
      await removeStickerEvent(last.id)
    } catch (err) {
      setEvents((prev) => [...prev, last])
      setError(getErrorMessage(err))
    }
  }, [events])

  const handleResetBoard = useCallback(async () => {
    if (!kid?.current_chapter_id) return
    const confirmed = window.confirm(
      'Remove all stickers from the board? This cannot be undone.',
    )
    if (!confirmed) return
    const chapterToClear = kid.current_chapter_id
    const previous = events
    setEvents([])
    setError(null)
    try {
      await clearChapterStickers(chapterToClear)
    } catch (err) {
      setEvents(previous)
      setError(getErrorMessage(err))
    }
  }, [kid, events])

  const handleRedeem = useCallback(
    async (tier: RewardTier) => {
      if (!parent || !kid || !kid.current_chapter_id) return
      setError(null)
      try {
        const newChapterId = await redeemChapter({
          kidId: kid.id,
          chapterId: kid.current_chapter_id,
          rewardTierId: tier.id,
          redeemedBy: parent.id,
        })
        // Fresh chapter: clear the board and update the kid's chapter pointer.
        setEvents([])
        setKid((prev) => prev ? { ...prev, current_chapter_id: newChapterId, current_balance: 0 } : prev)
        setShowRedemption(false)
      } catch (err) {
        setError(getErrorMessage(err))
      }
    },
    [parent, kid],
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
          onUndoLast={() => void handleUndoLast()}
          onResetBoard={() => void handleResetBoard()}
          onSignOut={() => void signOut()}
        />
      </header>

      <section className="mt-1">
        <p className="text-center text-sm uppercase tracking-[0.2em] text-ink-muted">
          {kid?.name}'s board
        </p>
        <div ref={boardRef} className="mt-3 w-full">
          <StickerBoard events={events} layout={layout} />
        </div>
        <ProgressBar
          total={total}
          tiers={rewardTiers}
          onClaimClick={() => setShowRedemption(true)}
        />
      </section>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">
          {error}
        </p>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3">
        {chores.map((chore) => (
          <button
            key={chore.id}
            type="button"
            disabled={awardingId !== null}
            onClick={() => void handleAward(chore)}
            className="flex flex-col items-center gap-1 rounded-[var(--radius-card)] bg-accent px-4 py-5 font-medium text-white shadow-sm transition-transform active:scale-95 disabled:opacity-60"
          >
            <span className="text-base">{chore.name}</span>
            <span className="text-sm text-white/80">+{chore.sticker_value}</span>
          </button>
        ))}
        {chores.length === 0 && (
          <p className="col-span-2 text-center text-sm text-ink-muted">
            No chores yet. You'll add these in setup.
          </p>
        )}
      </section>

      {showRedemption && (
        <RedemptionSheet
          tiers={rewardTiers}
          total={total}
          onRedeem={handleRedeem}
          onClose={() => setShowRedemption(false)}
        />
      )}
    </div>
  )
}
