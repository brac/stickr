/* global self, clients */
// Push notification handlers, imported into the Workbox-generated service
// worker via workbox.importScripts (see vite.config.ts). Kept as a plain JS
// file in public/ so it ships untouched alongside the generated sw.js.
//
// The send-award-push Edge Function posts a JSON payload shaped like:
//   { title, body, url }
// Anything missing falls back to sensible defaults so a malformed push still
// shows *something* rather than throwing.

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    // Non-JSON payload — fall back to plain text in the body.
    payload = { body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Stickr'
  const options = {
    body: payload.body || 'A new sticker was awarded!',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    // Tapping focuses an existing tab or opens this path.
    data: { url: payload.url || '/' },
    // Collapse rapid awards into one notification slot rather than stacking.
    tag: payload.tag || 'stickr-award',
    renotify: true,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    (async () => {
      const windowClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      // Focus an already-open Stickr tab if there is one; otherwise open fresh.
      for (const client of windowClients) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(targetUrl)
            } catch {
              // Cross-origin or detached — ignore; the focus already happened.
            }
          }
          return
        }
      }
      if (clients.openWindow) {
        await clients.openWindow(targetUrl)
      }
    })(),
  )
})
