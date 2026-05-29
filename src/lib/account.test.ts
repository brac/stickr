import { describe, it, expect, beforeEach, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('./supabase', () => ({
  supabase: { functions: { invoke: invokeMock } },
}))

import { deleteAccount } from './account'

describe('deleteAccount', () => {
  beforeEach(() => {
    invokeMock.mockReset()
  })

  it('invokes the delete-account function with POST', async () => {
    invokeMock.mockResolvedValue({
      data: { outcome: 'self_removed' },
      error: null,
    })

    await deleteAccount()

    expect(invokeMock).toHaveBeenCalledWith('delete-account', { method: 'POST' })
  })

  it('returns "household_deleted" when the sole-parent teardown ran', async () => {
    invokeMock.mockResolvedValue({
      data: { outcome: 'household_deleted' },
      error: null,
    })

    await expect(deleteAccount()).resolves.toBe('household_deleted')
  })

  it('returns "self_removed" when a co-parent left the household', async () => {
    invokeMock.mockResolvedValue({
      data: { outcome: 'self_removed' },
      error: null,
    })

    await expect(deleteAccount()).resolves.toBe('self_removed')
  })

  it('throws the transport error message when invoke fails', async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: new Error('Edge Function returned a non-2xx status code'),
    })

    await expect(deleteAccount()).rejects.toThrow(
      'Edge Function returned a non-2xx status code',
    )
  })

  it('surfaces an error returned in the function body', async () => {
    invokeMock.mockResolvedValue({
      data: { error: 'Not authenticated' },
      error: null,
    })

    await expect(deleteAccount()).rejects.toThrow('Not authenticated')
  })

  it('throws a clear message when the response has no outcome', async () => {
    invokeMock.mockResolvedValue({ data: {}, error: null })

    await expect(deleteAccount()).rejects.toThrow(
      'Account deletion did not complete. Please try again.',
    )
  })
})
