import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  isPushConfigured,
  isPushSupported,
  getPushState,
  showTestNotification,
} from './pushNotifications'

// jsdom provides navigator/window but not PushManager or serviceWorker, and the
// test build has no VITE_VAPID_PUBLIC_KEY — so these pin the graceful-degradation
// contract the opt-in UI relies on. The real subscribe/unsubscribe flows are
// browser-API orchestration, covered once push is fully wired (phase 2).
describe('pushNotifications guards', () => {
  it('reports unsupported when the Push APIs are absent', () => {
    expect(isPushSupported()).toBe(false)
  })

  it('reports configuration state as a boolean (driven by the build env)', () => {
    // Coupling to a specific value would make this depend on whether
    // VITE_VAPID_PUBLIC_KEY happens to be set in the local env; assert the
    // contract instead.
    expect(typeof isPushConfigured()).toBe('boolean')
  })

  it('getPushState degrades to "unsupported" rather than throwing', async () => {
    await expect(getPushState()).resolves.toBe('unsupported')
  })
})

// showTestNotification fires a banner straight from the local service worker so
// a parent can confirm their device can DISPLAY a notification independent of
// the remote push round-trip. jsdom has none of the push surface, so each test
// installs only the globals that exercise the specific guard under test.
describe('showTestNotification', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws when push is unsupported on this device', async () => {
    // No serviceWorker / PushManager / Notification — isPushSupported() is false.
    await expect(showTestNotification()).rejects.toThrow(
      "This device doesn't support notifications.",
    )
  })

  it('throws when notification permission is not granted', async () => {
    // Make the device "support" push (isPushSupported also requires
    // 'Notification' in window) but leave permission un-granted.
    const Notification = { permission: 'default' }
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve({}) },
    })
    vi.stubGlobal('window', { PushManager: class {}, Notification })
    vi.stubGlobal('Notification', Notification)

    await expect(showTestNotification()).rejects.toThrow(
      'Turn notifications on first.',
    )
  })

  it('shows a notification via the service worker on the happy path', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined)
    const Notification = { permission: 'granted' }
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve({ showNotification }) },
    })
    vi.stubGlobal('window', { PushManager: class {}, Notification })
    vi.stubGlobal('Notification', Notification)

    await expect(showTestNotification()).resolves.toBeUndefined()
    expect(showNotification).toHaveBeenCalledTimes(1)
    const [title, options] = showNotification.mock.calls[0]
    expect(title).toBe('Stickr')
    expect(options).toMatchObject({
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'stickr-test',
      data: { url: '/' },
    })
  })
})
