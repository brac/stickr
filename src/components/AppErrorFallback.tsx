interface AppErrorFallbackProps {
  onReload: () => void
}

// Replaces the white-screen crash when an unhandled render error escapes a page.
// Distinct from BoardLoadError (a retryable data-fetch state): this is a last
// resort, so the only action is a full reload. Matches the surface/ink tokens
// and stays reduced-motion-safe (transforms only, short durations).
export function AppErrorFallback({ onReload }: AppErrorFallbackProps) {
  return (
    <div className="flex min-h-full items-center justify-center px-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-3xl"
        >
          🩹
        </span>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-ink">
            Something broke
          </h1>
          <p className="text-sm text-ink-muted">
            The app hit an unexpected error. Reloading usually fixes it — your
            stickers are safe.
          </p>
        </div>
        <button
          type="button"
          onClick={onReload}
          className="rounded-[var(--radius-card)] bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-[transform,filter] duration-100 ease-out active:scale-[0.96] active:brightness-90"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
