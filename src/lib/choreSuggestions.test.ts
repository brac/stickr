import { describe, it, expect } from 'vitest'
import {
  type AgeBand,
  type ChoreCategory,
  suggestionsForBand,
  bandToApproxBirthdate,
  defaultSelectedNames,
} from './choreSuggestions'

const ALL_BANDS: AgeBand[] = ['2-3', '3-4', 'older']

const VALID_CATEGORIES: ChoreCategory[] = [
  'Self-care',
  'Household',
  'Care',
  'Social-emotional',
  'Self-regulation',
]

describe('suggestionsForBand', () => {
  it.each(ALL_BANDS)('returns a non-empty array for band %s', (band) => {
    const suggestions = suggestionsForBand(band)
    expect(Array.isArray(suggestions)).toBe(true)
    expect(suggestions.length).toBeGreaterThan(0)
  })

  it.each(ALL_BANDS)('returns well-formed entries for band %s', (band) => {
    for (const entry of suggestionsForBand(band)) {
      expect(entry.name.trim().length).toBeGreaterThan(0)
      expect(entry.note.trim().length).toBeGreaterThan(0)
      expect(VALID_CATEGORIES).toContain(entry.category)
    }
  })

  it('returns a fresh copy so callers cannot mutate the catalog', () => {
    const first = suggestionsForBand('2-3')
    first[0].name = 'mutated'
    const second = suggestionsForBand('2-3')
    expect(second[0].name).not.toBe('mutated')
  })

  it('includes the verbatim bedrock 2–3 chore', () => {
    const names = suggestionsForBand('2-3').map((s) => s.name)
    expect(names).toContain('Put toys in bin')
  })

  it('includes the gold-tier 3–4 self-regulation chore', () => {
    const names = suggestionsForBand('3-4').map((s) => s.name)
    expect(names).toContain('Cleaned up without being asked')
  })
})

describe('bandToApproxBirthdate', () => {
  it('returns a YYYY-MM-DD string for the 2-3 band', () => {
    const result = bandToApproxBirthdate('2-3')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns a YYYY-MM-DD string for the 3-4 band', () => {
    const result = bandToApproxBirthdate('3-4')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns null for the older band', () => {
    expect(bandToApproxBirthdate('older')).toBeNull()
  })

  it('produces the expected midpoint year for 2-3 with a fixed today', () => {
    // 2.5y before 2026-06-15 → late 2023.
    const today = new Date(Date.UTC(2026, 5, 15))
    const result = bandToApproxBirthdate('2-3', today)
    expect(result).not.toBeNull()
    expect(result?.startsWith('2023-')).toBe(true)
  })

  it('produces the expected midpoint year for 3-4 with a fixed today', () => {
    // 3.5y before 2026-06-15 → late 2022.
    const today = new Date(Date.UTC(2026, 5, 15))
    const result = bandToApproxBirthdate('3-4', today)
    expect(result).not.toBeNull()
    expect(result?.startsWith('2022-')).toBe(true)
  })

  it('returns null for older even when a today is injected', () => {
    const today = new Date(Date.UTC(2026, 5, 15))
    expect(bandToApproxBirthdate('older', today)).toBeNull()
  })

  it('is older for the 3-4 band than the 2-3 band given the same today', () => {
    const today = new Date(Date.UTC(2026, 5, 15))
    const younger = bandToApproxBirthdate('2-3', today)
    const older = bandToApproxBirthdate('3-4', today)
    expect(older).not.toBeNull()
    expect(younger).not.toBeNull()
    // Earlier birthdate string sorts lexicographically before the later one.
    expect(older! < younger!).toBe(true)
  })
})

describe('defaultSelectedNames', () => {
  it.each(ALL_BANDS)('returns a 3–5 item starter subset for band %s', (band) => {
    const selected = defaultSelectedNames(band)
    expect(selected.length).toBeGreaterThanOrEqual(3)
    expect(selected.length).toBeLessThanOrEqual(5)
  })

  it.each(ALL_BANDS)('returns names that all exist in the band catalog for %s', (band) => {
    const catalogNames = new Set(suggestionsForBand(band).map((s) => s.name))
    for (const name of defaultSelectedNames(band)) {
      expect(catalogNames.has(name)).toBe(true)
    }
  })

  it.each(ALL_BANDS)('does not exceed the available catalog size for band %s', (band) => {
    const selected = defaultSelectedNames(band)
    expect(selected.length).toBeLessThanOrEqual(suggestionsForBand(band).length)
  })
})
