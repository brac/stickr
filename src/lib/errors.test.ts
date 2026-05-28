import { describe, it, expect } from 'vitest'
import { getErrorMessage } from './errors'

describe('getErrorMessage', () => {
  it('returns the message of an Error instance', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom')
  })

  it('reads a string message off a plain error-shaped object (e.g. a Supabase error)', () => {
    expect(getErrorMessage({ message: 'row not found', code: 'PGRST116' })).toBe(
      'row not found',
    )
  })

  it('falls back when message is present but not a string', () => {
    expect(getErrorMessage({ message: 42 })).toBe(
      'Something went wrong. Please try again.',
    )
  })

  it('falls back for primitives and null', () => {
    expect(getErrorMessage('just a string')).toBe(
      'Something went wrong. Please try again.',
    )
    expect(getErrorMessage(null)).toBe('Something went wrong. Please try again.')
    expect(getErrorMessage(undefined)).toBe(
      'Something went wrong. Please try again.',
    )
  })
})
