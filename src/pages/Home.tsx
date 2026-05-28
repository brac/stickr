export function Home() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center px-6 text-center">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-black/5 bg-surface-raised px-8 py-12 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-ink-muted">
          Household
        </p>
        <h1 className="mt-2 text-5xl font-semibold tracking-tight text-ink">
          Stickr
        </h1>
        <p className="mt-4 text-balance text-ink-muted">
          The board is being set up. Sign-in and stickers arrive next.
        </p>
      </div>
    </main>
  )
}
