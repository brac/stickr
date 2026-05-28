import {
  combinePresetAndAppleSplashScreens,
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config'

// icon.svg is already a finished, full-bleed icon, so every generated variant
// should fill the canvas (padding 0) rather than the minimal-2023 defaults
// (which pad maskable/apple by 30% on a white field — that leaves a white
// border and breaks the maskable safe-zone fill). The green background only
// shows if the square source ever fails to cover, and it matches the theme.
const fullBleed = {
  padding: 0,
  resizeOptions: { fit: 'contain', background: '#1f7a5a' },
} as const

// Splash screens: center the logo on the same green field. icon.svg's flat
// background blends seamlessly so only the disc + star read as the splash.
const splashOptions = {
  padding: 0.3,
  resizeOptions: { background: '#1f7a5a', fit: 'contain' },
  linkMediaOptions: { log: true, addMediaScreen: true, basePath: '/', xhtml: false },
  // We only generate light splashes. The default name adds a "light-" token to
  // the injected <link> but omits it from the generated file (it keys off
  // whether `dark` is a boolean), which 404s on iOS. Pin a token-free name so
  // links and files always match.
  name: (landscape: boolean, size: { width: number; height: number }) =>
    `apple-splash-${landscape ? 'landscape' : 'portrait'}-${size.width}x${size.height}.png`,
} as const

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: combinePresetAndAppleSplashScreens(
    {
      transparent: { ...minimal2023Preset.transparent, ...fullBleed },
      maskable: { ...minimal2023Preset.maskable, ...fullBleed },
      apple: { ...minimal2023Preset.apple, ...fullBleed },
    },
    splashOptions,
    [
      'iPhone 16 Pro Max',
      'iPhone 16 Pro',
      'iPhone 16',
      'iPhone 15 Pro Max',
      'iPhone 15 Pro',
      'iPhone 15',
      'iPhone 14 Pro Max',
      'iPhone 14',
      'iPhone 13',
      'iPhone SE 4.7"',
      'iPad Pro 11"',
      'iPad Air 10.9"',
    ],
  ),
  images: ['public/icon.svg'],
})
