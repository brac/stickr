import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AuthProvider } from './AuthProvider'
import { AuthContext } from './auth-context'

type AuthChangeCallback = (event: string, session: Session | null) => void

const listeners: AuthChangeCallback[] = []
const unsubscribe = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: AuthChangeCallback) => {
        listeners.push(cb)
        return { data: { subscription: { unsubscribe } } }
      },
      signOut: vi.fn(),
    },
  },
}))

function Probe() {
  const ctx = useContext(AuthContext)
  if (!ctx) return null
  return (
    <div data-testid="probe">
      {ctx.loading ? 'loading' : (ctx.session ? 'signed-in' : 'signed-out')}
    </div>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    listeners.length = 0
    unsubscribe.mockClear()
  })

  it('stays loading until the first auth event arrives', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(screen.getByTestId('probe').textContent).toBe('loading')
  })

  it('resolves loading on INITIAL_SESSION even with a null session', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    act(() => {
      listeners.forEach((cb) => cb('INITIAL_SESSION', null))
    })
    expect(screen.getByTestId('probe').textContent).toBe('signed-out')
  })

  it('reflects a restored session', () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    act(() => {
      listeners.forEach((cb) => cb('INITIAL_SESSION', { user: { id: 'u1' } } as Session))
    })
    expect(screen.getByTestId('probe').textContent).toBe('signed-in')

    // A later SIGNED_OUT is never clobbered by a stale restore (the old
    // getSession().then race) — there is no second writer anymore.
    act(() => {
      listeners.forEach((cb) => cb('SIGNED_OUT', null))
    })
    expect(screen.getByTestId('probe').textContent).toBe('signed-out')
  })

  it('unsubscribes on unmount', () => {
    const { unmount } = render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
