import { useEffect, useState } from 'react'

// `beforeinstallprompt` isn't in the standard DOM lib types, so describe the
// slice we use. Chrome/Android fires it when the PWA is installable; we stash
// the event and fire it ourselves from an install button.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// 'prompt' — a native install dialog is available (Chrome/Android/desktop).
// 'ios'   — iOS Safari, where install is a manual Share → Add to Home Screen.
// 'unsupported' — nothing to offer (already installed, or a browser without it).
export type InstallPlatform = 'prompt' | 'ios' | 'unsupported'

export type PromptOutcome = 'accepted' | 'dismissed' | 'unavailable'

interface UseInstallPromptResult {
  canInstall: boolean
  platform: InstallPlatform
  promptInstall: () => Promise<PromptOutcome>
}

// Already running as an installed app — no point nudging an install.
function isStandalone(): boolean {
  const navStandalone = (navigator as Navigator & { standalone?: boolean }).standalone
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    navStandalone === true
  )
}

// iOS gives no beforeinstallprompt, so we sniff the platform to know when to
// show manual instructions instead. iPadOS reports as "Macintosh" but exposes
// touch, so cover that case too.
function isIos(): boolean {
  const ua = navigator.userAgent
  const iosDevice = /iphone|ipad|ipod/i.test(ua)
  const iPadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return iosDevice || iPadOs
}

export function useInstallPrompt(): UseInstallPromptResult {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => isStandalone())

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      // Suppress Chrome's mini-infobar; we surface our own install UI instead.
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const platform: InstallPlatform = installed
    ? 'unsupported'
    : deferred
      ? 'prompt'
      : isIos()
        ? 'ios'
        : 'unsupported'

  const canInstall = platform !== 'unsupported'

  async function promptInstall(): Promise<PromptOutcome> {
    if (!deferred) {
      return 'unavailable'
    }
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    // The captured event can only be used once; drop it either way.
    setDeferred(null)
    return outcome
  }

  return { canInstall, platform, promptInstall }
}
