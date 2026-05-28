import { useEffect, useState, type FormEvent } from 'react'
import { SetupShell } from '../components/SetupShell'
import { FullScreenSpinner } from '../components/FullScreenSpinner'
import { useMyParent } from '../hooks/useMyParent'
import { createKid, fetchKids } from '../lib/queries'
import { getErrorMessage } from '../lib/errors'
import { useToast } from '../components/toast/useToast'
import type { Kid } from '../lib/types'

export function KidManager() {
  const { parent, loading } = useMyParent()
  const toast = useToast()
  const [kids, setKids] = useState<Kid[]>([])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const householdId = parent?.household_id

  useEffect(() => {
    if (!householdId) return
    let active = true
    fetchKids(householdId)
      .then((rows) => {
        if (active) setKids(rows)
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
    setKids(await fetchKids(householdId))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await createKid(trimmed)
      await reload()
      setName('')
      setAdding(false)
      toast.success('Kid added.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <FullScreenSpinner />
  }

  return (
    <SetupShell title="Kids" backTo="/setup">
      {adding ? (
        <form
          onSubmit={handleSubmit}
          className="rounded-[var(--radius-card)] border border-black/10 bg-surface-raised p-4"
        >
          <label className="block text-sm font-medium text-ink" htmlFor="kid-name">
            Name
          </label>
          <input
            id="kid-name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ava"
            className="mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <div className="mt-5 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Add kid'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setName('')
              }}
              className="rounded-lg px-4 py-2.5 font-medium text-ink-muted transition-colors hover:bg-black/5"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-[var(--radius-card)] bg-accent px-4 py-3 font-medium text-white transition-colors hover:bg-accent-strong"
        >
          Add a kid
        </button>
      )}

      <ul className="mt-6 flex flex-col gap-2">
        {kids.map((kid) => (
          <li
            key={kid.id}
            className="flex items-center gap-3 rounded-xl border border-black/10 bg-surface-raised p-3"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-lg">
              🧒
            </span>
            <span className="min-w-0 flex-1 truncate font-medium text-ink">
              {kid.name}
            </span>
            <span className="text-sm text-ink-muted tabular-nums">
              {kid.current_balance}{' '}
              {kid.current_balance === 1 ? 'sticker' : 'stickers'}
            </span>
          </li>
        ))}
        {kids.length === 0 && (
          <p className="mt-6 text-center text-sm text-ink-muted">
            No kids yet. Add your first one above.
          </p>
        )}
      </ul>
    </SetupShell>
  )
}
