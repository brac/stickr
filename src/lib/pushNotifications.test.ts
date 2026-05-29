import { describe, it, expect } from 'vitest'
import {
  isPushConfigured,
  isPushSupported,
  getPushState,
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
