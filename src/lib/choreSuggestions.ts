// Static chore-suggestion catalog, keyed by developmental age band. Pure data +
// pure helpers — NO DB access. Sourced from child-development guidance (see
// docs/FUTURE.md §"The chore suggestion catalog"). Each entry is seed text the
// parent picks from during onboarding; chosen names become normal `chore` rows.
// The `note` is onboarding-only copy and is never stored.

export type AgeBand = '2-3' | '3-4' | 'older'

export type ChoreCategory =
  | 'Self-care'
  | 'Household'
  | 'Care'
  | 'Social-emotional'
  | 'Self-regulation'

export interface ChoreSuggestion {
  name: string
  category: ChoreCategory
  note: string
}

// Ages 2–3 — verbatim from docs/FUTURE.md §catalog.
const SUGGESTIONS_2_3: readonly ChoreSuggestion[] = [
  { name: 'Put toys in bin', category: 'Self-care', note: 'The bedrock chore. Universally cited.' },
  { name: 'Dirty clothes in hamper', category: 'Self-care', note: 'Classic, well within fine-motor range.' },
  { name: 'Throw trash in can', category: 'Household', note: 'Simple aim + release motion.' },
  { name: 'Help wipe up spills', category: 'Household', note: '"Help" being key — alongside a parent.' },
  { name: 'Stack books on shelf', category: 'Household', note: 'Sorting + placement.' },
  { name: 'Carry plates to sink', category: 'Household', note: 'Light, unbreakable items only.' },
  { name: 'Feed pet (with help)', category: 'Care', note: 'Scooping food, parent supervising.' },
  { name: 'Got dressed (with help)', category: 'Self-care', note: 'Pulling shirt over head, pants on.' },
  { name: 'Brushed teeth (with help)', category: 'Self-care', note: 'Adult finishes; kid did the motion.' },
  { name: 'Used the potty', category: 'Self-care', note: 'Reward-worthy at this age.' },
  { name: 'Gentle with brother', category: 'Social-emotional', note: 'Big one for sibling-aware households.' },
  { name: 'Used words instead of crying', category: 'Social-emotional', note: 'Verbal regulation milestone.' },
]

// Ages 3–4 — verbatim from docs/FUTURE.md §catalog.
const SUGGESTIONS_3_4: readonly ChoreSuggestion[] = [
  { name: 'Made bed (alone)', category: 'Self-care', note: "Imperfectly is fine — that's the standard." },
  { name: 'Cleared own plate from table', category: 'Household', note: 'Independence marker per AAP.' },
  { name: 'Set the table', category: 'Household', note: 'Spatial reasoning + memory.' },
  { name: 'Hung up towel after bath', category: 'Self-care', note: 'Self-care follow-through.' },
  { name: 'Put away laundry', category: 'Self-care', note: 'Matching socks, sorting own clothes.' },
  { name: 'Watered a plant', category: 'Household', note: 'Light caretaking responsibility.' },
  { name: 'Got dressed (alone)', category: 'Self-care', note: 'Big milestone — graduated from "with help".' },
  { name: 'Brushed teeth (alone)', category: 'Self-care', note: 'Same — graduated.' },
  { name: 'Helped feed brother', category: 'Social-emotional', note: 'Caretaking, sibling-positive.' },
  { name: 'Tried a new food', category: 'Self-regulation', note: 'Inhibitory control + flexibility.' },
  { name: 'Listened the first time', category: 'Self-regulation', note: 'Response inhibition — peak development age.' },
  { name: 'Waited their turn', category: 'Self-regulation', note: 'Same.' },
  { name: 'Cleaned up without being asked', category: 'Self-regulation', note: 'Initiative — the gold-tier 4yo chore.' },
  { name: 'Used kind words after a conflict', category: 'Social-emotional', note: 'Emotional regulation post-upset.' },
  { name: 'Helped a friend', category: 'Social-emotional', note: 'Theory of mind kicking in.' },
]

// 'older' — generic, age-agnostic starter set for kids past the 3–4 band (or
// when age is skipped). Sensible everyday chores with appropriate categories.
const SUGGESTIONS_OLDER: readonly ChoreSuggestion[] = [
  { name: 'Made bed', category: 'Self-care', note: 'Daily self-care routine.' },
  { name: 'Homework done', category: 'Self-regulation', note: 'Follow-through on responsibilities.' },
  { name: 'Set the table', category: 'Household', note: 'Helping with the family meal.' },
  { name: 'Fed the pet', category: 'Care', note: 'Caring for an animal independently.' },
  { name: 'Put away laundry', category: 'Self-care', note: 'Folding and sorting own clothes.' },
  { name: 'Helped with dishes', category: 'Household', note: 'Clearing, rinsing, or loading.' },
  { name: 'Read for 20 min', category: 'Self-regulation', note: 'Sustained focus and a good habit.' },
  { name: 'Kind to sibling', category: 'Social-emotional', note: 'Getting along at home.' },
]

const CATALOG: Record<AgeBand, readonly ChoreSuggestion[]> = {
  '2-3': SUGGESTIONS_2_3,
  '3-4': SUGGESTIONS_3_4,
  older: SUGGESTIONS_OLDER,
}

// Number of starter chores preselected for each band (3–5 range per contract).
const DEFAULT_SELECTED_COUNT = 4

// Midpoint age in years for each band; 'older' has no representative birthdate.
const BAND_MIDPOINT_YEARS: Record<AgeBand, number | null> = {
  '2-3': 2.5,
  '3-4': 3.5,
  older: null,
}

const MS_PER_DAY = 86_400_000
const DAYS_PER_YEAR = 365.25

/** Returns the catalog entries for a band (a fresh array; callers may mutate safely). */
export function suggestionsForBand(band: AgeBand): ChoreSuggestion[] {
  return CATALOG[band].map((entry) => ({ ...entry }))
}

/**
 * Approximate birthdate for the band's midpoint age, as an ISO `YYYY-MM-DD`
 * (date-only) string. Returns `null` for the 'older' band (no representative age).
 * `today` defaults to the current date at call time when omitted.
 */
export function bandToApproxBirthdate(band: AgeBand, today?: Date): string | null {
  const midpointYears = BAND_MIDPOINT_YEARS[band]
  if (midpointYears === null) return null

  const reference = today ?? new Date()
  const birthMs = reference.getTime() - midpointYears * DAYS_PER_YEAR * MS_PER_DAY
  const birthDate = new Date(birthMs)

  const year = birthDate.getUTCFullYear()
  const month = String(birthDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(birthDate.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** A sensible 3–5 item starter subset of the band's chore names. */
export function defaultSelectedNames(band: AgeBand): string[] {
  return CATALOG[band].slice(0, DEFAULT_SELECTED_COUNT).map((entry) => entry.name)
}
