// A brief full-screen light flash for the redemption peak — layered on top of
// the confetti in celebrate.ts to give the moment a little extra punch. It's
// pure decoration: non-essential, reduced-motion gated, and fire-and-forget so
// it never blocks the award/redeem hot path.

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

// A single fixed overlay that fades up to a soft white and back out, then
// removes itself. Only opacity animates (compositor-friendly). Uses the Web
// Animations API when present and falls back to a setTimeout removal under
// jsdom, where element.animate is undefined.
export function flashRedemption(): void {
  if (prefersReducedMotion()) return
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  try {
    const flash = document.createElement('div')
    flash.style.position = 'fixed'
    flash.style.inset = '0'
    flash.style.pointerEvents = 'none'
    flash.style.background = '#ffffff'
    flash.style.opacity = '0'
    flash.style.zIndex = '9999'
    document.body.appendChild(flash)

    const DURATION_MS = 420

    if (typeof flash.animate === 'function') {
      const anim = flash.animate(
        [{ opacity: 0 }, { opacity: 0.55 }, { opacity: 0 }],
        { duration: DURATION_MS, easing: 'ease-out' },
      )
      anim.onfinish = () => flash.remove()
      // Belt-and-suspenders: if onfinish never fires, still clean up.
      anim.oncancel = () => flash.remove()
    } else {
      setTimeout(() => flash.remove(), DURATION_MS)
    }
  } catch {
    // The flash is non-essential — never let a DOM/animation hiccup surface.
  }
}
