export function FullScreenSpinner() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-black/15 border-t-accent"
        role="status"
        aria-label="Loading"
      />
    </div>
  )
}
