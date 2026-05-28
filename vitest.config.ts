import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Dedicated test config — deliberately omits the PWA/Tailwind plugins from
// vite.config.ts so the unit suite doesn't pay service-worker/CSS build cost.
// jsdom gives the lib tests a DOM (localStorage, navigator, matchMedia).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Dummy credentials so importing src/lib/supabase.ts (which throws on
    // missing env) doesn't break modules that transitively import the client.
    // No network call is ever made in the unit suite.
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/hooks/**/*.ts'],
      exclude: ['src/lib/database.types.ts', 'src/lib/supabase.ts'],
    },
  },
})
