import { useEffect, useRef, useState } from 'react'

interface BoardMenuProps {
  onSetup: () => void
  onHistory: () => void
  onUndoLast: () => void
  onResetBoard: () => void
  onSignOut: () => void
  undoDisabled: boolean
}

// Discreet admin menu: present but not prominent. Holds setup, correction
// actions (undo a mis-tap, reset the board), and sign out.
export function BoardMenu({
  onSetup,
  onHistory,
  onUndoLast,
  onResetBoard,
  onSignOut,
  undoDisabled,
}: BoardMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function runAndClose(action: () => void) {
    setOpen(false)
    action()
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Board options"
        onClick={() => setOpen((value) => !value)}
        className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-black/5"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="currentColor">
          <circle cx="10" cy="4" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="10" cy="16" r="1.6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 w-52 overflow-hidden rounded-xl border border-black/10 bg-surface-raised py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(onSetup)}
            className="block w-full px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-black/5"
          >
            Chores &amp; stickers
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(onHistory)}
            className="block w-full px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-black/5"
          >
            History
          </button>
          <div className="my-1 border-t border-black/5" />
          <button
            type="button"
            role="menuitem"
            disabled={undoDisabled}
            onClick={() => runAndClose(onUndoLast)}
            className="block w-full px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Undo last sticker
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(onResetBoard)}
            className="block w-full px-4 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
          >
            Reset board…
          </button>
          <div className="my-1 border-t border-black/5" />
          <button
            type="button"
            role="menuitem"
            onClick={() => runAndClose(onSignOut)}
            className="block w-full px-4 py-2.5 text-left text-sm text-ink-muted transition-colors hover:bg-black/5"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
