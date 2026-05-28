import { useState } from 'react'
import type { RewardTier } from '../lib/types'

interface RedemptionSheetProps {
  tiers: RewardTier[]
  total: number
  onRedeem: (tier: RewardTier) => Promise<void>
  onClose: () => void
}

export function RedemptionSheet({ tiers, total, onRedeem, onClose }: RedemptionSheetProps) {
  const [selected, setSelected] = useState<RewardTier | null>(null)
  const [redeeming, setRedeeming] = useState(false)

  const unlocked = tiers.filter((t) => t.threshold <= total)

  async function handleConfirm() {
    if (!selected) return
    setRedeeming(true)
    try {
      await onRedeem(selected)
    } finally {
      setRedeeming(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Claim a reward"
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-surface px-5 pb-10 pt-5 shadow-2xl"
      >
        <div className="mb-4 h-1 w-10 rounded-full bg-black/20 mx-auto" aria-hidden="true" />

        <h2 className="text-center text-lg font-semibold text-ink">Claim a reward</h2>
        <p className="mt-1 text-center text-sm text-ink-muted">
          {total} {total === 1 ? 'sticker' : 'stickers'} earned
        </p>

        <ul className="mt-5 flex flex-col gap-3">
          {unlocked.map((tier) => {
            const isSelected = selected?.id === tier.id
            return (
              <li key={tier.id}>
                <button
                  type="button"
                  onClick={() => setSelected(isSelected ? null : tier)}
                  className={[
                    'w-full rounded-xl border-2 px-4 py-4 text-left transition-colors',
                    isSelected
                      ? 'border-accent bg-accent/10'
                      : 'border-black/10 bg-black/5 hover:border-accent/50',
                  ].join(' ')}
                >
                  <span className="block font-semibold text-ink">{tier.name}</span>
                  <span className="block text-sm text-ink-muted">{tier.threshold} stickers</span>
                </button>
              </li>
            )
          })}
        </ul>

        <button
          type="button"
          disabled={!selected || redeeming}
          onClick={() => void handleConfirm()}
          className="mt-5 w-full rounded-xl bg-accent py-4 font-semibold text-white transition-opacity disabled:opacity-40 active:opacity-80"
        >
          {redeeming ? 'Claiming…' : selected ? `Claim "${selected.name}"` : 'Select a reward'}
        </button>
      </div>
    </>
  )
}
