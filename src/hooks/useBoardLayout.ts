import { useCallback, useEffect, useState } from 'react'
import { layoutFor, type BoardLayout } from '../lib/stickerPlacement'

interface UseBoardLayoutResult {
  ref: (el: HTMLElement | null) => void
  layout: BoardLayout
}

// State-backed callback ref so the observer attaches when the element first
// appears in the DOM (e.g., after a conditional render flips from a loading
// spinner). A plain useRef + useEffect([ref]) misses that transition because
// the ref object's identity never changes.
export function useBoardLayout(): UseBoardLayoutResult {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [width, setWidth] = useState(0)

  const ref = useCallback((next: HTMLElement | null) => setEl(next), [])

  useEffect(() => {
    if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width
      if (typeof next === 'number') {
        setWidth(next)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])

  return { ref, layout: layoutFor(width) }
}
