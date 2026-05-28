import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import {
  awardSticker,
  fetchActiveChores,
  fetchHousehold,
  fetchKid,
  fetchKidBalance,
  fetchMyParent,
} from '../lib/queries'
import { getErrorMessage } from '../lib/errors'
import type { Chore, Household, Kid, Parent } from '../lib/types'
import { FullScreenSpinner } from '../components/FullScreenSpinner'

export function Home() {
  const { signOut } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [parent, setParent] = useState<Parent | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  const [kid, setKid] = useState<Kid | null>(null)
  const [chores, setChores] = useState<Chore[]>([])
  const [balance, setBalance] = useState(0)
  const [awardingId, setAwardingId] = useState<string | null>(null)
  const [needsOnboarding, setNeedsOnboarding] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const myParent = await fetchMyParent()
        if (!active) return
        if (!myParent) {
          setNeedsOnboarding(true)
          return
        }
        setParent(myParent)
        const [hh, theKid, activeChores] = await Promise.all([
          fetchHousehold(myParent.household_id),
          fetchKid(myParent.household_id),
          fetchActiveChores(myParent.household_id),
        ])
        if (!active) return
        setHousehold(hh)
        setKid(theKid)
        setChores(activeChores)
        setBalance(theKid?.current_balance ?? 0)
      } catch (err) {
        if (active) setError(getErrorMessage(err))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  // Realtime: keep the count in sync with the partner's phone.
  const kidId = kid?.id
  useEffect(() => {
    if (!kidId) return
    const channel = supabase
      .channel(`kid-balance-${kidId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'kid', filter: `id=eq.${kidId}` },
        (payload) => {
          const next = payload.new as Kid
          setBalance(next.current_balance)
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [kidId])

  const handleAward = useCallback(
    async (chore: Chore) => {
      if (!kid || !parent || !kid.current_chapter_id) return
      setAwardingId(chore.id)
      setError(null)
      try {
        await awardSticker({
          kidId: kid.id,
          choreId: chore.id,
          chapterId: kid.current_chapter_id,
          parentId: parent.id,
          amount: chore.sticker_value,
        })
        // Instant feedback on this device; realtime keeps the partner in sync.
        setBalance(await fetchKidBalance(kid.id))
      } catch (err) {
        setError(getErrorMessage(err))
      } finally {
        setAwardingId(null)
      }
    },
    [kid, parent],
  )

  if (loading) {
    return <FullScreenSpinner />
  }
  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col px-5 pb-8">
      <header className="flex items-center justify-between py-4">
        <div>
          <p className="text-sm font-medium text-ink-muted">{household?.name}</p>
          {household && (
            <p className="text-xs text-ink-muted">
              Invite code:{' '}
              <span className="font-mono tracking-widest text-ink">{household.join_code}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-black/5"
        >
          Sign out
        </button>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="text-lg font-medium text-ink-muted">{kid?.name}</p>
        <p className="mt-1 text-[7rem] font-bold leading-none tracking-tight text-ink tabular-nums">
          {balance}
        </p>
        <p className="text-sm uppercase tracking-[0.2em] text-ink-muted">stickers</p>
      </section>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-center text-sm text-red-600">
          {error}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3">
        {chores.map((chore) => (
          <button
            key={chore.id}
            type="button"
            disabled={awardingId !== null}
            onClick={() => void handleAward(chore)}
            className="flex flex-col items-center gap-1 rounded-[var(--radius-card)] bg-accent px-4 py-6 font-medium text-white shadow-sm transition-transform active:scale-95 disabled:opacity-60"
          >
            <span className="text-base">{chore.name}</span>
            <span className="text-sm text-white/80">+{chore.sticker_value}</span>
          </button>
        ))}
        {chores.length === 0 && (
          <p className="col-span-2 text-center text-sm text-ink-muted">
            No chores yet. You'll add these in setup.
          </p>
        )}
      </section>
    </div>
  )
}
