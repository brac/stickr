import { describe, it, expect, afterEach, vi } from 'vitest'

import { flashRedemption, jostle } from './juice'

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

// The keyframes WAAPI is handed are an array of property bags; pull out the
// transform strings so tests can assert on what actually animates.
type Keyframe = { transform?: string }

function peakRotation(keyframes: Keyframe[]): number {
  let max = 0
  for (const frame of keyframes) {
    const match = /rotate\((-?[\d.]+)deg\)/.exec(frame.transform ?? '')
    if (match) {
      max = Math.max(max, Math.abs(Number(match[1])))
    }
  }
  return max
}

describe('jostle', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('does nothing when the user prefers reduced motion', () => {
    setReducedMotion(true)
    const el = document.createElement('div')
    const animate = vi.fn()
    el.animate = animate as unknown as HTMLElement['animate']
    jostle(el, 1)
    expect(animate).not.toHaveBeenCalled()
  })

  it('calls element.animate exactly once with transform-only keyframes', () => {
    setReducedMotion(false)
    const el = document.createElement('div')
    const animate = vi.fn()
    el.animate = animate as unknown as HTMLElement['animate']

    jostle(el, 1)

    expect(animate).toHaveBeenCalledTimes(1)
    const [keyframes] = animate.mock.calls[0] as [Keyframe[]]
    // Every keyframe must touch transform and nothing else (compositor-only).
    for (const frame of keyframes) {
      expect(Object.keys(frame)).toEqual(['transform'])
      expect(frame.transform).toMatch(/rotate\(/)
    }
  })

  it('scales wobble amplitude with intensity', () => {
    setReducedMotion(false)

    const strongEl = document.createElement('div')
    const strongAnimate = vi.fn()
    strongEl.animate = strongAnimate as unknown as HTMLElement['animate']
    jostle(strongEl, 1)

    const weakEl = document.createElement('div')
    const weakAnimate = vi.fn()
    weakEl.animate = weakAnimate as unknown as HTMLElement['animate']
    jostle(weakEl, 0.25)

    const strongPeak = peakRotation(
      (strongAnimate.mock.calls[0] as [Keyframe[]])[0],
    )
    const weakPeak = peakRotation((weakAnimate.mock.calls[0] as [Keyframe[]])[0])

    expect(strongPeak).toBeGreaterThan(weakPeak)
  })

  it('is a no-op (no throw) when element.animate is undefined', () => {
    setReducedMotion(false)
    const el = document.createElement('div')
    ;(el as { animate?: unknown }).animate = undefined
    expect(() => jostle(el, 1)).not.toThrow()
  })

  it('never throws even if animate throws', () => {
    setReducedMotion(false)
    const el = document.createElement('div')
    el.animate = (() => {
      throw new Error('animation unavailable')
    }) as unknown as HTMLElement['animate']
    expect(() => jostle(el, 1)).not.toThrow()
  })
})
