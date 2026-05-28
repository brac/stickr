import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { vibrateAward, vibrateUndo, vibrateRedeem } from './haptics'

// haptics is additive polish: it must fire navigator.vibrate where available
// and be a safe no-op everywhere else (desktop, iOS Safari).

describe('haptics', () => {
  const originalVibrate = navigator.vibrate

  afterEach(() => {
    // Restore whatever jsdom started with.
    Object.defineProperty(navigator, 'vibrate', {
      value: originalVibrate,
      configurable: true,
      writable: true,
    })
    vi.restoreAllMocks()
  })

  describe('when the Vibration API is available', () => {
    let vibrate: ReturnType<typeof vi.fn>

    beforeEach(() => {
      vibrate = vi.fn(() => true)
      Object.defineProperty(navigator, 'vibrate', {
        value: vibrate,
        configurable: true,
        writable: true,
      })
    })

    it('awards a short crisp tick', () => {
      vibrateAward()
      expect(vibrate).toHaveBeenCalledWith(18)
    })

    it('undo is a lighter tick', () => {
      vibrateUndo()
      expect(vibrate).toHaveBeenCalledWith(10)
    })

    it('redeem fires a celebratory triple-tap pattern', () => {
      vibrateRedeem()
      expect(vibrate).toHaveBeenCalledWith([0, 28, 40, 28])
    })

    it('swallows errors thrown by vibrate (e.g. called outside a gesture)', () => {
      vibrate.mockImplementation(() => {
        throw new Error('NotAllowedError')
      })
      expect(() => vibrateAward()).not.toThrow()
    })
  })

  describe('when the Vibration API is absent', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'vibrate', {
        value: undefined,
        configurable: true,
        writable: true,
      })
    })

    it('is a no-op that does not throw', () => {
      expect(() => {
        vibrateAward()
        vibrateUndo()
        vibrateRedeem()
      }).not.toThrow()
    })
  })
})
