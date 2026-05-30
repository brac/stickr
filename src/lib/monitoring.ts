import * as Sentry from '@sentry/react'

// Error tracking (Item 2). Reporting is ADDITIVE: the toast path
// (getErrorMessage / useToast) stays the user-facing surface. This module only
// ships crashes to a dashboard with release + breadcrumbs, scrubbed of PII.
//
// No-ops cleanly in dev and when the DSN is unset, so importing/calling these
// is always safe regardless of environment.

let initialized = false

// Kid/household names to redact, populated after the board data loads (they are
// not available at init time, which runs before React mounts). The beforeSend
// closure reads this live, so names registered later still scrub. Reassigned
// (not mutated) to honour the project's immutability rule.
let knownNames: readonly string[] = []

/**
 * Supply the current kid/household names to the PII scrubber. Call after a
 * successful board load. Replaces the previous set rather than appending.
 */
export function registerScrubNames(names: readonly string[]): void {
  knownNames = names.filter((name) => name.trim().length >= 2)
}

// Sampling for performance traces. Kept low: we want crash reports, not a
// full performance product (out of scope), but a non-zero rate gives a little
// transaction context around errors.
const TRACES_SAMPLE_RATE = 0.05

// A conservative email matcher. Deliberately broad so that any address embedded
// in a message or breadcrumb (toast strings can interpolate them) is redacted.
const EMAIL_RE =
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

const REDACTED_EMAIL = '[email]'
const REDACTED_NAME = '[name]'

/**
 * Strip household-identifying PII from a single string: emails always, plus any
 * kid/household names supplied by the caller. Pure and exported so the scrubbing
 * contract is unit-testable without a live Sentry client.
 */
export function scrubString(
  value: string,
  names: readonly string[] = [],
): string {
  let out = value.replace(EMAIL_RE, REDACTED_EMAIL)
  for (const name of names) {
    const trimmed = name.trim()
    // Skip empty/very short names — a one-character "name" would shred ordinary
    // words. Conservative-but-effective for the household-name/kid-name case.
    if (trimmed.length < 2) continue
    out = out.split(trimmed).join(REDACTED_NAME)
  }
  return out
}

/**
 * Sentry `beforeSend` scrubber. Strips emails (and any known names) from the
 * event message, every breadcrumb message, and every exception value before the
 * event leaves the browser. Exported as a pure function so the redaction is
 * directly testable.
 *
 * captureException (the only reporting path this module uses) serialises
 * Error.message into exception.values[].value — a field distinct from
 * event.message — so that path must be scrubbed too, or raw error text (which
 * can embed Supabase constraint/column values or emails) ships unredacted.
 *
 * @param event - the outbound Sentry event
 * @param names - kid/household names to redact (defaults to the registered set)
 */
export function scrubEvent<T extends Sentry.ErrorEvent>(
  event: T,
  names: readonly string[] = knownNames,
): T {
  const next: T = { ...event }

  if (typeof next.message === 'string') {
    next.message = scrubString(next.message, names)
  }

  if (next.breadcrumbs) {
    next.breadcrumbs = next.breadcrumbs.map((crumb) =>
      typeof crumb.message === 'string'
        ? { ...crumb, message: scrubString(crumb.message, names) }
        : crumb,
    )
  }

  if (next.exception?.values) {
    next.exception = {
      ...next.exception,
      values: next.exception.values.map((ex) =>
        typeof ex.value === 'string'
          ? { ...ex, value: scrubString(ex.value, names) }
          : ex,
      ),
    }
  }

  return next
}

/**
 * Initialise error tracking. No-op unless running a production build with a DSN
 * configured. Safe to call exactly once at startup.
 */
export function initMonitoring(): void {
  if (initialized) return

  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!import.meta.env.PROD || !dsn) {
    return
  }

  // Release is optional: omit it gracefully rather than reporting a bogus value.
  const release = import.meta.env.VITE_APP_RELEASE

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    ...(release ? { release } : {}),
    tracesSampleRate: TRACES_SAMPLE_RATE,
    sendDefaultPii: false,
    // Read the registered names live: init runs before any data loads, so names
    // arrive later via registerScrubNames and must be picked up per-event.
    beforeSend: (event) => scrubEvent(event, knownNames),
  })

  initialized = true
}

/**
 * Report a caught error to the dashboard. Thin wrapper over captureException
 * that no-ops when monitoring is uninitialised (dev, or DSN unset), so central
 * catch sites can call it unconditionally.
 */
export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (!initialized) return
  Sentry.captureException(error, context ? { extra: context } : undefined)
}
