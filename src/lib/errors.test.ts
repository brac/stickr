import { describe, it, expect } from 'vitest'
import { getErrorMessage, getPostgresErrorCode } from './errors'

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

describe('getPostgresErrorCode', () => {
  it('reads the code off a Supabase/PostgREST error shape', () => {
    expect(getPostgresErrorCode({ message: 'dup', code: '23505' })).toBe('23505')
    expect(getPostgresErrorCode({ code: 'P0001' })).toBe('P0001')
  })

  it('returns undefined when code is missing or not a string', () => {
    expect(getPostgresErrorCode({ message: 'no code' })).toBeUndefined()
    expect(getPostgresErrorCode({ code: 23505 })).toBeUndefined()
    expect(getPostgresErrorCode(new Error('boom'))).toBeUndefined()
    expect(getPostgresErrorCode(null)).toBeUndefined()
    expect(getPostgresErrorCode('nope')).toBeUndefined()
  })
})
