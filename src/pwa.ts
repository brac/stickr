import { registerSW } from 'virtual:pwa-register'
import { reportError } from './lib/monitoring'

// The PWA uses registerType: 'autoUpdate' (see vite.config.ts), but the default
// registration only checks for a new service worker on a real page load. A PWA
// pinned to the home screen usually *resumes* warm instead of navigating, so it
// can keep running a stale SW until a cold start or the browser's ~24h
// background check. Polling here, plus a check when the app returns to the
// foreground, closes that gap — autoUpdate activates + reloads automatically
// once update() finds a new SW.
const UPDATE_INTERVAL_MS = 60 * 60 * 1000 // hourly

// Called from main.tsx AFTER initMonitoring() (not at import time, where a
// registration failure would hit a not-yet-initialised reportError and no-op).
export function registerPwa(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      const checkForUpdate = () => {
        registration.update().catch((err) => {
          // A failed check means a stale SW can linger — report so a broken
          // SW deploy is visible on the dashboard.
          reportError(err, { where: 'pwa: update check' })
        })
      }
      setInterval(checkForUpdate, UPDATE_INTERVAL_MS)
      // Reopening the home-screen app is its main lifecycle event — check then.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })
    },
    onRegisterError(err) {
      // No SW means no offline shell and no asset cache — worth knowing about.
      reportError(err, { where: 'pwa: register' })
    },
  })
}
