import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import './index.css'
import './pwa.ts'
import App from './App.tsx'
import { ToastProvider } from './components/toast/ToastProvider'
import { AppErrorFallback } from './components/AppErrorFallback'
import { initMonitoring } from './lib/monitoring'

// Initialise error tracking before anything renders so a crash during the
// initial mount is still captured. No-ops in dev / when the DSN is unset.
initMonitoring()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <Sentry.ErrorBoundary
          fallback={() => (
            <AppErrorFallback onReload={() => window.location.reload()} />
          )}
        >
          <App />
        </Sentry.ErrorBoundary>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
