import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBoardLayout } from '../hooks/useBoardLayout'
import { StickerBoard } from '../components/StickerBoard'
import { ProgressBar } from '../components/ProgressBar'
import {
  DEMO_CHORES,
  DEMO_EVENTS,
  DEMO_KID,
  DEMO_TIERS,
  awardDemoSticker,
  type DemoChore,
} from '../lib/demoData'
import type { StickerEvent } from '../lib/types'

// How long the just-awarded ids linger before being cleared — comfortably past
// the sticker entrance animation (~280ms), matching the real board.
const ENTRANCE_CLEAR_MS = 600

// A logged-out, pre-seeded board anyone can play with (Feature 28). It mirrors
// the real kid board but runs entirely on a client-side fixture: tapping a
// chore springs a new sticker onto the board and nudges the progress bar, yet
// writes nothing — a reload resets everything. Lives outside RequireAuth so a
// curious visitor can reach it before signing up.
export function Demo() {
  const { ref: boardRef, layout } = useBoardLayout()
  // Seed from a fresh copy so the frozen module-level fixture is never aliased
  // by component state.
  const [events, setEvents] = useState<StickerEvent[]>(() => [...DEMO_EVENTS])
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(() => new Set())

  // Award and animate in one click-driven render. Both setters run outside any
  // updater function (a click is a discrete event, so React batches them), which
  // keeps the state updates pure — no StrictMode double-invoke surprises.
  function award(chore: DemoChore) {
    const { events: next, newId } = awardDemoSticker(events, chore)
    setEvents(next)
    setNewIds(new Set([newId]))
  }

  // Drop the just-awarded ids once the entrance has played, mirroring the real
  // board, so a later remount can't replay a stale drop animation.
  useEffect(() => {
    if (newIds.size === 0) return
    const timeout = window.setTimeout(() => setNewIds(new Set()), ENTRANCE_CLEAR_MS)
    return () => window.clearTimeout(timeout)
  }, [newIds])

  const total = events.length

  return (
    <main className="relative min-h-full px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-accent/20 bg-accent/5 px-4 py-2.5 text-sm">
          <span className="font-medium text-accent-strong">
            Demo board — nothing is saved
          </span>
          <Link
            to="/onboarding"
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 font-semibold text-white transition-colors hover:bg-accent-strong"
          >
            Create your household
          </Link>
        </div>

        <section className="mt-6 flex flex-col">
          <h1 className="flex items-center justify-center gap-3 text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            <span aria-hidden="true">{DEMO_KID.avatarEmoji}</span>
            {DEMO_KID.name}
          </h1>
          <p className="mt-1 text-center text-xl font-semibold text-accent-strong">
            {total} {total === 1 ? 'sticker' : 'stickers'}
          </p>

          <div ref={boardRef} className="mt-4 w-full">
            <StickerBoard
              events={events}
              layout={layout}
              imageUrls={{}}
              newIds={newIds}
              interactive
            />
          </div>

          <ProgressBar total={total} tiers={DEMO_TIERS} />
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-medium text-ink-muted">Tap to award a sticker</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {DEMO_CHORES.map((chore) => (
              <button
                key={chore.id}
                type="button"
                onClick={() => award(chore)}
                className="flex flex-col items-center gap-1.5 rounded-[var(--radius-card)] border border-black/5 bg-surface-raised px-3 py-4 text-center shadow-sm transition-transform active:scale-95"
              >
                <span className="text-3xl" aria-hidden="true">
                  {chore.emoji}
                </span>
                <span className="text-sm font-medium text-ink">{chore.name}</span>
              </button>
            ))}
          </div>
        </section>

        <p className="mt-8 text-center text-sm text-ink-muted">
          Like what you see?{' '}
          <Link
            to="/onboarding"
            className="font-medium text-accent-strong underline-offset-2 hover:underline"
          >
            Set up your own board
          </Link>
        </p>
      </div>
    </main>
  )
}
