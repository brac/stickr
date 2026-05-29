// Static fixture powering the logged-out /demo board (Feature 28).
//
// A charming, lived-in household mid-progress toward a reward — driven entirely
// client-side so a visitor with no account (an evaluating parent, a recruiter
// browsing the repo) can see what Stickr actually looks like. Nothing here
// touches the database: the board and progress bar render off these plain rows
// exactly as they do for a real kid, and demo "awards" only append to in-memory
// React state, so a reload resets the board and zero writes ever leave the page.

import { computeStickerPosition, layoutFor } from './stickerPlacement'
import type { RewardTier, StickerEvent } from './types'

// Stable synthetic ids. Real rows use UUIDs; these are fixed strings so the
// seeded artwork/jitter is deterministic across renders and the fixture is easy
// to assert against in tests.
const DEMO_HOUSEHOLD_ID = 'demo-household'
const DEMO_KID_ID = 'demo-kid'
const DEMO_CHAPTER_ID = 'demo-chapter'
const DEMO_PARENT_ID = 'demo-parent'

// How many stickers the board starts with. Chosen to sit comfortably past the
// first reward and partway to the second, so the board reads as full and the
// progress bar is visibly mid-journey (see DEMO_TIERS).
export const DEMO_INITIAL_COUNT = 18

// Only the fields the demo board actually renders. We deliberately don't expose
// a full `Kid` row: the live count is derived from the events array, so a cached
// `current_balance` here would be a lie the moment the first demo sticker lands.
export interface DemoKid {
  id: string
  name: string
  avatarEmoji: string
}

export const DEMO_KID: DemoKid = {
  id: DEMO_KID_ID,
  name: 'Maya',
  avatarEmoji: '🦊',
}

export const DEMO_TIERS: RewardTier[] = [
  tier('demo-tier-1', 'Ice cream date', 10, 0),
  tier('demo-tier-2', 'Movie night', 25, 1),
  tier('demo-tier-3', 'Trip to the zoo', 50, 2),
]

export interface DemoChore {
  id: string
  name: string
  emoji: string
}

// The award buttons on the demo board. Recognizable everyday chores — not
// lorem-ipsum — so the loop reads at a glance.
export const DEMO_CHORES: readonly DemoChore[] = [
  { id: 'demo-chore-teeth', name: 'Brushed teeth', emoji: '🪥' },
  { id: 'demo-chore-dressed', name: 'Got dressed', emoji: '👕' },
  { id: 'demo-chore-tidy', name: 'Tidied toys', emoji: '🧸' },
  { id: 'demo-chore-kind', name: 'Was kind', emoji: '💛' },
]

// Reference width used only to snapshot plausible position columns onto the
// fixture rows. The board recomputes positions from the live layout at render
// time, so these are cosmetic — but real, not zeroed.
const REFERENCE_LAYOUT = layoutFor(420)

// Build one fixture sticker event. position_* mirror what the placement
// algorithm would store at award time, seeded by the event id.
function demoEvent(id: string, index: number, choreId: string | null): StickerEvent {
  const pos = computeStickerPosition(id, index, REFERENCE_LAYOUT)
  return {
    id,
    kid_id: DEMO_KID_ID,
    chore_id: choreId,
    chapter_id: DEMO_CHAPTER_ID,
    sticker_image_id: null, // null → built-in catalog artwork (offline-friendly)
    awarded_by: DEMO_PARENT_ID,
    amount: 1,
    label: null,
    position_x: Math.round(pos.x),
    position_y: Math.round(pos.y),
    rotation: Math.round(pos.rotation),
    created_at: '2026-01-01T00:00:00.000Z',
  }
}

// The board's starting stickers, spread across the demo chores in a round-robin
// so the history feels real rather than uniform. Frozen and typed `readonly` so
// it can't be mutated in place — every award goes through awardDemoSticker,
// which returns a new array (the page seeds its state from a fresh copy).
export const DEMO_EVENTS: readonly StickerEvent[] = Object.freeze(
  Array.from({ length: DEMO_INITIAL_COUNT }, (_, i) =>
    demoEvent(`demo-evt-${i}`, i, DEMO_CHORES[i % DEMO_CHORES.length].id),
  ),
)

// Append a fresh demo sticker when a visitor taps a chore. Client-only: the id
// is a one-off so artwork/jitter stay deterministic per sticker, and nothing is
// persisted. Returns a new array (no mutation of the caller's state).
export function awardDemoSticker(
  events: readonly StickerEvent[],
  chore: DemoChore,
): { events: StickerEvent[]; newId: string } {
  const newId = `demo-evt-${chore.id}-${events.length}-${randomSuffix()}`
  const next = [...events, demoEvent(newId, events.length, chore.id)]
  return { events: next, newId }
}

// Short non-colliding suffix so repeated taps on the same chore at the same
// length still produce distinct ids (and distinct seeded artwork). crypto is
// present in every browser secure context and the Node test runtime.
function randomSuffix(): string {
  return crypto.randomUUID().slice(0, 8)
}

function tier(id: string, name: string, threshold: number, sortOrder: number): RewardTier {
  return {
    id,
    household_id: DEMO_HOUSEHOLD_ID,
    name,
    threshold,
    sort_order: sortOrder,
    active: true,
    created_at: '2026-01-01T00:00:00.000Z',
  }
}
