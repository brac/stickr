// Full-screen confetti for the redemption moment — the emotional peak of the
// whole app. canvas-confetti is imported lazily so its ~7KB stays out of the
// initial bundle and only loads the first time a reward is claimed.

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

// A layered burst: a few cannons with different spreads/velocities read as a
// richer celebration than a single shot. Tuned from canvas-confetti's "realistic
// look" recipe.
export async function celebrateRedemption(): Promise<void> {
  if (prefersReducedMotion()) return
  try {
    const { default: confetti } = await import('canvas-confetti')
    type Opts = NonNullable<Parameters<typeof confetti>[0]>
    const fire = (particleRatio: number, opts: Opts) =>
      confetti({
        origin: { y: 0.7 },
        particleCount: Math.floor(200 * particleRatio),
        disableForReducedMotion: true,
        ...opts,
      })
    fire(0.25, { spread: 26, startVelocity: 55 })
    fire(0.2, { spread: 60 })
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.9 })
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 })
    fire(0.1, { spread: 120, startVelocity: 45 })
  } catch {
    // Confetti is non-essential — never let a load/runtime hiccup surface.
  }
}
