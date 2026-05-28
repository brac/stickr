import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createHousehold, fetchMyParent, joinHousehold } from '../lib/queries'
import { getErrorMessage } from '../lib/errors'
import { FullScreenSpinner } from '../components/FullScreenSpinner'

type Mode = 'create' | 'join'

const inputClass =
  'mt-1 w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30'

export function Onboarding() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [mode, setMode] = useState<Mode>('create')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // create fields
  const [householdName, setHouseholdName] = useState('')
  const [kidName, setKidName] = useState('')
  // join fields
  const [joinCode, setJoinCode] = useState('')
  // shared
  const [parentName, setParentName] = useState('')

  useEffect(() => {
    let active = true
    fetchMyParent()
      .then((parent) => {
        if (!active) return
        if (parent) {
          navigate('/', { replace: true })
        } else {
          setChecking(false)
        }
      })
      .catch(() => {
        if (active) setChecking(false)
      })
    return () => {
      active = false
    }
  }, [navigate])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      if (mode === 'create') {
        await createHousehold({ householdName, parentName, kidName })
      } else {
        await joinHousehold({ joinCode, parentName })
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  if (checking) {
    return <FullScreenSpinner />
  }

  return (
    <main className="flex min-h-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            {mode === 'create' ? 'Set up your household' : 'Join a household'}
          </h1>
          <p className="mt-1 text-ink-muted">
            {mode === 'create'
              ? "You'll be able to invite the other parent next."
              : 'Enter the code the other parent shared with you.'}
          </p>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-black/5 p-1">
          <button
            type="button"
            onClick={() => setMode('create')}
            className={`rounded-md py-2 text-sm font-medium transition-colors ${
              mode === 'create' ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-muted'
            }`}
          >
            Create new
          </button>
          <button
            type="button"
            onClick={() => setMode('join')}
            className={`rounded-md py-2 text-sm font-medium transition-colors ${
              mode === 'join' ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-muted'
            }`}
          >
            Join existing
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-[var(--radius-card)] border border-black/5 bg-surface-raised p-6 shadow-sm"
        >
          {mode === 'create' ? (
            <>
              <label className="block text-sm font-medium text-ink" htmlFor="household">
                Household name
              </label>
              <input
                id="household"
                required
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="The Smiths"
                className={`${inputClass} mb-4`}
              />
              <label className="block text-sm font-medium text-ink" htmlFor="kid">
                Kid's name
              </label>
              <input
                id="kid"
                required
                value={kidName}
                onChange={(e) => setKidName(e.target.value)}
                placeholder="Ava"
                className={`${inputClass} mb-4`}
              />
            </>
          ) : (
            <>
              <label className="block text-sm font-medium text-ink" htmlFor="code">
                Join code
              </label>
              <input
                id="code"
                required
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                autoCapitalize="characters"
                className={`${inputClass} mb-4 font-mono tracking-widest`}
              />
            </>
          )}

          <label className="block text-sm font-medium text-ink" htmlFor="parent">
            Your name
          </label>
          <input
            id="parent"
            required
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
            placeholder="Mom"
            className={inputClass}
          />

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
          >
            {submitting ? 'Working…' : mode === 'create' ? 'Create household' : 'Join household'}
          </button>
        </form>
      </div>
    </main>
  )
}
