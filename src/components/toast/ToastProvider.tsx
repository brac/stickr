import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ToastContext,
  type ToastAction,
  type ToastContextValue,
  type ToastOptions,
  type ToastVariant,
} from './toast-context'

interface Toast {
  id: string
  message: string
  variant: ToastVariant
  action?: ToastAction
}

const DEFAULT_DURATION = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (message: string, options?: ToastOptions): string => {
      const id = crypto.randomUUID()
      const variant = options?.variant ?? 'info'
      const duration = options?.duration ?? DEFAULT_DURATION
      setToasts((prev) => [
        ...prev,
        { id, message, variant, action: options?.action },
      ])
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      }
      return id
    },
    [dismiss],
  )

  // Clear any pending timers on unmount.
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      error: (message, options) => show(message, { ...options, variant: 'error' }),
      success: (message, options) =>
        show(message, { ...options, variant: 'success' }),
      info: (message, options) => show(message, { ...options, variant: 'info' }),
      dismiss,
    }),
    [show, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

interface ToastViewportProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

const ACCENT_BY_VARIANT: Record<ToastVariant, string> = {
  error: 'bg-red-500',
  success: 'bg-accent',
  info: 'bg-ink-muted',
}

interface ToastItemProps {
  toast: Toast
  onDismiss: (id: string) => void
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      className="toast-item pointer-events-auto flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl border border-black/10 bg-surface-raised py-3 pr-3 pl-0 shadow-lg"
    >
      <span
        aria-hidden="true"
        className={`h-auto w-1 self-stretch rounded-full ${ACCENT_BY_VARIANT[toast.variant]}`}
      />
      <p className="flex-1 py-0.5 text-sm text-ink">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick()
            onDismiss(toast.id)
          }}
          className="shrink-0 rounded-md px-2 py-0.5 text-sm font-semibold text-accent transition-colors hover:bg-accent/10"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded-md px-1.5 py-0.5 text-ink-muted transition-colors hover:bg-black/5"
      >
        ×
      </button>
    </div>
  )
}
