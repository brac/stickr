// Placeholder tiers until Phase 4 reads `reward_tier` rows from the DB.
const TIERS: readonly number[] = [10, 25, 50]
const MAX = TIERS[TIERS.length - 1]

interface ProgressBarProps {
  total: number
}

export function ProgressBar({ total }: ProgressBarProps) {
  const fillPct = Math.min(total / MAX, 1) * 100
  const nextTier = TIERS.find((tier) => tier > total)
  const remaining = nextTier ? nextTier - total : 0

  return (
    <div className="mt-4">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-black/10">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${fillPct}%` }}
        />
        {TIERS.map((tier) => (
          <span
            key={tier}
            className="pointer-events-none absolute top-0 h-full w-px bg-black/30"
            style={{ left: `${(tier / MAX) * 100}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className="mt-2 flex items-baseline justify-between text-sm">
        <span className="font-medium text-ink">
          {total} {total === 1 ? 'sticker' : 'stickers'}
        </span>
        <span className="text-ink-muted">
          {nextTier ? `${remaining} to go for ${nextTier}` : 'All tiers reached'}
        </span>
      </div>
    </div>
  )
}
