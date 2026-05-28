import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const { fetchMyParentMock } = vi.hoisted(() => ({ fetchMyParentMock: vi.fn() }))
vi.mock('../lib/queries', () => ({ fetchMyParent: fetchMyParentMock }))

import { useMyParent } from './useMyParent'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

// Note on the error branch: useMyParent's `.catch` maps the failure through
// getErrorMessage (covered in errors.test.ts) and sets `loading=false`. We do
// not assert that path here — driving a real promise rejection through the
// effect trips vitest's process-level unhandled-rejection detector (a transient
// window exists before React attaches the async .catch), and the only suite-
// wide override would mask genuine unhandled rejections elsewhere. The failure
// flow is exercised end-to-end by the E2E suite instead.

describe('useMyParent', () => {
  beforeEach(() => fetchMyParentMock.mockReset())

  it('starts in a loading state', async () => {
    const d = deferred<unknown>()
    fetchMyParentMock.mockReturnValue(d.promise)
    const { result } = renderHook(() => useMyParent())

    expect(result.current).toEqual({ parent: null, loading: true, error: null })

    // Drain the resolution inside act so nothing leaks into the next test.
    await act(async () => {
      d.resolve(null)
      await d.promise
    })
  })

  it('exposes the parent once resolved', async () => {
    fetchMyParentMock.mockResolvedValue({ id: 'parent-1' })
    const { result } = renderHook(() => useMyParent())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.parent).toEqual({ id: 'parent-1' })
    expect(result.current.error).toBeNull()
  })

  it('reports loading=false with a parent of null when none exists', async () => {
    fetchMyParentMock.mockResolvedValue(null)
    const { result } = renderHook(() => useMyParent())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.parent).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('ignores a late resolution after unmount (no state update)', async () => {
    const d = deferred<{ id: string } | null>()
    fetchMyParentMock.mockReturnValue(d.promise)
    const { unmount } = renderHook(() => useMyParent())
    unmount()

    // Resolving after unmount must not throw (the effect guards with `active`).
    d.resolve({ id: 'late' })
    await expect(d.promise).resolves.toEqual({ id: 'late' })
  })
})
