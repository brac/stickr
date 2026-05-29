import { useMemo, useState } from 'react'
import type { AgeBand, ChoreCategory, ChoreSuggestion } from '../../lib/choreSuggestions'
import { suggestionsForBand } from '../../lib/choreSuggestions'
import { inputClass } from './styles'

interface Step3ChoresProps {
  band: AgeBand
  selectedNames: ReadonlySet<string>
  onToggle: (name: string) => void
  onAddCustom: (name: string) => void
}

interface CategoryGroup {
  category: ChoreCategory
  items: ChoreSuggestion[]
}

function groupByCategory(suggestions: ChoreSuggestion[]): CategoryGroup[] {
  const groups: CategoryGroup[] = []
  for (const suggestion of suggestions) {
    const existing = groups.find((group) => group.category === suggestion.category)
    if (existing) {
      existing.items.push(suggestion)
    } else {
      groups.push({ category: suggestion.category, items: [suggestion] })
    }
  }
  return groups
}

export function Step3Chores({ band, selectedNames, onToggle, onAddCustom }: Step3ChoresProps) {
  const [customName, setCustomName] = useState('')

  const groups = useMemo(() => groupByCategory(suggestionsForBand(band)), [band])

  // Selected names not present in the band catalog are custom additions.
  const customNames = useMemo(() => {
    const catalogNames = new Set(suggestionsForBand(band).map((s) => s.name))
    return [...selectedNames].filter((name) => !catalogNames.has(name))
  }, [band, selectedNames])

  function handleAddCustom() {
    const trimmed = customName.trim()
    if (!trimmed) return
    onAddCustom(trimmed)
    setCustomName('')
  }

  return (
    <div>
      <p className="mb-3 text-sm text-ink-muted">
        Pick the chores to start with. You can change these any time.
      </p>

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.category}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {group.category}
            </h3>
            <ul className="space-y-1.5">
              {group.items.map((item) => {
                const selected = selectedNames.has(item.name)
                return (
                  <li key={item.name}>
                    <button
                      type="button"
                      onClick={() => onToggle(item.name)}
                      aria-pressed={selected}
                      className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                        selected
                          ? 'border-accent bg-accent/10'
                          : 'border-black/10 bg-white hover:border-accent/40'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-bold ${
                          selected
                            ? 'border-accent bg-accent text-white'
                            : 'border-black/20 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">{item.name}</span>
                        <span className="block text-xs text-ink-muted">{item.note}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}

        {customNames.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Your own
            </h3>
            <ul className="space-y-1.5">
              {customNames.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => onToggle(name)}
                    aria-pressed={true}
                    className="flex w-full items-start gap-3 rounded-lg border border-accent bg-accent/10 px-3 py-2 text-left transition-colors"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-accent bg-accent text-xs font-bold text-white"
                    >
                      ✓
                    </span>
                    <span className="block text-sm font-medium text-ink">{name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-ink" htmlFor="custom-chore">
          Add your own
        </label>
        <div className="flex gap-2">
          <input
            id="custom-chore"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAddCustom()
              }
            }}
            placeholder="Brushed hair"
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleAddCustom}
            disabled={!customName.trim()}
            className="mt-1 shrink-0 rounded-lg border border-black/10 bg-white px-4 font-medium text-ink transition-colors hover:border-accent/50 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
