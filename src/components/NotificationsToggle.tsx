import { useEffect, useState } from 'react'
import { useMyParent } from '../hooks/useMyParent'
import {
  getPushState,
  subscribeToPush,
  unsubscribeFromPush,
  type PushState,
} from '../lib/pushNotifications'
import { getErrorMessage } from '../lib/errors'
import { useToast } from './toast/useToast'

// Opt-in control for award notifications. Permission is requested only when the
// parent taps "Turn on" (a user gesture — required on iOS, and avoids the
// browser penalty for prompting unprompted). Renders nothing until push is both
// supported on this device and configured for this build, so the half-built
// feature stays invisible until the Edge Function + VAPID keys are wired up.
export function NotificationsToggle() {
  const { parent } = useMyParent()
  const toast = useToast()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    getPushState()
      .then((next) => {
        if (active) setState(next)
      })
      .catch(() => {
        if (active) setState('unsupported')
      })
    return () => {
      active = false
    }
  }, [])

  if (state === null || state === 'unsupported' || state === 'unconfigured') {
    return null
  }

  async function enable() {
    if (!parent) return
    setBusy(true)
    try {
      await subscribeToPush(parent.id)
      setState('subscribed')
      toast.success("Notifications on — you'll hear when a sticker is awarded.")
    } catch (err) {
      toast.error(getErrorMessage(err))
      setState(await getPushState())
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      await unsubscribeFromPush()
      setState('idle')
      toast.success('Notifications off.')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-6 rounded-[var(--radius-card)] border border-black/10 bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-medium text-ink">Notifications</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Get a heads-up when your partner awards a sticker.
          </p>
        </div>

        {state === 'subscribed' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void disable()}
            className="shrink-0 rounded-lg border border-black/10 px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-black/5 disabled:opacity-60"
          >
            {busy ? 'Turning off…' : 'Turn off'}
          </button>
        ) : state === 'idle' ? (
          <button
            type="button"
            disabled={busy || !parent}
            onClick={() => void enable()}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
          >
            {busy ? 'Turning on…' : 'Turn on'}
          </button>
        ) : null}
      </div>

      {state === 'denied' && (
        <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-800">
          Notifications are blocked. Turn them on for Stickr in your browser or
          device settings, then come back.
        </p>
      )}
    </section>
  )
}
