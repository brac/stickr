import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { fetchKids, fetchMyParent, fetchRewardTiers } from '../lib/queries'
import { fetchStickerImages } from '../lib/stickerImages'
import { useStickerImageUrls } from '../hooks/useStickerImageUrls'
import { getErrorMessage } from '../lib/errors'
import { useToast } from '../components/toast/useToast'
import { FullScreenSpinner } from '../components/FullScreenSpinner'
import { KidViewColumn } from '../components/KidViewColumn'
import type { Kid, Parent, RewardTier, StickerImage } from '../lib/types'

const fullscreenSupported =
  typeof document !== 'undefined' &&
  typeof document.documentElement.requestFullscreen === 'function'

// A fullscreen, read-only board for the kid — hand them the phone or cast it to
// the TV to count stickers and watch the progress bar fill. No awarding, no
// settings; the only control is a discreet exit, and a fullscreen toggle where
// supported. Updates live as a parent awards stickers on another device.
export function KidBoard() {
  const navigate = useNavigate()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [parent, setParent] = useState<Parent | null>(null)
  const [missingParent, setMissingParent] = useState(false)
  const [kids, setKids] = useState<Kid[]>([])
  const [rewardTiers, setRewardTiers] = useState<RewardTier[]>([])
  const [stickerImages, setStickerImages] = useState<StickerImage[]>([])
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const myParent = await fetchMyParent()
        if (!active) return
        if (!myParent) {
          setMissingParent(true)
          return
        }
        setParent(myParent)
        const [theKids, tiers, images] = await Promise.all([
          fetchKids(myParent.household_id),
          fetchRewardTiers(myParent.household_id),
          fetchStickerImages(myParent.household_id),
        ])
        if (!active) return
        setKids(theKids)
        setRewardTiers(tiers)
        setStickerImages(images)
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

  useEffect(() => {
    function onChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const imageUrls = useStickerImageUrls(stickerImages)

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // Some browsers (e.g. iPhone Safari) reject fullscreen — harmless to ignore.
    }
  }

  if (loading) {
    return <FullScreenSpinner />
  }
  if (missingParent) {
    return <Navigate to="/onboarding" replace />
  }

  const multipleKids = kids.length > 1

  return (
    <main className="relative min-h-full px-4 py-6 sm:px-8">
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
        {fullscreenSupported && (
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Go fullscreen'}
            className="rounded-lg p-2 text-ink-muted/70 transition-colors hover:bg-black/5 hover:text-ink"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              {isFullscreen ? (
                <path
                  d="M8 3v3a2 2 0 0 1-2 2H3m14 0h-3a2 2 0 0 1-2-2V3M3 12h3a2 2 0 0 1 2 2v3m4 0v-3a2 2 0 0 1 2-2h3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M3 7V4a1 1 0 0 1 1-1h3m6 0h3a1 1 0 0 1 1 1v3m0 6v3a1 1 0 0 1-1 1h-3m-6 0H4a1 1 0 0 1-1-1v-3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Exit kid view"
          className="rounded-lg p-2 text-ink-muted/70 transition-colors hover:bg-black/5 hover:text-ink"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M5 5l10 10M15 5L5 15"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {kids.length === 0 ? (
        <p className="mt-24 text-center text-ink-muted">
          No kids yet. Add one in setup to see their board here.
        </p>
      ) : (
        <div
          className={
            multipleKids
              ? 'mx-auto flex max-w-7xl gap-8 overflow-x-auto pt-8'
              : 'mx-auto max-w-3xl pt-8'
          }
        >
          {kids.map((kid) => (
            <KidViewColumn
              key={kid.id}
              kid={kid}
              parent={parent}
              rewardTiers={rewardTiers}
              imageUrls={imageUrls}
            />
          ))}
        </div>
      )}
    </main>
  )
}
