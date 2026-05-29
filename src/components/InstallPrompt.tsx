import { useState } from 'react'
import { useInstallPrompt } from '../hooks/useInstallPrompt'

const DISMISS_KEY = 'stickr.installPromptDismissed'

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    // Private mode / blocked storage — just show it.
    return false
  }
}

function rememberDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    // Ignore — dismissal simply won't persist across reloads.
  }
}

// A dismissible nudge to install the PWA. Renders nothing when the app is
// already installed, when there's nothing to offer, or once dismissed. On
// Android/desktop it triggers the native install dialog; on iOS it shows the
// manual Share → Add to Home Screen steps (there's no programmatic prompt).
export function InstallPrompt() {
  const { canInstall, platform, promptInstall } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(() => wasDismissed())

  if (!canInstall || dismissed) {
    return null
  }

  function dismiss() {
    rememberDismissed()
    setDismissed(true)
  }

  async function handleInstall() {
    const outcome = await promptInstall()
    // If they accepted, the appinstalled event hides this via the hook; if they
    // dismissed the native dialog, leave the banner so they can try again.
    if (outcome === 'accepted') {
      setDismissed(true)
    }
  }

  return (
    <section
      aria-labelledby="install-heading"
      className="relative mt-6 rounded-[var(--radius-card)] border border-accent/30 bg-accent/5 p-4 text-left"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="absolute right-2 top-2 rounded-md px-2 py-1 text-sm text-ink-muted transition-colors hover:bg-black/5"
      >
        ✕
      </button>

      <h2 id="install-heading" className="pr-6 font-medium text-ink">
        Add Stickr to your home screen
      </h2>

      {platform === 'prompt' ? (
        <>
          <p className="mt-1 text-sm text-ink-muted">
            Install it like an app — it opens full screen and stays one tap away.
          </p>
          <button
            type="button"
            onClick={() => void handleInstall()}
            className="mt-3 rounded-lg bg-accent px-4 py-2 font-medium text-white transition-colors hover:bg-accent-strong"
          >
            Install app
          </button>
        </>
      ) : (
        <ol className="mt-2 flex flex-col gap-1 text-sm text-ink-muted">
          <li>
            1. Open this page in <span className="font-medium text-ink">Safari</span>{' '}
            (not another app's browser).
          </li>
          <li>
            2. Tap the <span className="font-medium text-ink">Share</span> button
            (the square with an up arrow).
          </li>
          <li>
            3. Choose{' '}
            <span className="font-medium text-ink">Add to Home Screen</span>.
          </li>
        </ol>
      )}
    </section>
  )
}
