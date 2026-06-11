import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { RewardTier } from '../lib/types'

interface ProgressBarProps {
  total: number
  tiers: RewardTier[]
  // Omit to render read-only (no claim button) — used by the kid-facing board.
  onClaimClick?: () => void
}

// How long the count number holds its punch — comfortably past the ~320ms pulse.
const COUNT_PUNCH_MS = 320

export function ProgressBar({ total, tiers, onClaimClick }: ProgressBarProps) {
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold)
  const max = sorted[sorted.length - 1]?.threshold ?? 50
  const fillPct = Math.min(total / max, 1) * 100
  const nextTier = sorted.find((t) => t.threshold > total)
  const unlockedCount = sorted.filter((t) => t.threshold <= total).length

  // Pulse the count number when the total climbs. A mount guard skips the first
  // render so a freshly mounted board doesn't punch. The CSS class is neutralised
  // under prefers-reduced-motion, so this stays reduced-motion safe.
  const prevTotalRef = useRef(total)
  const [punching, setPunching] = useState(false)
  useEffect(() => {
    const prevTotal = prevTotalRef.current
    prevTotalRef.current = total
    if (total <= prevTotal) return
    setPunching(true)
    const timeout = window.setTimeout(() => setPunching(false), COUNT_PUNCH_MS)
    return () => window.clearTimeout(timeout)
  }, [total])

  return (
    <div className="mt-4">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-black/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${fillPct}%` }}
        />
        {sorted.map((tier) => (
          <span
            key={tier.id}
            className="pointer-events-none absolute top-0 h-full w-px bg-black/30"
            style={{ left: `${(tier.threshold / max) * 100}%` }}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className="mt-2 flex items-baseline justify-between text-sm">
        <span className={`inline-block font-medium text-ink${punching ? ' count-punch' : ''}`}>
          {total} {total === 1 ? 'sticker' : 'stickers'}
        </span>
        {nextTier ? (
          <span className="text-ink-muted">
            {nextTier.threshold - total} to go · {nextTier.name}
          </span>
        ) : tiers.length > 0 ? (
          <span className="text-ink-muted">All tiers reached</span>
        ) : onClaimClick ? (
          <Link
            to="/setup/rewards"
            className="font-medium text-accent-strong underline-offset-2 hover:underline"
          >
            Set a first reward
          </Link>
        ) : null}
      </div>

      {onClaimClick && unlockedCount > 0 && (
        <button
          type="button"
          onClick={onClaimClick}
          className="mt-3 w-full rounded-xl bg-accent py-3 font-semibold text-white shadow-sm transition-opacity active:opacity-80"
        >
          🎉 Claim a reward
        </button>
      )}
    </div>
  )
}
