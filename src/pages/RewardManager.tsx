import { useEffect, useState, type FormEvent } from 'react'
import { SetupShell } from '../components/SetupShell'
import { FullScreenSpinner } from '../components/FullScreenSpinner'
import { EmptyState } from '../components/EmptyState'
import { useMyParent } from '../hooks/useMyParent'
import { fetchArchivedRewardTiers, fetchRewardTiers } from '../lib/queries'
import {
  createRewardTier,
  removeRewardTier,
  setRewardTierActive,
  updateRewardTier,
} from '../lib/rewards'
import { getErrorMessage } from '../lib/errors'
import { useToast } from '../components/toast/useToast'
import type { RewardTier } from '../lib/types'

interface FormState {
  id: string | null
  name: string
  threshold: string
}

export function RewardManager() {
  const { parent, loading } = useMyParent()
  const toast = useToast()
  const [tiers, setTiers] = useState<RewardTier[]>([])
  const [archived, setArchived] = useState<RewardTier[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)

  const householdId = parent?.household_id

  useEffect(() => {
    if (!householdId) return
    let active = true
    Promise.all([
      fetchRewardTiers(householdId),
      fetchArchivedRewardTiers(householdId),
    ])
      .then(([live, gone]) => {
        if (!active) return
        setTiers(live)
        setArchived(gone)
      })
      .catch((err) => {
        if (active) toast.error(getErrorMessage(err))
      })
    return () => {
      active = false
    }
  }, [householdId, toast])

  async function reload() {
    if (!householdId) return
    const [live, gone] = await Promise.all([
      fetchRewardTiers(householdId),
      fetchArchivedRewardTiers(householdId),
    ])
    setTiers(live)
    setArchived(gone)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form || !householdId) return
    const threshold = Number(form.threshold)
    if (!Number.isInteger(threshold) || threshold < 1) {
      toast.error('Threshold must be a whole number of 1 or more.')
      return
    }
    const isNew = form.id === null
    setSaving(true)
    try {
      const input = { name: form.name, threshold }
      if (isNew) {
        await createRewardTier(householdId, input)
      } else {
        await updateRewardTier(form.id as string, input)
      }
      await reload()
      setForm(null)
      toast.success(isNew ? 'Reward added.' : 'Reward updated.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(tier: RewardTier) {
    if (!window.confirm(`Remove the "${tier.name}" reward?`)) return
    try {
      const result = await removeRewardTier(tier.id)
      await reload()
      toast.success(
        result === 'deleted'
          ? 'Reward deleted.'
          : 'Reward archived — kept for reward history.',
      )
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handleRestore(tier: RewardTier) {
    try {
      await setRewardTierActive(tier.id, true)
      await reload()
      toast.success('Reward restored.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  if (loading) {
    return <FullScreenSpinner />
  }

  return (
    <SetupShell title="Rewards" backTo="/setup">
      {form ? (
        <form
          onSubmit={handleSubmit}
          className="rounded-[var(--radius-card)] border border-black/10 bg-surface-raised p-4"
        >
          <label className="block text-sm font-medium text-ink" htmlFor="reward-name">
            Reward
          </label>
          <input
            id="reward-name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ice cream"
            className="mt-1 mb-4 w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />

          <label className="block text-sm font-medium text-ink" htmlFor="reward-threshold">
            Stickers needed
          </label>
          <input
            id="reward-threshold"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            required
            value={form.threshold}
            onChange={(e) => setForm({ ...form, threshold: e.target.value })}
            placeholder="10"
            className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />

          <div className="mt-5 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
            >
              {saving ? 'Saving…' : form.id === null ? 'Add reward' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="rounded-lg px-4 py-2.5 font-medium text-ink-muted transition-colors hover:bg-black/5"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setForm({ id: null, name: '', threshold: '' })}
          className="w-full rounded-[var(--radius-card)] bg-accent px-4 py-3 font-medium text-white transition-colors hover:bg-accent-strong"
        >
          Add a reward
        </button>
      )}

      <ul className="mt-6 flex flex-col gap-2">
        {tiers.map((tier) => (
          <li
            key={tier.id}
            className="flex items-center gap-3 rounded-xl border border-black/10 bg-surface-raised p-3"
          >
            <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg bg-accent/10 font-semibold text-accent-strong tabular-nums">
              {tier.threshold}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium text-ink">
              {tier.name}
            </span>
            <button
              type="button"
              onClick={() =>
                setForm({
                  id: tier.id,
                  name: tier.name,
                  threshold: String(tier.threshold),
                })
              }
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-black/5"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(tier)}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      {tiers.length === 0 && (
        <EmptyState
          className="mt-6"
          tone="plain"
          title="No rewards yet"
          body="Add a few thresholds to unlock the claim button on the board."
        />
      )}

      {archived.length > 0 && (
        <details className="mt-8 rounded-[var(--radius-card)] border border-black/10 bg-surface-raised/60">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-ink-muted">
            Archived rewards ({archived.length})
          </summary>
          <p className="px-4 pb-2 text-xs text-ink-muted">
            These were redeemed in the past, so they're kept for reward history.
            Restore one to offer it again.
          </p>
          <ul className="flex flex-col gap-2 p-3 pt-1">
            {archived.map((tier) => (
              <li
                key={tier.id}
                className="flex items-center gap-3 rounded-xl border border-black/10 bg-white/60 p-3"
              >
                <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg bg-black/5 font-semibold text-ink-muted tabular-nums">
                  {tier.threshold}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-ink-muted">
                  {tier.name}
                </span>
                <button
                  type="button"
                  onClick={() => void handleRestore(tier)}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-accent-strong transition-colors hover:bg-accent/10"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </SetupShell>
  )
}
