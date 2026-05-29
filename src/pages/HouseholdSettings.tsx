import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SetupShell } from '../components/SetupShell'
import { FullScreenSpinner } from '../components/FullScreenSpinner'
import { useMyParent } from '../hooks/useMyParent'
import { useAuth } from '../auth/useAuth'
import {
  fetchHousehold,
  fetchKids,
  fetchParents,
  regenerateJoinCode,
  updateHouseholdName,
  updateKidName,
} from '../lib/queries'
import { deleteAccount } from '../lib/account'
import { getErrorMessage } from '../lib/errors'
import { useToast } from '../components/toast/useToast'
import type { Household, Kid, Parent } from '../lib/types'

export function HouseholdSettings() {
  const { parent, loading } = useMyParent()
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [household, setHousehold] = useState<Household | null>(null)
  const [parents, setParents] = useState<Parent[]>([])
  const [kids, setKids] = useState<Kid[]>([])
  const [busy, setBusy] = useState(false)

  // Account deletion.
  const [showDelete, setShowDelete] = useState(false)
  const [confirmDraft, setConfirmDraft] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Household-name editing.
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  // Per-kid name editing.
  const [editingKidId, setEditingKidId] = useState<string | null>(null)
  const [kidDraft, setKidDraft] = useState('')

  const householdId = parent?.household_id

  useEffect(() => {
    if (!householdId) return
    let active = true
    Promise.all([
      fetchHousehold(householdId),
      fetchParents(householdId),
      fetchKids(householdId),
    ])
      .then(([hh, members, theKids]) => {
        if (!active) return
        setHousehold(hh)
        setParents(members)
        setKids(theKids)
      })
      .catch((err) => {
        if (active) toast.error(getErrorMessage(err))
      })
    return () => {
      active = false
    }
  }, [householdId, toast])

  async function saveHouseholdName() {
    const trimmed = nameDraft.trim()
    if (!trimmed) {
      toast.error('Household name is required.')
      return
    }
    setBusy(true)
    try {
      await updateHouseholdName(trimmed)
      setHousehold((prev) => (prev ? { ...prev, name: trimmed } : prev))
      setEditingName(false)
      toast.success('Household renamed.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function saveKidName(kid: Kid) {
    const trimmed = kidDraft.trim()
    if (!trimmed) {
      toast.error('Name is required.')
      return
    }
    setBusy(true)
    try {
      await updateKidName(kid.id, trimmed)
      setKids((prev) =>
        prev.map((k) => (k.id === kid.id ? { ...k, name: trimmed } : k)),
      )
      setEditingKidId(null)
      toast.success('Name updated.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function copyCode() {
    if (!household) return
    try {
      await navigator.clipboard.writeText(household.join_code)
      toast.success('Invite code copied.')
    } catch {
      toast.error('Could not copy automatically — select the code to copy it.')
    }
  }

  async function regenerate() {
    if (
      !window.confirm(
        'Generate a new invite code? The current code will stop working — anyone you already shared it with will need the new one.',
      )
    ) {
      return
    }
    setBusy(true)
    try {
      const next = await regenerateJoinCode()
      setHousehold((prev) => (prev ? { ...prev, join_code: next } : prev))
      toast.success('New invite code generated.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await deleteAccount()
      toast.success('Your account has been deleted.')
      await signOut()
      navigate('/signin', { replace: true })
    } catch (err) {
      toast.error(getErrorMessage(err))
      setDeleting(false)
    }
  }

  if (loading || !household) {
    return <FullScreenSpinner />
  }

  // Deleting the only parent tears down the whole household; otherwise it just
  // removes this parent and leaves the household for the others.
  const soleParent = parents.length <= 1
  const otherParents = parents.filter((member) => member.id !== parent?.id)
  // Sole-parent deletion is irreversible and destroys everyone's data, so gate
  // it behind typing the household name. Co-parent removal needs only a tap.
  const canConfirmDelete =
    !deleting &&
    (!soleParent || confirmDraft.trim() === household.name.trim())

  const inputClass =
    'w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30'
  const cardClass =
    'rounded-[var(--radius-card)] border border-black/10 bg-surface-raised p-4'

  return (
    <SetupShell title="Household" backTo="/setup">
      {/* Household name */}
      <section className={cardClass}>
        <h2 className="text-sm font-medium text-ink-muted">Household name</h2>
        {editingName ? (
          <div className="mt-2 flex gap-2">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className={inputClass}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveHouseholdName()}
              className="shrink-0 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditingName(false)}
              className="shrink-0 rounded-lg px-3 py-2.5 font-medium text-ink-muted transition-colors hover:bg-black/5"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-lg font-semibold text-ink">
              {household.name}
            </span>
            <button
              type="button"
              onClick={() => {
                setNameDraft(household.name)
                setEditingName(true)
              }}
              className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-black/5"
            >
              Edit
            </button>
          </div>
        )}
      </section>

      {/* Invite code */}
      <section className={`mt-4 ${cardClass}`}>
        <h2 className="text-sm font-medium text-ink-muted">Invite code</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Share this so the other parent can join your household.
        </p>
        <div className="mt-3 rounded-xl bg-accent/5 py-4 text-center">
          <span
            data-testid="invite-code"
            className="font-mono text-3xl font-bold tracking-[0.3em] text-ink"
          >
            {household.join_code}
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => void copyCode()}
            className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong"
          >
            Copy code
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void regenerate()}
            className="shrink-0 rounded-lg border border-black/10 px-4 py-2.5 font-medium text-ink-muted transition-colors hover:bg-black/5 disabled:opacity-60"
          >
            Regenerate
          </button>
        </div>
      </section>

      {/* Members */}
      <section className={`mt-4 ${cardClass}`}>
        <h2 className="text-sm font-medium text-ink-muted">Members</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {parents.map((member) => (
            <li key={member.id} className="flex items-center gap-2 py-1 text-ink">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent-strong">
                {member.display_name.charAt(0).toUpperCase()}
              </span>
              <span className="font-medium">{member.display_name}</span>
              {member.id === parent?.id && (
                <span className="text-sm text-ink-muted">(you)</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Kid names */}
      <section className={`mt-4 ${cardClass}`}>
        <h2 className="text-sm font-medium text-ink-muted">
          {kids.length === 1 ? 'Kid' : 'Kids'}
        </h2>
        <ul className="mt-2 flex flex-col gap-2">
          {kids.map((kid) => (
            <li key={kid.id}>
              {editingKidId === kid.id ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={kidDraft}
                    onChange={(e) => setKidDraft(e.target.value)}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void saveKidName(kid)}
                    className="shrink-0 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingKidId(null)}
                    className="shrink-0 rounded-lg px-3 py-2.5 font-medium text-ink-muted transition-colors hover:bg-black/5"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">
                    {kid.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setKidDraft(kid.name)
                      setEditingKidId(kid.id)
                    }}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-black/5"
                  >
                    Edit
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Danger zone */}
      <section className="mt-8 rounded-[var(--radius-card)] border border-red-200 bg-red-50 p-4">
        <h2 className="text-sm font-medium text-red-600">Danger zone</h2>
        <p className="mt-1 text-xs text-ink-muted">
          {soleParent
            ? 'You’re the only parent, so deleting your account permanently deletes the entire household — every kid, board, sticker, and reward. This cannot be undone.'
            : `Remove your account from this household. ${
                otherParents[0]?.display_name ?? 'The other parent'
              } keeps the household and all its history.`}
        </p>
        <button
          type="button"
          onClick={() => {
            setConfirmDraft('')
            setShowDelete(true)
          }}
          className="mt-3 rounded-lg border border-red-200 px-4 py-2.5 font-medium text-red-600 transition-colors hover:bg-red-100"
        >
          Delete my account
        </button>
      </section>

      {showDelete && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => !deleting && setShowDelete(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete your account"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto rounded-t-2xl bg-surface px-5 pb-10 pt-5 shadow-2xl"
          >
            <div
              className="mx-auto mb-4 h-1 w-10 rounded-full bg-black/20"
              aria-hidden="true"
            />
            <h2 className="text-center text-lg font-semibold text-ink">
              {soleParent ? 'Delete household?' : 'Delete your account?'}
            </h2>
            <p className="mt-3 text-sm text-ink-muted">
              {soleParent ? (
                <>
                  This permanently deletes <strong>{household.name}</strong> and
                  everything in it — kids, boards, stickers, rewards, and
                  history. This cannot be undone.
                </>
              ) : (
                <>
                  This removes your account from{' '}
                  <strong>{household.name}</strong>.{' '}
                  {otherParents[0]?.display_name ?? 'The other parent'} keeps the
                  household and all its history. This cannot be undone.
                </>
              )}
            </p>

            {soleParent && (
              <label className="mt-4 block text-sm font-medium text-ink">
                Type <strong>{household.name}</strong> to confirm
                <input
                  type="text"
                  value={confirmDraft}
                  autoFocus
                  onChange={(event) => setConfirmDraft(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-black/10 bg-surface-raised px-3 py-2.5 text-base text-ink outline-none focus:border-red-500"
                />
              </label>
            )}

            <button
              type="button"
              disabled={!canConfirmDelete}
              onClick={() => void confirmDelete()}
              className="mt-6 w-full rounded-xl bg-red-600 py-4 font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-40"
            >
              {deleting
                ? 'Deleting…'
                : soleParent
                  ? 'Delete household'
                  : 'Delete my account'}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setShowDelete(false)}
              className="mt-2 w-full rounded-xl px-4 py-2.5 font-medium text-ink-muted transition-colors hover:bg-black/5 disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </SetupShell>
  )
}
