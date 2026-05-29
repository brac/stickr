import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      // Generate the icon set + iOS splash screens from pwa-assets.config.ts,
      // inject the <link> tags, and overwrite the manifest icons below.
      pwaAssets: {
        config: true,
        overrideManifestIcons: true,
      },
      workbox: {
        // The background-removal model ships a ~24MB ONNX Runtime WASM as a
        // lazy chunk. Keep it out of the precache (the browser HTTP-caches it on
        // first use); precaching it would bloat the install for a rarely-used
        // path.
        globIgnores: ['**/ort-*.wasm', '**/*.onnx'],
        // Pull our push/notification-click handlers into the generated SW. The
        // file lives in public/ so it's served from the origin root. Keeping the
        // autoUpdate generateSW strategy avoids hand-maintaining the precache.
        importScripts: ['/push-sw.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-images',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
      manifest: {
        name: 'Stickr',
        short_name: 'Stickr',
        description: 'Household sticker reward board',
        theme_color: '#1f7a5a',
        background_color: '#1f7a5a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        // icons are generated and injected by pwaAssets (overrideManifestIcons).
      },
    }),
  ],
})
