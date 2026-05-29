import { registerSW } from 'virtual:pwa-register'

// The PWA uses registerType: 'autoUpdate' (see vite.config.ts), but the default
// registration only checks for a new service worker on a real page load. A PWA
// pinned to the home screen usually *resumes* warm instead of navigating, so it
// can keep running a stale SW until a cold start or the browser's ~24h
// background check. Polling here, plus a check when the app returns to the
// foreground, closes that gap — autoUpdate activates + reloads automatically
// once update() finds a new SW.
const UPDATE_INTERVAL_MS = 60 * 60 * 1000 // hourly

const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    setInterval(() => void registration.update(), UPDATE_INTERVAL_MS)
    // Reopening the home-screen app is its main lifecycle event — check then.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update()
    })
  },
})

void updateSW
