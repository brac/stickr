// Light tactile feedback for the board's key moments. Purely additive polish:
// every call is a no-op where the Vibration API is unavailable (desktop, and
// iOS Safari, which does not implement navigator.vibrate).
//
// Patterns are intentionally short — awarding is the hot path and fires often,
// so a crisp tick reads better than a heavy buzz.

const AWARD_PATTERN = 18
const UNDO_PATTERN = 10
// A longer, building celebration for the redemption peak — the emotional high
// point of the app, so it earns a bigger buzz than the award tick.
const REDEEM_PATTERN = [0, 30, 40, 30, 40, 60]

function buzz(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return
  }
  try {
    navigator.vibrate(pattern)
  } catch {
    // Some browsers throw if called outside a user gesture — ignore.
  }
}

export function vibrateAward(): void {
  buzz(AWARD_PATTERN)
}

export function vibrateUndo(): void {
  buzz(UNDO_PATTERN)
}

export function vibrateRedeem(): void {
  buzz(REDEEM_PATTERN)
}
