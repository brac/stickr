import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock the lazy-loaded confetti dependency so no real canvas work runs in jsdom.
const confettiSpy = vi.fn()
vi.mock('canvas-confetti', () => ({ default: confettiSpy }))

import { celebrateRedemption } from './celebrate'

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue({ matches }),
  })
}

describe('celebrateRedemption', () => {
  beforeEach(() => {
    confettiSpy.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fires confetti when motion is allowed', async () => {
    setReducedMotion(false)
    await celebrateRedemption()
    expect(confettiSpy).toHaveBeenCalled()
  })

  it('skips confetti entirely when the user prefers reduced motion', async () => {
    setReducedMotion(true)
    await celebrateRedemption()
    expect(confettiSpy).not.toHaveBeenCalled()
  })

  it('never rejects, even if confetti throws', async () => {
    setReducedMotion(false)
    confettiSpy.mockImplementationOnce(() => {
      throw new Error('canvas unavailable')
    })
    await expect(celebrateRedemption()).resolves.toBeUndefined()
  })
})
