import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Guards the production Content-Security-Policy (vercel.json) against silently
// breaking the in-browser background-removal pipeline.
//
// Regression history (the reason this test exists): the CSP's `connect-src`
// once listed staticimgly.com but omitted `blob:`. @imgly downloads the ONNX
// Runtime wasm/model from staticimgly, wraps each in a `blob:` URL, and ORT then
// `fetch()`es that blob: URL to instantiate its backend — and fetch() is a
// connect-src request. With blob: missing, the wasm fetch was CSP-blocked and
// background removal failed with "no available backend … NetworkError when
// attempting to fetch resource", silently falling back to the un-cut photo.
//
// These assertions fail loudly if a future CSP edit drops a directive the
// pipeline (or core app connectivity) depends on. Header strings are matched
// the same way a browser tokenises them.

interface VercelHeader {
  key: string
  value: string
}
interface VercelHeaderRule {
  source: string
  headers: VercelHeader[]
}
interface VercelConfig {
  headers: VercelHeaderRule[]
}

const config: VercelConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
)

function contentSecurityPolicy(source: string): string {
  const rule = config.headers.find((h) => h.source === source)
  const header = rule?.headers.find((h) => h.key === 'Content-Security-Policy')
  if (!header) {
    throw new Error(`No Content-Security-Policy header for source "${source}"`)
  }
  return header.value
}

// Return the source list (the tokens after the directive name) for a directive,
// matching how a browser splits the policy on `;` then whitespace.
function sources(csp: string, directive: string): string[] {
  const segment = csp
    .split(';')
    .map((s) => s.trim())
    .find((s) => s === directive || s.startsWith(`${directive} `))
  if (!segment) {
    throw new Error(`CSP is missing the "${directive}" directive`)
  }
  return segment.split(/\s+/).slice(1)
}

describe('production CSP (vercel.json)', () => {
  const csp = contentSecurityPolicy('/(.*)')

  it('lets ONNX Runtime fetch its blob-wrapped wasm/model (connect-src)', () => {
    const connect = sources(csp, 'connect-src')
    // blob: is THE token whose absence broke background removal — ORT fetches
    // the blob: URL @imgly creates for the wasm.
    expect(connect).toContain('blob:')
    // @imgly's default publicPath (model + wasm download).
    expect(connect).toContain('https://staticimgly.com')
    // Supabase REST/Storage + Realtime — core app connectivity.
    expect(connect).toContain('https://*.supabase.co')
    expect(connect).toContain('wss://*.supabase.co')
  })

  it('lets the ORT wasm runtime load and instantiate (script-src)', () => {
    const script = sources(csp, 'script-src')
    expect(script).toContain('blob:') // dynamic import() of the blob .mjs loader
    expect(script).toContain("'wasm-unsafe-eval'") // WebAssembly.instantiate
    expect(script).toContain("'unsafe-eval'") // ORT instantiates via new Function
  })

  it('allows the background-removal worker (worker-src)', () => {
    expect(sources(csp, 'worker-src')).toContain('blob:')
  })

  it('still allows blob: image previews (img-src)', () => {
    // Object-URL previews of generated stickers/avatars render via <img src=blob:>.
    expect(sources(csp, 'img-src')).toContain('blob:')
  })
})

describe('Permissions-Policy (vercel.json)', () => {
  function permissionsPolicy(source: string): string {
    const rule = config.headers.find((h) => h.source === source)
    const header = rule?.headers.find((h) => h.key === 'Permissions-Policy')
    if (!header) {
      throw new Error(`No Permissions-Policy header for source "${source}"`)
    }
    return header.value
  }

  const policy = permissionsPolicy('/(.*)')

  it('lets the desktop "Take photo" webcam use getUserMedia (camera=self)', () => {
    // camera=() (empty allowlist) disables the camera everywhere — including our
    // own origin — which silently breaks the WebcamCapture component. Keep self.
    expect(policy).toMatch(/camera=\(self\)/)
  })

  it('keeps microphone and geolocation disabled', () => {
    expect(policy).toMatch(/microphone=\(\)/)
    expect(policy).toMatch(/geolocation=\(\)/)
  })
})
