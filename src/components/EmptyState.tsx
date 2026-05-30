import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** A CTA is either an in-app navigation (`href`) or a click handler (`onClick`), never both. */
type EmptyStateAction =
  | { label: string; onClick: () => void; href?: never }
  | { label: string; href: string; onClick?: never }

interface EmptyStateProps {
  title: string
  body?: string
  /** Optional decorative element (e.g. a ghosted first-sticker outline). Rendered aria-hidden by callers. */
  illustration?: ReactNode
  action?: EmptyStateAction
  /**
   * `card` (default) wraps the content in a dashed surface — for in-flow list/grid zero states.
   * `plain` drops all chrome — for overlays like the board, where the surface is the corkboard.
   */
  tone?: 'card' | 'plain'
  /** Extra layout classes for placement (e.g. absolute positioning on the board). */
  className?: string
}

const ACTION_CLASSES =
  'mt-4 inline-flex items-center justify-center rounded-[var(--radius-card)] bg-accent ' +
  'px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ' +
  'motion-safe:active:scale-[0.98]'

const CARD_SURFACE =
  'rounded-[var(--radius-card)] border border-dashed border-black/15 bg-surface-raised px-6 py-10'

export function EmptyState({
  title,
  body,
  illustration,
  action,
  tone = 'card',
  className = '',
}: EmptyStateProps) {
  const surface = tone === 'card' ? CARD_SURFACE : ''
  const containerClass = ['flex flex-col items-center text-center', surface, className]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={containerClass}>
      {illustration && <div className="mb-4 text-ink-muted">{illustration}</div>}
      <p className="text-base font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-ink-muted">{body}</p>}
      {action &&
        (action.href !== undefined ? (
          <Link to={action.href} className={ACTION_CLASSES}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={ACTION_CLASSES}>
            {action.label}
          </button>
        ))}
    </div>
  )
}
