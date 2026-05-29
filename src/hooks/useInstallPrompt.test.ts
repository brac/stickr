import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useInstallPrompt } from './useInstallPrompt'

// jsdom has no matchMedia; default it to "not standalone" so the hook treats
// the test environment as a normal browser tab.
function setStandalone(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia
}

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ua })
}

// Build a stand-in for the non-standard beforeinstallprompt event.
function installEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  event.prompt = vi.fn().mockResolvedValue(undefined)
  event.userChoice = Promise.resolve({ outcome })
  return event
}

describe('useInstallPrompt', () => {
  beforeEach(() => {
    setStandalone(false)
    setUserAgent('Mozilla/5.0 (jsdom)')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setUserAgent('Mozilla/5.0 (jsdom)')
  })

  it('offers nothing in a plain desktop browser with no install event', () => {
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.canInstall).toBe(false)
    expect(result.current.platform).toBe('unsupported')
  })

  it('exposes the native prompt once beforeinstallprompt fires', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    const event = installEvent('accepted')

    act(() => {
      window.dispatchEvent(event)
    })

    expect(result.current.platform).toBe('prompt')
    expect(result.current.canInstall).toBe(true)

    let outcome: string | undefined
    await act(async () => {
      outcome = await result.current.promptInstall()
    })
    expect(event.prompt).toHaveBeenCalled()
    expect(outcome).toBe('accepted')
    // The event is single-use; the prompt is gone afterward.
    expect(result.current.platform).toBe('unsupported')
  })

  it('shows manual iOS instructions on an iPhone with no install event', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari')
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.platform).toBe('ios')
    expect(result.current.canInstall).toBe(true)
  })

  it('offers nothing when already running standalone', () => {
    setStandalone(true)
    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.canInstall).toBe(false)
  })

  it('returns "unavailable" when prompting without a captured event', async () => {
    const { result } = renderHook(() => useInstallPrompt())
    let outcome: string | undefined
    await act(async () => {
      outcome = await result.current.promptInstall()
    })
    expect(outcome).toBe('unavailable')
  })

  it('hides once the app is installed', () => {
    const { result } = renderHook(() => useInstallPrompt())
    act(() => {
      window.dispatchEvent(installEvent())
    })
    expect(result.current.canInstall).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(result.current.canInstall).toBe(false)
  })

  it('removes its listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useInstallPrompt())
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('appinstalled', expect.any(Function))
  })
})
