import { createContext } from 'react'

export type ToastVariant = 'error' | 'success' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  variant?: ToastVariant
  // Auto-dismiss delay in ms. 0 keeps the toast until dismissed manually.
  duration?: number
  action?: ToastAction
}

type VariantOptions = Omit<ToastOptions, 'variant'>

export interface ToastContextValue {
  show: (message: string, options?: ToastOptions) => string
  error: (message: string, options?: VariantOptions) => string
  success: (message: string, options?: VariantOptions) => string
  info: (message: string, options?: VariantOptions) => string
  dismiss: (id: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
