import { supabase } from './supabase'
import { getErrorMessage } from './errors'

// Provided at build time once Web Push is wired up (Feature 9, phase 2). Until
// then it's undefined and the opt-in UI shows an "unconfigured" state.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// 'unsupported'  — browser lacks the Push/Notification/SW APIs (e.g. iOS Safari
//                  in a tab; iOS only supports push for an installed PWA).
// 'unconfigured' — no VAPID public key in this build yet.
// 'denied'       — the user blocked notifications.
// 'subscribed'   — granted and this device has an active subscription.
// 'idle'         — available but not yet subscribed on this device.
export type PushState =
  | 'unsupported'
  | 'unconfigured'
  | 'denied'
  | 'subscribed'
  | 'idle'

export function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY)
}

// Web Push wants the application server key as a Uint8Array, not the URL-safe
// base64 string the VAPID tooling emits.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  // Back the view with a concrete ArrayBuffer so it satisfies BufferSource
  // (applicationServerKey rejects the generic ArrayBufferLike-backed array).
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

// Where this device stands right now, for rendering the opt-in control.
export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported'
  if (!isPushConfigured()) return 'unconfigured'
  if (Notification.permission === 'denied') return 'denied'
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  return subscription ? 'subscribed' : 'idle'
}

// Request permission, subscribe this device, and persist the subscription so
// the Edge Function can reach it. Throws a user-friendly message on any block.
export async function subscribeToPush(parentId: string): Promise<void> {
  if (!isPushSupported()) {
    throw new Error("This device doesn't support notifications.")
  }
  if (!VAPID_PUBLIC_KEY) {
    throw new Error("Push notifications aren't set up yet.")
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      'Notifications are blocked. Enable them for Stickr in your browser settings.',
    )
  }

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))

  const { endpoint, keys } = subscription.toJSON()
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    throw new Error('Could not read the push subscription from this device.')
  }

  // Upsert on endpoint so re-enabling the same device refreshes rather than
  // creating duplicate rows.
  const { error } = await supabase.from('push_subscription').upsert(
    {
      parent_id: parentId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    { onConflict: 'endpoint' },
  )
  if (error) {
    throw new Error(getErrorMessage(error))
  }
}

// Tear down this device's subscription, both in the browser and in the DB.
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  const { endpoint } = subscription
  await subscription.unsubscribe()

  const { error } = await supabase
    .from('push_subscription')
    .delete()
    .eq('endpoint', endpoint)
  if (error) {
    throw new Error(getErrorMessage(error))
  }
}
