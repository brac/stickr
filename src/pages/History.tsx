import { useEffect, useState } from 'react'
import {
  fetchChapterEvents,
  fetchKids,
  fetchMyParent,
  fetchPastChapters,
  type PastChapter,
} from '../lib/queries'
import { fetchStickerImages, stickerImageUrl } from '../lib/stickerImages'
import { getErrorMessage } from '../lib/errors'
import { useToast } from '../components/toast/useToast'
import type { Kid, StickerEvent } from '../lib/types'
import { FullScreenSpinner } from '../components/FullScreenSpinner'
import { ChapterSnapshot } from '../components/ChapterSnapshot'
import { SetupShell } from '../components/SetupShell'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  if (s.getFullYear() !== e.getFullYear()) {
    return `${formatDate(start)}, ${s.getFullYear()} – ${formatDate(end)}, ${e.getFullYear()}`
  }
  return `${formatDate(start)} – ${formatDate(end)}`
}

interface ChapterCardProps {
  chapter: PastChapter
  imageUrls: Record<string, string>
}

function ChapterCard({ chapter, imageUrls }: ChapterCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [events, setEvents] = useState<StickerEvent[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExpand() {
    if (expanded) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (events !== null) return
    setLoading(true)
    try {
      const data = await fetchChapterEvents(chapter.id)
      setEvents(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <li className="overflow-hidden rounded-2xl border border-black/10 bg-surface-raised shadow-sm">
      <button
        type="button"
        onClick={() => void handleExpand()}
        className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-black/5"
        aria-expanded={expanded}
      >
        <div>
          <p className="font-semibold text-ink">{chapter.reward_name ?? 'Redeemed'}</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {formatDateRange(chapter.started_at, chapter.ended_at)}
          </p>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 text-ink-muted transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        >
          <path
            d="M3 6l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-black/10 px-3 pb-3 pt-3">
          {loading && (
            <div className="flex h-24 items-center justify-center">
              <span className="text-sm text-ink-muted">Loading…</span>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {events !== null && !loading && (
            <>
              <p className="mb-2 text-xs text-ink-muted">
                {events.length} {events.length === 1 ? 'sticker' : 'stickers'}
              </p>
              <ChapterSnapshot events={events} imageUrls={imageUrls} />
            </>
          )}
        </div>
      )}
    </li>
  )
}

export function History() {
  const toast = useToast()
  const [kids, setKids] = useState<Kid[]>([])
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null)
  const [chapters, setChapters] = useState<PastChapter[]>([])
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [chaptersLoading, setChaptersLoading] = useState(false)

  // Load household kids + sticker art once.
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const myParent = await fetchMyParent()
        if (!active || !myParent) return
        const [theKids, images] = await Promise.all([
          fetchKids(myParent.household_id),
          fetchStickerImages(myParent.household_id),
        ])
        if (!active) return
        const map: Record<string, string> = {}
        for (const image of images) {
          map[image.id] = stickerImageUrl(image.storage_path)
        }
        setImageUrls(map)
        setKids(theKids)
        setSelectedKidId(theKids[0]?.id ?? null)
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

  // (Re)load past chapters when the selected kid changes.
  useEffect(() => {
    if (!selectedKidId) return
    let active = true
    ;(async () => {
      setChaptersLoading(true)
      try {
        const past = await fetchPastChapters(selectedKidId)
        if (active) setChapters(past)
      } catch (err) {
        if (active) toast.error(getErrorMessage(err))
      } finally {
        if (active) setChaptersLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [selectedKidId, toast])

  if (loading) {
    return <FullScreenSpinner />
  }

  return (
    <SetupShell title="History" backTo="/">
      {kids.length > 1 && (
        <div
          className="mb-4 flex gap-1.5 overflow-x-auto rounded-lg bg-black/5 p-1"
          role="tablist"
          aria-label="Choose kid"
        >
          {kids.map((kid) => {
            const isSelected = kid.id === selectedKidId
            return (
              <button
                key={kid.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setSelectedKidId(kid.id)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isSelected
                    ? 'bg-surface-raised text-ink shadow-sm'
                    : 'text-ink-muted'
                }`}
              >
                {kid.name}
              </button>
            )
          })}
        </div>
      )}

      {chaptersLoading ? (
        <div className="flex h-32 items-center justify-center">
          <span className="text-sm text-ink-muted">Loading…</span>
        </div>
      ) : chapters.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="font-medium text-ink">No completed chapters yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Completed chapters appear here after the first reward is redeemed.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {chapters.map((chapter) => (
            <ChapterCard key={chapter.id} chapter={chapter} imageUrls={imageUrls} />
          ))}
        </ul>
      )}
    </SetupShell>
  )
}
