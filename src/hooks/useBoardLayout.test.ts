import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBoardLayout } from './useBoardLayout'
import { layoutFor } from '../lib/stickerPlacement'

// jsdom has no ResizeObserver; capture instances so we can drive resize events.
interface Observed {
  cb: ResizeObserverCallback
  el: Element | null
  disconnect: Mock<() => void>
}
const observers: Observed[] = []

class MockResizeObserver {
  private record: Observed
  constructor(cb: ResizeObserverCallback) {
    this.record = { cb, el: null, disconnect: vi.fn<() => void>() }
    observers.push(this.record)
  }
  observe(el: Element) {
    this.record.el = el
  }
  disconnect() {
    this.record.disconnect()
  }
}

function elementOfWidth(width: number): HTMLElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: width })
  return el
}

describe('useBoardLayout', () => {
  beforeEach(() => {
    observers.length = 0
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts at the minimum layout before an element is attached', () => {
    const { result } = renderHook(() => useBoardLayout())
    expect(result.current.layout).toEqual(layoutFor(0))
  })

  it('measures clientWidth synchronously when the ref attaches', () => {
    const { result } = renderHook(() => useBoardLayout())
    act(() => result.current.ref(elementOfWidth(800)))
    expect(result.current.layout).toEqual(layoutFor(800))
    expect(result.current.layout.rowSize).toBeGreaterThan(layoutFor(0).rowSize)
  })

  it('reflows when the ResizeObserver reports a new width', () => {
    const { result } = renderHook(() => useBoardLayout())
    act(() => result.current.ref(elementOfWidth(800)))

    act(() => {
      const observer = observers[observers.length - 1]
      observer.cb(
        [{ contentRect: { width: 1280 } } as ResizeObserverEntry],
        observer as unknown as ResizeObserver,
      )
    })
    expect(result.current.layout).toEqual(layoutFor(1280))
  })

  it('disconnects the observer on unmount', () => {
    const { result, unmount } = renderHook(() => useBoardLayout())
    act(() => result.current.ref(elementOfWidth(800)))
    const observer = observers[observers.length - 1]
    unmount()
    expect(observer.disconnect).toHaveBeenCalled()
  })
})
