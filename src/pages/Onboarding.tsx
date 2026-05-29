import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createHousehold, fetchMyParent, joinHousehold } from '../lib/queries'
import { getErrorMessage } from '../lib/errors'
import { FullScreenSpinner } from '../components/FullScreenSpinner'
import type { AgeBand } from '../lib/choreSuggestions'
import { bandToApproxBirthdate, defaultSelectedNames } from '../lib/choreSuggestions'
import { inputClass } from '../components/onboarding/styles'
import { Step1Household } from '../components/onboarding/Step1Household'
import { Step2Kid } from '../components/onboarding/Step2Kid'
import { Step3Chores } from '../components/onboarding/Step3Chores'
import { Step4Reward } from '../components/onboarding/Step4Reward'

type Mode = 'create' | 'join'

const TOTAL_STEPS = 4
const STEP_TITLES: Record<number, string> = {
  1: 'Set up your household',
  2: 'Add your kid',
  3: 'Pick some chores',
  4: 'Set a reward',
}

export function Onboarding() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [mode, setMode] = useState<Mode>('create')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // create wizard
  const [step, setStep] = useState(1)
  const [householdName, setHouseholdName] = useState('')
  const [parentName, setParentName] = useState('')
  const [kidName, setKidName] = useState('')
  const [band, setBand] = useState<AgeBand>('older')
  const [selectedNames, setSelectedNames] = useState<Set<string>>(
    () => new Set(defaultSelectedNames('older')),
  )
  const [rewardName, setRewardName] = useState('Big reward')
  const [rewardThreshold, setRewardThreshold] = useState('10')

  // join fields
  const [joinCode, setJoinCode] = useState('')

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

  function handleBandChange(next: AgeBand) {
    setBand(next)
    setSelectedNames(new Set(defaultSelectedNames(next)))
  }

  function toggleChore(name: string) {
    setSelectedNames((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  function addCustomChore(name: string) {
    setSelectedNames((prev) => {
      const next = new Set(prev)
      next.add(name)
      return next
    })
  }

  // A reward is optional, but if a name is given the threshold must be a
  // positive integer — otherwise Number('') === 0 (or NaN) reaches the DB and
  // trips CHECK (threshold > 0), rolling back the whole atomic create.
  const thresholdNum = Number(rewardThreshold)
  const rewardOk =
    rewardName.trim().length > 0 && Number.isInteger(thresholdNum) && thresholdNum > 0
  const rewardStepValid = rewardName.trim().length === 0 || rewardOk

  const stepValid = useMemo(() => {
    switch (step) {
      case 1:
        return householdName.trim().length > 0 && parentName.trim().length > 0
      case 2:
        return kidName.trim().length > 0
      case 4:
        return rewardStepValid
      default:
        return true
    }
  }, [step, householdName, parentName, kidName, rewardStepValid])

  async function handleCreate() {
    setSubmitting(true)
    setError(null)
    try {
      const id = await createHousehold({
        householdName: householdName.trim(),
        parentName: parentName.trim(),
        kidName: kidName.trim(),
        birthdate: bandToApproxBirthdate(band),
        choreNames: [...selectedNames],
        rewardName: rewardOk ? rewardName.trim() : null,
        rewardThreshold: rewardOk ? thresholdNum : null,
      })
      if (!id) {
        throw new Error('Could not create household.')
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  async function handleJoinSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await joinHousehold({ joinCode, parentName })
      navigate('/', { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  if (checking) {
    return <FullScreenSpinner />
  }

  const modeToggle = (
    <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-black/5 p-1">
      <button
        type="button"
        onClick={() => {
          setMode('create')
          setError(null)
        }}
        className={`rounded-md py-2 text-sm font-medium transition-colors ${
          mode === 'create' ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-muted'
        }`}
      >
        Create new
      </button>
      <button
        type="button"
        onClick={() => {
          setMode('join')
          setError(null)
        }}
        className={`rounded-md py-2 text-sm font-medium transition-colors ${
          mode === 'join' ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-muted'
        }`}
      >
        Join existing
      </button>
    </div>
  )

  // JOIN PATH — single screen, unchanged behavior.
  if (mode === 'join') {
    return (
      <main className="flex min-h-full flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <header className="mb-6 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-ink">Join a household</h1>
            <p className="mt-1 text-ink-muted">
              Enter the code the other parent shared with you.
            </p>
          </header>

          {modeToggle}

          <form
            onSubmit={handleJoinSubmit}
            className="rounded-[var(--radius-card)] border border-black/5 bg-surface-raised p-6 shadow-sm"
          >
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
              {submitting ? 'Working…' : 'Join household'}
            </button>
          </form>
        </div>
      </main>
    )
  }

  // CREATE PATH — 4-step wizard.
  const isLastStep = step === TOTAL_STEPS

  return (
    <main className="flex min-h-full flex-col items-center justify-center px-6 py-8">
      <div className="w-full max-w-sm">
        <header className="mb-6 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">{STEP_TITLES[step]}</h1>
          <p className="mt-1 text-ink-muted">
            Step {step} of {TOTAL_STEPS}
          </p>
        </header>

        {step === 1 && modeToggle}

        <div className="rounded-[var(--radius-card)] border border-black/5 bg-surface-raised p-6 shadow-sm">
          {step === 1 && (
            <Step1Household
              householdName={householdName}
              parentName={parentName}
              onHouseholdNameChange={setHouseholdName}
              onParentNameChange={setParentName}
            />
          )}
          {step === 2 && (
            <Step2Kid
              kidName={kidName}
              band={band}
              onKidNameChange={setKidName}
              onBandChange={handleBandChange}
            />
          )}
          {step === 3 && (
            <Step3Chores
              band={band}
              selectedNames={selectedNames}
              onToggle={toggleChore}
              onAddCustom={addCustomChore}
            />
          )}
          {step === 4 && (
            <Step4Reward
              rewardName={rewardName}
              rewardThreshold={rewardThreshold}
              onRewardNameChange={setRewardName}
              onRewardThresholdChange={setRewardThreshold}
            />
          )}

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <div className="mt-6 flex gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setStep((s) => s - 1)
                }}
                disabled={submitting}
                className="flex-1 rounded-lg border border-black/10 bg-white px-4 py-2.5 font-medium text-ink transition-colors hover:border-accent/50 disabled:opacity-60"
              >
                Back
              </button>
            )}
            {isLastStep ? (
              <button
                type="button"
                onClick={handleCreate}
                disabled={submitting || !stepValid}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
              >
                {submitting ? 'Working…' : 'Create household'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setStep((s) => s + 1)
                }}
                disabled={!stepValid}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
