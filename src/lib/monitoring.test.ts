import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the Sentry client: these tests pin the wiring contract (init guards,
// captureException forwarding) and the PII scrubbing, with no real network.
const initSpy = vi.fn()
const captureExceptionSpy = vi.fn()
vi.mock('@sentry/react', () => ({
  init: (...args: unknown[]) => initSpy(...args),
  captureException: (...args: unknown[]) => captureExceptionSpy(...args),
  ErrorBoundary: () => null,
}))

import {
  initMonitoring,
  registerScrubNames,
  reportError,
  scrubString,
  scrubEvent,
} from './monitoring'
import type { ErrorEvent } from '@sentry/react'

describe('scrubString', () => {
  it('redacts an email address', () => {
    expect(scrubString('failed for parent@example.com while saving')).toBe(
      'failed for [email] while saving',
    )
  })

  it('redacts every email in a string', () => {
    expect(scrubString('a@b.com and c.d@e.co.uk')).toBe('[email] and [email]')
  })

  it('redacts supplied kid/household names', () => {
    expect(
      scrubString('Awarded a sticker to Matilda on The Smiths board', [
        'Matilda',
        'The Smiths',
      ]),
    ).toBe('Awarded a sticker to [name] on [name] board')
  })

  it('ignores names shorter than two characters', () => {
    expect(scrubString('a stack of pancakes', ['a'])).toBe('a stack of pancakes')
  })

  it('leaves a clean string untouched', () => {
    expect(scrubString('Some of the board didn’t load.')).toBe(
      'Some of the board didn’t load.',
    )
  })
})

describe('scrubEvent', () => {
  it('scrubs the event message and breadcrumb messages of email + names', () => {
    const event = {
      message: 'crash while emailing parent@example.com',
      breadcrumbs: [
        { message: 'Tapped award for Matilda' },
        { message: 'no pii here' },
        {}, // a breadcrumb with no message must survive untouched
      ],
    } as unknown as ErrorEvent

    const scrubbed = scrubEvent(event, ['Matilda'])

    expect(scrubbed.message).toBe('crash while emailing [email]')
    expect(scrubbed.breadcrumbs?.[0]?.message).toBe('Tapped award for [name]')
    expect(scrubbed.breadcrumbs?.[1]?.message).toBe('no pii here')
    expect(scrubbed.breadcrumbs?.[2]?.message).toBeUndefined()
  })

  it('scrubs email + names from exception.values[].value (captureException path)', () => {
    // captureException puts Error.message here, NOT in event.message.
    const event = {
      exception: {
        values: [
          { type: 'Error', value: 'failed for parent@example.com kid Matilda' },
          { type: 'Error' }, // a value-less entry must survive untouched
        ],
      },
    } as unknown as ErrorEvent

    const scrubbed = scrubEvent(event, ['Matilda'])

    expect(scrubbed.exception?.values?.[0]?.value).toBe(
      'failed for [email] kid [name]',
    )
    expect(scrubbed.exception?.values?.[1]?.value).toBeUndefined()
  })

  it('uses the registered names by default (production beforeSend path)', () => {
    // Production wires beforeSend as scrubEvent(event, knownNames); this asserts
    // names registered at runtime are applied without an explicit argument.
    registerScrubNames(['Matilda'])
    try {
      const event = {
        breadcrumbs: [{ message: 'Tapped award for Matilda' }],
        exception: { values: [{ value: 'crash near Matilda' }] },
      } as unknown as ErrorEvent

      const scrubbed = scrubEvent(event)

      expect(scrubbed.breadcrumbs?.[0]?.message).toBe('Tapped award for [name]')
      expect(scrubbed.exception?.values?.[0]?.value).toBe('crash near [name]')
    } finally {
      registerScrubNames([])
    }
  })

  it('does not mutate the original event (immutable)', () => {
    const event = {
      message: 'parent@example.com',
      breadcrumbs: [{ message: 'parent@example.com' }],
      exception: { values: [{ value: 'parent@example.com' }] },
    } as unknown as ErrorEvent

    scrubEvent(event)

    expect(event.message).toBe('parent@example.com')
    expect(event.breadcrumbs?.[0]?.message).toBe('parent@example.com')
    expect(event.exception?.values?.[0]?.value).toBe('parent@example.com')
  })
})

describe('initMonitoring', () => {
  beforeEach(() => {
    initSpy.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('no-ops when the DSN is unset (the test build has none)', () => {
    initMonitoring()
    expect(initSpy).not.toHaveBeenCalled()
  })

  it('no-ops in a non-production build even if a DSN is present', () => {
    vi.stubEnv('PROD', false)
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@o1.ingest.sentry.io/123')
    initMonitoring()
    expect(initSpy).not.toHaveBeenCalled()
  })
})

describe('reportError', () => {
  beforeEach(() => {
    captureExceptionSpy.mockClear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('no-ops when monitoring was never initialised', () => {
    // initMonitoring no-ops under the test env, so the module stays uninitialised.
    reportError(new Error('boom'))
    expect(captureExceptionSpy).not.toHaveBeenCalled()
  })

  it('forwards to captureException once monitoring is initialised', () => {
    // Force the prod + DSN path so initMonitoring actually wires Sentry. This is
    // ordered last because initialisation is a module-level latch (idempotent).
    vi.stubEnv('PROD', true)
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@o1.ingest.sentry.io/123')
    initMonitoring()

    const err = new Error('boom')
    reportError(err, { where: 'unit-test' })

    expect(captureExceptionSpy).toHaveBeenCalledWith(err, {
      extra: { where: 'unit-test' },
    })
  })
})
