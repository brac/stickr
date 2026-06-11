// Feature 17 — cross-household RLS isolation suite (the "dynamic pass").
//
// Seeds TWO households (A and B) with two distinct auth users in a LOCAL
// Supabase, then from user A attempts to read/write/RPC against household B's
// ids. Every attempt must fail or return zero rows. This is the test that
// actually proves tenant isolation; the static audit is in docs/SECURITY-RLS.md.
//
// OPT-IN: guarded so the normal `npm test` unit run (dummy creds, jsdom, no
// network) skips it. To run, see docs/SECURITY-RLS.md → "Running the audit":
//   export RLS_TEST_SUPABASE_URL=http://127.0.0.1:54321
//   export RLS_TEST_ANON_KEY=<local anon key>
//   export RLS_TEST_SERVICE_KEY=<local service_role key>
//   npx vitest run src/lib/rls.integration.test.ts
//
// The service key is used ONLY to create the two test auth users and to read
// ground truth — never by the isolation assertions themselves (those use each
// user's own authenticated client).

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.RLS_TEST_SUPABASE_URL
const ANON = process.env.RLS_TEST_ANON_KEY
const SERVICE = process.env.RLS_TEST_SERVICE_KEY

function isLoopback(url: string | undefined): boolean {
  if (!url) return false
  try {
    const h = new URL(url).hostname
    return h === '127.0.0.1' || h === 'localhost' || h === '[::1]'
  } catch {
    return false
  }
}

// Real precondition: configured AND pointed at a loopback stack. Never run a
// write/destructive suite against a hosted project.
const RUN = Boolean(SUPABASE_URL && ANON && SERVICE && isLoopback(SUPABASE_URL))

interface Seeded {
  email: string
  password: string
  userId: string
  client: SupabaseClient
  householdId: string
  kidId: string
  chapterId: string
  choreId: string
  tierId: string
}

describe.skipIf(!RUN)('cross-household RLS isolation', () => {
  let service: SupabaseClient
  let A: Seeded
  let B: Seeded

  // Create an auth user, sign them in on their own client, bootstrap a
  // household via RPC, and collect the ids another tenant must never touch.
  async function seedHousehold(label: string): Promise<Seeded> {
    const suffix = crypto.randomUUID().slice(0, 8)
    const email = `rls-${label}-${suffix}@example.test`
    const password = `Pw-${suffix}-${suffix}`

    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr || !created.user) throw new Error(`createUser ${label}: ${createErr?.message}`)
    const userId = created.user.id

    // persistSession:false is load-bearing: the default localStorage-backed
    // session is SHARED across client instances in jsdom, so without this the
    // second sign-in clobbers the first and both clients act as the same user
    // (false cross-tenant "passes"). In-memory sessions keep A and B distinct.
    const client = createClient(SUPABASE_URL!, ANON!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: signInErr } = await client.auth.signInWithPassword({ email, password })
    if (signInErr) throw new Error(`signIn ${label}: ${signInErr.message}`)

    const { data: householdId, error: rpcErr } = await client.rpc('create_household', {
      p_household_name: `House ${label} ${suffix}`,
      p_parent_name: `Parent ${label}`,
      p_kid_name: `Kid ${label}`,
    })
    if (rpcErr || !householdId) throw new Error(`create_household ${label}: ${rpcErr?.message}`)

    // The bootstrap seeds one kid (with an open chapter) and one chore.
    const { data: kid } = await client
      .from('kid')
      .select('id, current_chapter_id')
      .single()
    const { data: chore } = await client.from('chore').select('id').single()

    // No reward tier is seeded — create one so the redeem_chapter cross-tenant
    // attempt has a real target.
    const { data: tier, error: tierErr } = await client
      .from('reward_tier')
      .insert({ household_id: householdId, threshold: 1, name: `Reward ${label}` })
      .select('id')
      .single()
    if (tierErr || !tier) throw new Error(`seed tier ${label}: ${tierErr?.message}`)

    return {
      email,
      password,
      userId,
      client,
      householdId: householdId as string,
      kidId: kid!.id as string,
      chapterId: kid!.current_chapter_id as string,
      choreId: chore!.id as string,
      tierId: tier.id as string,
    }
  }

  beforeAll(async () => {
    service = createClient(SUPABASE_URL!, SERVICE!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    A = await seedHousehold('A')
    B = await seedHousehold('B')
  }, 30_000)

  afterAll(async () => {
    // Tear down both auth users; household rows cascade from parent.auth_user_id.
    if (A?.userId) await service.auth.admin.deleteUser(A.userId)
    if (B?.userId) await service.auth.admin.deleteUser(B.userId)
  })

  // --- SELECT isolation: A sees only its own rows -------------------------

  it('A cannot read B\'s household', async () => {
    const { data } = await A.client.from('household').select('id')
    const ids = (data ?? []).map((r) => r.id)
    expect(ids).toContain(A.householdId)
    expect(ids).not.toContain(B.householdId)
  })

  it('A cannot read B\'s kid', async () => {
    const { data } = await A.client.from('kid').select('id')
    const ids = (data ?? []).map((r) => r.id)
    expect(ids).not.toContain(B.kidId)
  })

  it.each(['chore', 'reward_tier', 'sticker_image', 'sticker_event', 'redemption_event', 'board_chapter'])(
    'A cannot read B\'s rows in %s',
    async (table) => {
      // Try to read B's rows explicitly by B's household/kid — RLS must hide them.
      const { data } = await A.client.from(table).select('*')
      const leaked = (data ?? []).some(
        (r: Record<string, unknown>) =>
          r.household_id === B.householdId || r.kid_id === B.kidId,
      )
      expect(leaked).toBe(false)
    },
  )

  // --- WRITE isolation: A cannot mutate B's rows --------------------------

  it('A cannot UPDATE B\'s chore (RLS = 0 rows affected)', async () => {
    const { data } = await A.client
      .from('chore')
      .update({ name: 'hacked' })
      .eq('id', B.choreId)
      .select('id')
    expect(data ?? []).toHaveLength(0)
    // Ground truth via service: unchanged.
    const { data: truth } = await service.from('chore').select('name').eq('id', B.choreId).single()
    expect(truth!.name).not.toBe('hacked')
  })

  it('A cannot DELETE B\'s reward_tier', async () => {
    await A.client.from('reward_tier').delete().eq('id', B.tierId)
    const { data: truth } = await service.from('reward_tier').select('id').eq('id', B.tierId).maybeSingle()
    expect(truth?.id).toBe(B.tierId) // still there
  })

  // Regression guard for docs/SECURITY-RLS.md Finding 1. FAILS until
  // 20260528150000_rls_hardening.sql is applied — that's intentional.
  it('A cannot move itself into B by rewriting parent.household_id', async () => {
    await A.client
      .from('parent')
      .update({ household_id: B.householdId })
      .eq('auth_user_id', A.userId)
    const { data: truth } = await service
      .from('parent')
      .select('household_id')
      .eq('auth_user_id', A.userId)
      .single()
    expect(truth!.household_id).toBe(A.householdId) // not moved
  })

  // --- RPC isolation: passed ids must be re-scoped server-side ------------

  it('A cannot rename B\'s kid via update_kid_name', async () => {
    const { error } = await A.client.rpc('update_kid_name', {
      p_kid_id: B.kidId,
      p_name: 'hacked',
    })
    expect(error).not.toBeNull()
    const { data: truth } = await service.from('kid').select('name').eq('id', B.kidId).single()
    expect(truth!.name).not.toBe('hacked')
  })

  it('A cannot set B\'s kid avatar via set_kid_avatar_path', async () => {
    const { error } = await A.client.rpc('set_kid_avatar_path', {
      p_kid_id: B.kidId,
      p_path: `${A.householdId}/evil.webp`,
    })
    expect(error).not.toBeNull()
  })

  it('A cannot redeem against B\'s chapter via redeem_chapter', async () => {
    const { error } = await A.client.rpc('redeem_chapter', {
      p_kid_id: B.kidId,
      p_chapter_id: B.chapterId,
      p_reward_tier_id: B.tierId,
      p_redeemed_by: A.userId, // even spoofing redeemed_by must fail
    })
    expect(error).not.toBeNull()
  })

  // --- push_subscription is per-parent, not just per-household ------------

  it('A cannot read B\'s push_subscription rows', async () => {
    // B registers a (fake) subscription for itself.
    const { data: bParent } = await B.client.from('parent').select('id').single()
    await B.client.from('push_subscription').insert({
      parent_id: bParent!.id,
      endpoint: `https://push.test/${crypto.randomUUID()}`,
      p256dh: 'x',
      auth: 'y',
    })
    const { data } = await A.client.from('push_subscription').select('id')
    expect(data ?? []).toHaveLength(0) // A sees none of B's
  })

  // --- Storage isolation (regression for the private-bucket hardening) --------
  //
  // Two migrations together close cross-household storage access:
  //   * 20260529201604 scoped the SELECT policy → list() enforces RLS (anon and
  //     other households can't ENUMERATE), even on a public bucket.
  //   * 20260529204729 flips the buckets to public=false → object READS enforce
  //     RLS too. A public bucket serves bytes via /object/public regardless of
  //     RLS, so before this a path-holder could still DOWNLOAD any household's
  //     sticker art / kid-avatar photo. Now reads go through signed URLs that
  //     only the owning household can mint.
  //
  // Seed a REAL object in B's folder so a leak would be observable, then assert
  // ONLY B can list / download / sign it; A (other household) and anon cannot.
  // The B-can checks are positive controls so the empty/denied results are real
  // isolation, not an empty bucket.
  // 1x1 transparent PNG (both buckets allow image/png) — the bytes are
  // irrelevant; we only need a real object at a household-scoped path.
  const PNG_1x1 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  function pngBytes(): Uint8Array {
    const bin = atob(PNG_1x1)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i)
    return arr
  }

  it.each(['sticker-images', 'kid-avatars'])('Storage: only B can list/read/sign its own objects in %s (anon + A cannot)', async (STORAGE_BUCKET) => {
    const objectPath = `${B.householdId}/rls-${crypto.randomUUID()}.png`
    const { error: upErr } = await B.client.storage
      .from(STORAGE_BUCKET)
      .upload(objectPath, pngBytes(), { contentType: 'image/png', upsert: true })
    expect(upErr).toBeNull()

    const anon = createClient(SUPABASE_URL!, ANON!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const fileName = objectPath.split('/').pop()!

    try {
      // Positive control: B (owner) can list, download, and sign its own object —
      // proving the operations work at all, so the denials below are real.
      const { data: bList } = await B.client.storage.from(STORAGE_BUCKET).list(B.householdId)
      expect((bList ?? []).some((o) => o.name === fileName)).toBe(true)
      const { data: bDl } = await B.client.storage.from(STORAGE_BUCKET).download(objectPath)
      expect(bDl).not.toBeNull()
      const { data: bSign } = await B.client.storage.from(STORAGE_BUCKET).createSignedUrl(objectPath, 60)
      expect(bSign?.signedUrl).toBeTruthy()

      // Isolation — A (authenticated, other household): list, download, and
      // sign of B's object must all be denied/empty.
      const { data: aList } = await A.client.storage.from(STORAGE_BUCKET).list(B.householdId)
      expect(aList ?? []).toHaveLength(0)
      const { data: aDl, error: aDlErr } = await A.client.storage.from(STORAGE_BUCKET).download(objectPath)
      expect(aDl).toBeNull()
      expect(aDlErr).not.toBeNull()
      const { data: aSign, error: aSignErr } = await A.client.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(objectPath, 60)
      expect(aSign).toBeNull()
      expect(aSignErr).not.toBeNull()

      // Isolation — anon (unauthenticated): cannot enumerate the bucket root or
      // B's folder, and cannot download. Both error and empty mean "denied".
      const { data: anonRoot } = await anon.storage.from(STORAGE_BUCKET).list()
      expect(anonRoot ?? []).toHaveLength(0)
      const { data: anonFolder } = await anon.storage.from(STORAGE_BUCKET).list(B.householdId)
      expect(anonFolder ?? []).toHaveLength(0)
      const { data: anonDl, error: anonDlErr } = await anon.storage.from(STORAGE_BUCKET).download(objectPath)
      expect(anonDl).toBeNull()
      expect(anonDlErr).not.toBeNull()
    } finally {
      // Storage objects don't cascade from auth-user deletion — clean up.
      await service.storage.from(STORAGE_BUCKET).remove([objectPath])
    }
  }, 20_000)

  // Realtime enforces the same SELECT policies (Postgres Changes). A subscribes
  // to INSERTs on sticker_event (replica identity full, in supabase_realtime),
  // then B performs a legitimate in-household insert that DOES fire B's own
  // changefeed. If RLS leaks, A's socket would receive B's row. See
  // docs/SECURITY-RLS.md.
  const REALTIME_LIVE_TIMEOUT_MS = 10_000 // max wait for A's OWN event (channel live)
  const REALTIME_SETTLE_MS = 3000 // bounded extra wait for any leaked event to arrive

  it('Realtime: A receives no changefeed events from B\'s mutations', async () => {
    // jsdom replaces globalThis.Event with its own class, but Node's undici
    // WebSocket (the global WS realtime-js uses here) dispatches events on a
    // native EventTarget, which rejects a jsdom Event with ERR_INVALID_ARG_TYPE
    // on connect/close. Recover the native Event (an AbortSignal 'abort' event
    // is a native Event regardless of the jsdom clobber) and install it for the
    // duration of the socket's life, then restore jsdom's Event in finally so
    // no other test is affected.
    const jsdomEvent = globalThis.Event
    let nativeEvent: typeof Event = jsdomEvent
    const ac = new AbortController()
    ac.signal.addEventListener('abort', (e) => {
      nativeEvent = (e.constructor as typeof Event)
    })
    ac.abort()
    globalThis.Event = nativeEvent

    const received: Array<Record<string, unknown>> = []
    const channel = A.client
      .channel(`rls-rt-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sticker_event' },
        (payload) => {
          received.push(payload.new as Record<string, unknown>)
        },
      )

    try {
      await new Promise<void>((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve()
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(new Error(`subscribe failed: ${status}`))
          }
        })
      })

      // Positive control: an in-household insert by A MUST arrive on A's socket.
      // Without this, a silently-dead channel (disconnect after SUBSCRIBED, a
      // Realtime misconfig, or a transient hiccup) would leave `received` empty
      // and the isolation assertion below would pass while proving nothing. The
      // control makes the negative assertion meaningful: we only trust "A got
      // none of B's events" once we've confirmed A's channel actually delivers.
      const { data: aParent } = await A.client.from('parent').select('id').single()
      const { error: aInsErr } = await A.client.from('sticker_event').insert({
        kid_id: A.kidId,
        chapter_id: A.chapterId,
        chore_id: A.choreId,
        amount: 1,
        awarded_by: aParent!.id,
      })
      expect(aInsErr).toBeNull()

      // Poll (not a fixed sleep) until A's own event arrives, so the control is
      // robust to broker latency under load rather than racing a 3s window.
      const liveDeadline = Date.now() + REALTIME_LIVE_TIMEOUT_MS
      while (!received.some((r) => r.kid_id === A.kidId) && Date.now() < liveDeadline) {
        await new Promise((r) => setTimeout(r, 100))
      }
      expect(received.some((r) => r.kid_id === A.kidId)).toBe(true) // channel proven live

      // B writes a real, in-household sticker_event so the changefeed fires on
      // B's side. A must not receive it through the shared Realtime socket.
      const { data: bParent } = await B.client.from('parent').select('id').single()
      const { error: insErr } = await B.client.from('sticker_event').insert({
        kid_id: B.kidId,
        chapter_id: B.chapterId,
        chore_id: B.choreId,
        amount: 1,
        awarded_by: bParent!.id,
      })
      expect(insErr).toBeNull()

      // The channel is proven live; give any leaked B event a bounded window to
      // arrive, then assert none did. (A leak could in theory arrive later on a
      // heavily loaded broker, but the live control rules out a dead channel.)
      await new Promise((r) => setTimeout(r, REALTIME_SETTLE_MS))

      // Isolation: despite a live channel, A received none of B's events.
      const bKidEvents = received.filter((r) => r.kid_id === B.kidId)
      expect(bKidEvents).toHaveLength(0)
    } finally {
      await A.client.removeChannel(channel)
      globalThis.Event = jsdomEvent
    }
  }, 20_000)

  // --- Within-household integrity (20260610120000_sticker_event_integrity) --
  //
  // Not isolation: these guard the closed-chapter invariants inside a single
  // household. They FAIL until that migration is applied — intentional, same
  // as the Finding-1 regression guard above. Defined last because the first
  // one redeems (closes) A's seeded chapter, which earlier tests insert into.

  it('A cannot insert a sticker_event into a CLOSED chapter', async () => {
    const { data: aParent } = await A.client.from('parent').select('id').single()
    // Meet the tier threshold (1), then redeem — closing A.chapterId.
    const { error: insErr } = await A.client.from('sticker_event').insert({
      kid_id: A.kidId,
      chapter_id: A.chapterId,
      chore_id: A.choreId,
      amount: 1,
      awarded_by: aParent!.id,
    })
    expect(insErr).toBeNull()
    const { data: newChapterId, error: redeemErr } = await A.client.rpc('redeem_chapter', {
      p_kid_id: A.kidId,
      p_chapter_id: A.chapterId,
      p_reward_tier_id: A.tierId,
      p_redeemed_by: aParent!.id,
    })
    expect(redeemErr).toBeNull()
    expect(newChapterId).toBeTruthy()

    // The archived chapter must be immutable: RLS rejects the insert (42501).
    const { error } = await A.client.from('sticker_event').insert({
      kid_id: A.kidId,
      chapter_id: A.chapterId,
      chore_id: A.choreId,
      amount: 1,
      awarded_by: aParent!.id,
    })
    expect(error).not.toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('redeem_chapter rejects a chapter belonging to a different kid', async () => {
    const { data: aParent } = await A.client.from('parent').select('id').single()
    // Second kid in A's OWN household, with its own open chapter — this is a
    // domain-integrity check, not cross-tenant.
    const { data: kid2Id, error: kidErr } = await A.client.rpc('create_kid', {
      p_kid_name: 'Kid A2',
    })
    expect(kidErr).toBeNull()
    const { data: kid2 } = await A.client
      .from('kid')
      .select('current_chapter_id')
      .eq('id', kid2Id as string)
      .single()
    // Earn past the threshold on kid2 so only the chapter-ownership check can
    // be what rejects the redeem below.
    const { error: insErr } = await A.client.from('sticker_event').insert({
      kid_id: kid2Id as string,
      chapter_id: kid2!.current_chapter_id as string,
      chore_id: A.choreId,
      amount: 1,
      awarded_by: aParent!.id,
    })
    expect(insErr).toBeNull()

    // Redeem kid2 against kid1's open chapter → ownership validation rejects.
    const { data: kid1 } = await A.client
      .from('kid')
      .select('current_chapter_id')
      .eq('id', A.kidId)
      .single()
    const { error } = await A.client.rpc('redeem_chapter', {
      p_kid_id: kid2Id as string,
      p_chapter_id: kid1!.current_chapter_id as string,
      p_reward_tier_id: A.tierId,
      p_redeemed_by: aParent!.id,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/chapter already closed/)
  })
})
