/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // VAPID public key for Web Push. Absent until push notifications are wired up
  // (Feature 9, phase 2); the opt-in UI degrades gracefully when unset.
  readonly VITE_VAPID_PUBLIC_KEY?: string
  // Sentry DSN for error tracking (Item 2). The DSN is public — safe to ship.
  // Absent in dev / when unset; monitoring no-ops without it.
  readonly VITE_SENTRY_DSN?: string
  // Optional release identifier (e.g. a git SHA) tagged on Sentry events.
  readonly VITE_APP_RELEASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
