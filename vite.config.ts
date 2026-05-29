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
            // Buckets are private, so images load via signed URLs
            // (/object/sign/...?token=). Match those as well as any legacy
            // public URLs. A signed URL is minted once per load and reused, so
            // the same string is cacheable within its validity window.
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/(public|sign)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-images',
              expiration: {
                maxEntries: 100,
                // Keep at/under the 12h signed-URL TTL so a cache miss never
                // falls through to the network with an already-expired token.
                maxAgeSeconds: 60 * 60 * 12,
              },
              // Never store an auth failure (e.g. an expired/re-signed token
              // returning 4xx) in place of the image.
              cacheableResponse: { statuses: [0, 200] },
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
