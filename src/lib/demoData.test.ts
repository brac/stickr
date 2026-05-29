import { describe, expect, it } from 'vitest'
import {
  DEMO_CHORES,
  DEMO_EVENTS,
  DEMO_INITIAL_COUNT,
  DEMO_KID,
  DEMO_TIERS,
  awardDemoSticker,
} from './demoData'

describe('demo fixture', () => {
  it('starts with the declared sticker count', () => {
    expect(DEMO_EVENTS).toHaveLength(DEMO_INITIAL_COUNT)
  })

  it('exposes the fixture as a frozen array', () => {
    expect(Object.isFrozen(DEMO_EVENTS)).toBe(true)
  })

  it('has unique event ids', () => {
    const ids = new Set(DEMO_EVENTS.map((e) => e.id))
    expect(ids.size).toBe(DEMO_EVENTS.length)
  })

  it('references only known demo chores and the demo kid', () => {
    const choreIds = new Set(DEMO_CHORES.map((c) => c.id))
    for (const event of DEMO_EVENTS) {
      expect(event.kid_id).toBe(DEMO_KID.id)
      const choreId = event.chore_id
      if (choreId === null) {
        throw new Error(`demo event ${event.id} has a null chore_id`)
      }
      expect(choreIds.has(choreId)).toBe(true)
    }
  })

  it('sits mid-progress — past at least one tier, short of another', () => {
    const total = DEMO_EVENTS.length
    const unlocked = DEMO_TIERS.filter((t) => t.threshold <= total)
    const locked = DEMO_TIERS.filter((t) => t.threshold > total)
    expect(unlocked.length).toBeGreaterThan(0)
    expect(locked.length).toBeGreaterThan(0)
  })

  it('keeps reward tiers sorted by ascending threshold', () => {
    const thresholds = DEMO_TIERS.map((t) => t.threshold)
    const sorted = [...thresholds].sort((a, b) => a - b)
    expect(thresholds).toEqual(sorted)
  })
})

describe('awardDemoSticker', () => {
  it('appends one sticker without mutating the input', () => {
    const before = DEMO_EVENTS
    const { events, newId } = awardDemoSticker(before, DEMO_CHORES[0])
    expect(before).toHaveLength(DEMO_INITIAL_COUNT) // input untouched
    expect(events).toHaveLength(DEMO_INITIAL_COUNT + 1)
    expect(events[events.length - 1].id).toBe(newId)
    expect(events[events.length - 1].chore_id).toBe(DEMO_CHORES[0].id)
  })

  it('produces a distinct id on every tap', () => {
    const a = awardDemoSticker(DEMO_EVENTS, DEMO_CHORES[0])
    const b = awardDemoSticker(a.events, DEMO_CHORES[0])
    expect(a.newId).not.toBe(b.newId)
  })
})
