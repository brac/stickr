import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchChapterEvents, fetchKid, fetchMyParent, fetchPastChapters, type PastChapter } from '../lib/queries'
import { getErrorMessage } from '../lib/errors'
import type { StickerEvent } from '../lib/types'
import { FullScreenSpinner } from '../components/FullScreenSpinner'
import { ChapterSnapshot } from '../components/ChapterSnapshot'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
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
}

function ChapterCard({ chapter }: ChapterCardProps) {
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
          <p className="font-semibold text-ink">
            {chapter.reward_name ?? 'Redeemed'}
          </p>
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
          <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-black/10 px-3 pb-3 pt-3">
          {loading && (
            <div className="flex h-24 items-center justify-center">
              <span className="text-sm text-ink-muted">Loading…</span>
            </div>
          )}
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          {events !== null && !loading && (
            <>
              <p className="mb-2 text-xs text-ink-muted">
                {events.length} {events.length === 1 ? 'sticker' : 'stickers'}
              </p>
              <ChapterSnapshot events={events} />
            </>
          )}
        </div>
      )}
    </li>
  )
}

export function History() {
  const navigate = useNavigate()
  const [chapters, setChapters] = useState<PastChapter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const myParent = await fetchMyParent()
        if (!active || !myParent) return
        const kid = await fetchKid(myParent.household_id)
        if (!active || !kid) return
        const past = await fetchPastChapters(kid.id)
        if (active) setChapters(past)
      } catch (err) {
        if (active) setError(getErrorMessage(err))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [])

  if (loading) return <FullScreenSpinner />

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-10 pt-2">
      <header className="flex items-center gap-3 py-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-black/5"
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M13 16l-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-ink">History</h1>
      </header>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      {chapters.length === 0 && !error && (
        <div className="mt-12 text-center">
          <p className="font-medium text-ink">No completed chapters yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Completed chapters appear here after the first reward is redeemed.
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {chapters.map((chapter) => (
          <ChapterCard key={chapter.id} chapter={chapter} />
        ))}
      </ul>
    </div>
  )
}
