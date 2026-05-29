import { describe, it, expect, afterEach, vi } from 'vitest'

import { flashRedemption } from './juice'

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue({ matches }),
  })
}

// Count overlay elements appended directly to <body> (the flash overlay).
function overlayCount(): number {
  return document.body.querySelectorAll('div').length
}

describe('flashRedemption', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('appends no element when the user prefers reduced motion', () => {
    setReducedMotion(true)
    flashRedemption()
    expect(overlayCount()).toBe(0)
  })

  it('appends an overlay when motion is allowed', () => {
    setReducedMotion(false)
    // Force the WAAPI path with a controllable animation object. jsdom does not
    // implement element.animate, so we install one for this test.
    const anim: { onfinish: (() => void) | null; oncancel: (() => void) | null } = {
      onfinish: null,
      oncancel: null,
    }
    const proto = HTMLElement.prototype as { animate?: unknown }
    const original = proto.animate
    proto.animate = () => anim
    try {
      flashRedemption()
      expect(overlayCount()).toBe(1)

      // Completing the animation removes the overlay.
      anim.onfinish?.()
      expect(overlayCount()).toBe(0)
    } finally {
      proto.animate = original
    }
  })

  it('removes the overlay via the setTimeout fallback when animate is unavailable', () => {
    setReducedMotion(false)
    vi.useFakeTimers()
    // Simulate jsdom-without-WAAPI: make element.animate non-callable so the
    // code takes the setTimeout cleanup path.
    const proto = HTMLElement.prototype as { animate?: unknown }
    const original = proto.animate
    proto.animate = undefined
    try {
      flashRedemption()
      expect(overlayCount()).toBe(1)

      vi.advanceTimersByTime(500)
      expect(overlayCount()).toBe(0)
    } finally {
      proto.animate = original
    }
  })

  it('never throws even if matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    })
    expect(() => flashRedemption()).not.toThrow()
  })

  it('never throws even if animate throws', () => {
    setReducedMotion(false)
    const proto = HTMLElement.prototype as { animate?: unknown }
    const original = proto.animate
    proto.animate = () => {
      throw new Error('animation unavailable')
    }
    try {
      expect(() => flashRedemption()).not.toThrow()
    } finally {
      proto.animate = original
    }
  })
})
