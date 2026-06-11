import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import {
  awardStickers,
  fetchHousehold,
  fetchKids,
  fetchMyParent,
  fetchRewardTiers,
  type BoardDisplayMode,
} from '../lib/queries'
import { fetchActiveChores } from '../lib/chores'
import { fetchStickerImages } from '../lib/stickerImages'
import { useStickerImageUrls } from '../hooks/useStickerImageUrls'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import {
  getQueuedAwards,
  removeQueuedAwards,
} from '../lib/offlineQueue'
import { useToast } from '../components/toast/useToast'
import { registerScrubNames, reportError } from '../lib/monitoring'
import type {
  Chore,
  Household,
  Kid,
  Parent,
  RewardTier,
  StickerImage,
} from '../lib/types'
import { FullScreenSpinner } from '../components/FullScreenSpinner'
import { BoardLoadError } from '../components/BoardLoadError'
import { EmptyState } from '../components/EmptyState'
import { BoardMenu } from '../components/BoardMenu'
import { KidColumn, type KidColumnApi } from '../components/KidColumn'
import { KidAvatar } from '../components/KidAvatar'
import {
  CustomAwardModal,
  type CustomAwardInput,
} from '../components/CustomAwardModal'

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
  const [kids, setKids] = useState<Kid[]>([])
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null)
  const [mode, setMode] = useState<BoardDisplayMode>('focused')
  const [chores, setChores] = useState<Chore[]>([])
  const [rewardTiers, setRewardTiers] = useState<RewardTier[]>([])
  const [stickerImages, setStickerImages] = useState<StickerImage[]>([])
  const [awardingId, setAwardingId] = useState<string | null>(null)
  const [showCustom, setShowCustom] = useState(false)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)
  const [loadError, setLoadError] = useState(false)
  // Each mounted kid column publishes its award/undo/reset/total here so the
  // shared chrome (chore grid, board menu) can drive the selected kid.
  const [apiByKid, setApiByKid] = useState<Map<string, KidColumnApi>>(
    () => new Map(),
  )
  const flushingRef = useRef(false)
  // Monotonic run token: only the most recent load() applies its results. Covers
  // both StrictMode's double-invoke and a retry that supersedes an in-flight load.
  const loadRunRef = useRef(0)

  const load = useCallback(async () => {
    const runId = ++loadRunRef.current
    const isCurrent = () => loadRunRef.current === runId
    // No synchronous setState here: the first mount relies on the initial
    // loading=true, and retry resets loading/error in its click handler. This
    // keeps the effect that calls load() free of cascading-render setState.
    try {
      const myParent = await fetchMyParent()
      if (!isCurrent()) return
      if (!myParent) {
        setNeedsOnboarding(true)
        return
      }
      setParent(myParent)

      // Critical: household + kids. There is no board without them, so a failure
      // here is a real, retryable error state — not a blank screen.
      let hh: Household | null
      let theKids: Kid[]
      try {
        ;[hh, theKids] = await Promise.all([
          fetchHousehold(myParent.household_id),
          fetchKids(myParent.household_id),
        ])
      } catch (err) {
        if (!isCurrent()) return
        reportError(err, { where: 'Home: critical board load' })
        setLoadError(true)
        return
      }
      if (!isCurrent()) return
      setHousehold(hh)
      setKids(theKids)
      // Feed kid/household names to the error-reporting PII scrubber now that
      // they're known — they can surface in toast strings captured as Sentry
      // breadcrumbs, and init ran before any of this data was available.
      registerScrubNames([
        ...(hh ? [hh.name] : []),
        ...theKids.map((kid) => kid.name),
      ])
      setSelectedKidId((prev) => prev ?? theKids[0]?.id ?? null)
      if (hh?.board_layout === 'side_by_side' || hh?.board_layout === 'focused') {
        setMode(hh.board_layout)
      }

      // Secondary: chores / rewards / sticker images. A failure here degrades
      // gracefully — the slice keeps its last value and the board still renders,
      // rather than one stale-migration 400 blanking the whole screen.
      const [choresR, tiersR, imagesR] = await Promise.allSettled([
        fetchActiveChores(myParent.household_id),
        fetchRewardTiers(myParent.household_id),
        fetchStickerImages(myParent.household_id),
      ])
      if (!isCurrent()) return
      if (choresR.status === 'fulfilled') setChores(choresR.value)
      if (tiersR.status === 'fulfilled') setRewardTiers(tiersR.value)
      if (imagesR.status === 'fulfilled') setStickerImages(imagesR.value)

      const failures = [choresR, tiersR, imagesR].filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      )
      if (failures.length > 0) {
        for (const failure of failures) {
          reportError(failure.reason, {
            where: 'Home: secondary board load',
          })
        }
        toast.error('Some of the board didn’t load. Reload to try again.')
      }
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
    // Invalidate any in-flight load when this effect tears down (StrictMode /
    // unmount) so a late resolve can't write into an unmounted tree. Bumping the
    // run token (a ref, intentionally) is the whole point of the cleanup.
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      loadRunRef.current++
    }
  }, [load])

  const handleRetry = useCallback(() => {
    setLoadError(false)
    setLoading(true)
    void load()
  }, [load])

  // Flush queued offline awards when connectivity returns (and on mount). Owned
  // once here — not per kid board — so multiple mounted boards don't race on the
  // shared queue. Inserted stickers arrive at each board via realtime.
  const flushQueue = useCallback(async () => {
    if (flushingRef.current) return
    const queued = getQueuedAwards()
    if (queued.length === 0) return
    flushingRef.current = true
    try {
      await awardStickers(queued)
      removeQueuedAwards(new Set(queued.map((sticker) => sticker.id)))
      toast.success(`Synced ${pluralStickers(queued.length)}.`)
    } catch (err) {
      // Stays silent in the UI (the awards remain queued for the next
      // reconnect), but report so we learn about persistent sync failures.
      reportError(err, { where: 'Home: offline flushQueue' })
    } finally {
      flushingRef.current = false
    }
  }, [toast])

  useEffect(() => {
    if (online) void flushQueue()
  }, [online, flushQueue])

  const imageUrls = useStickerImageUrls(stickerImages)

  const choreNames = useMemo(() => {
    const map: Record<string, string> = {}
    // Skip blank names so name-less chores fall back to the sticker label
    // (e.g. in the Today log) instead of showing an empty string.
    for (const chore of chores) {
      if (chore.name) map[chore.id] = chore.name
    }
    return map
  }, [chores])

  const registerApi = useCallback((kidId: string, api: KidColumnApi) => {
    setApiByKid((prev) => {
      const next = new Map(prev)
      next.set(kidId, api)
      return next
    })
  }, [])

  const selectedApi = selectedKidId ? apiByKid.get(selectedKidId) : undefined

  const handleAward = useCallback(
    async (chore: Chore) => {
      const api = selectedKidId ? apiByKid.get(selectedKidId) : undefined
      if (!api) return
      setAwardingId(chore.id)
      try {
        await api.award({
          choreId: chore.id,
          stickerImageId: chore.sticker_image_id,
          label: null,
          count: chore.sticker_value,
        })
      } finally {
        setAwardingId(null)
      }
    },
    [apiByKid, selectedKidId],
  )

  const handleCustomAward = useCallback(
    async (input: CustomAwardInput) => {
      const api = selectedKidId ? apiByKid.get(selectedKidId) : undefined
      if (!api) return
      await api.award({
        choreId: null,
        stickerImageId: input.stickerImageId,
        label: input.label,
        count: input.value,
      })
      setShowCustom(false)
    },
    [apiByKid, selectedKidId],
  )

  if (loading) {
    return <FullScreenSpinner />
  }
  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />
  }
  if (loadError) {
    return <BoardLoadError onRetry={handleRetry} />
  }

  const selectedKid = kids.find((k) => k.id === selectedKidId) ?? null
  const multipleKids = kids.length > 1
  const sideBySide = mode === 'side_by_side' && multipleKids
  const visibleKids = sideBySide ? kids : selectedKid ? [selectedKid] : []

  return (
    <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 pb-8 sm:px-8 lg:px-12">
      <header className="flex items-center justify-between py-4">
        <button
          type="button"
          onClick={() => navigate('/setup/household')}
          className="rounded-lg text-left text-sm font-medium text-ink-muted transition-colors hover:text-ink"
        >
          {household?.name}
        </button>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate('/board')}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-black/5 hover:text-ink"
          >
            Kid view
          </button>
          <BoardMenu
            undoDisabled={(selectedApi?.total ?? 0) === 0}
            onSetup={() => navigate('/setup')}
            onHistory={() => navigate('/history')}
            onUndoLast={() => void selectedApi?.undoLast()}
            onResetBoard={() => void selectedApi?.resetBoard()}
            onSignOut={() => void signOut()}
          />
        </div>
      </header>

      {!online && (
        <p className="rounded-lg bg-amber-100 px-3 py-2 text-center text-sm text-amber-800">
          Offline — stickers are saved and will sync when you reconnect.
        </p>
      )}

      {multipleKids && (
        <div className="mb-1 flex items-center gap-3">
          <div
            className="flex gap-1.5 overflow-x-auto rounded-lg bg-black/5 p-1"
            role="tablist"
            aria-label="Choose kid"
          >
            {kids.map((k) => {
              const isSelected = k.id === selectedKidId
              return (
                <button
                  key={k.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSelectedKidId(k.id)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isSelected
                      ? 'bg-surface-raised text-ink shadow-sm'
                      : 'text-ink-muted'
                  }`}
                >
                  <KidAvatar kid={k} size="sm" />
                  {k.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {sideBySide && (
        <p className="mb-1 text-center text-xs text-ink-muted">
          Awarding to <span className="font-medium text-ink">{selectedKid?.name}</span> — tap a kid above to switch
        </p>
      )}

      <div
        className={
          sideBySide
            ? 'mt-1 flex gap-4 overflow-x-auto sm:gap-6'
            : 'mt-1'
        }
      >
        {visibleKids.map((k) => (
          <KidColumn
            key={k.id}
            kid={k}
            parent={parent}
            rewardTiers={rewardTiers}
            imageUrls={imageUrls}
            choreNames={choreNames}
            onApi={registerApi}
          />
        ))}
      </div>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {chores.map((chore) => {
          const choreImage = chore.sticker_image_id
            ? imageUrls[chore.sticker_image_id]
            : undefined
          // Name-less chores render as a pure sticker button; fall back to the
          // sticker label so the button keeps an accessible name.
          const stickerLabel = chore.sticker_image_id
            ? stickerImages.find((s) => s.id === chore.sticker_image_id)?.label
            : undefined
          return (
            <button
              key={chore.id}
              type="button"
              disabled={awardingId !== null}
              onClick={() => void handleAward(chore)}
              aria-label={chore.name ? undefined : (stickerLabel ?? 'Award sticker')}
              className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] bg-accent px-4 py-5 font-medium text-white shadow-sm transition-[transform,filter] duration-100 ease-out active:scale-[0.94] active:brightness-90 disabled:opacity-60"
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
              {chore.name && <span className="text-base">{chore.name}</span>}
              <span className="text-sm text-white/80">+{chore.sticker_value}</span>
            </button>
          )
        })}

        <button
          type="button"
          disabled={awardingId !== null}
          onClick={() => setShowCustom(true)}
          className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-2 border-dashed border-accent/40 px-4 py-5 font-medium text-accent transition-[transform,filter,colors] duration-100 ease-out hover:border-accent hover:bg-accent/5 active:scale-[0.94] active:brightness-90 disabled:opacity-60"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 text-2xl leading-none">
            +
          </span>
          <span className="text-base">Custom</span>
        </button>
      </section>

      {chores.length === 0 && (
        <EmptyState
          className="mt-3"
          title="No chores yet"
          body="Add your first chore to start awarding stickers."
          action={{ label: 'Add a chore', href: '/setup/chores' }}
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
