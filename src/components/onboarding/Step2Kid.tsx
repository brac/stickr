import type { AgeBand } from '../../lib/choreSuggestions'
import { inputClass } from './styles'

interface Step2KidProps {
  kidName: string
  band: AgeBand
  onKidNameChange: (value: string) => void
  onBandChange: (band: AgeBand) => void
}

interface BandOption {
  label: string
  value: AgeBand
}

const BAND_OPTIONS: readonly BandOption[] = [
  { label: '2–3', value: '2-3' },
  { label: '3–4', value: '3-4' },
  { label: 'Older / skip', value: 'older' },
]

export function Step2Kid({ kidName, band, onKidNameChange, onBandChange }: Step2KidProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink" htmlFor="kid">
        Kid's name
      </label>
      <input
        id="kid"
        value={kidName}
        onChange={(e) => onKidNameChange(e.target.value)}
        placeholder="Ava"
        className={`${inputClass} mb-4`}
      />

      <span className="block text-sm font-medium text-ink">Age</span>
      <p className="mb-2 text-sm text-ink-muted">
        Helps us suggest age-appropriate chores. Optional.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {BAND_OPTIONS.map((option) => {
          const selected = band === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onBandChange(option.value)}
              aria-pressed={selected}
              className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors ${
                selected
                  ? 'border-accent bg-accent text-white'
                  : 'border-black/10 bg-white text-ink hover:border-accent/50'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
