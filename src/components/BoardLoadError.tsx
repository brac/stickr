interface BoardLoadErrorProps {
  onRetry: () => void
}

// Shown when a *critical* board fetch (household or kids) fails. Distinct from a
// transient toast: without these there is no board to render, so the parent gets
// a real, retryable state instead of a blank screen. Retrying swaps this view for
// the full-screen spinner, so there is no in-flight state to render here.
export function BoardLoadError({ onRetry }: BoardLoadErrorProps) {
  return (
    <div className="flex min-h-full items-center justify-center px-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-3xl"
        >
          📡
        </span>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-ink">
            Couldn’t load the board
          </h1>
          <p className="text-sm text-ink-muted">
            Something went wrong reaching the household. Check your connection
            and try again.
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-[var(--radius-card)] bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-[transform,filter] duration-100 ease-out active:scale-[0.96] active:brightness-90"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
