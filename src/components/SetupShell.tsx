import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface SetupShellProps {
  title: string
  backTo?: string
  children: ReactNode
}

// Shared chrome for the setup screens: a back link + title, tool-like layout.
export function SetupShell({ title, backTo = '/', children }: SetupShellProps) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-16 sm:px-6">
      <header className="flex items-center gap-3 py-4">
        <Link
          to={backTo}
          aria-label="Back"
          className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-black/5"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M12 4l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
      </header>
      {children}
    </div>
  )
}
