// delete-account — permanently deletes the signed-in parent's account.
//
// Apple guideline 5.1.1(v) requires in-app account deletion; this is also good
// hygiene for the PWA. Auth-user deletion needs the service role, so it can't
// run client-side — the browser invokes this function with its session JWT.
//
// Two paths, decided by how many parents are in the household:
//   - sole parent  -> tear down the whole household (cascades) + storage + auth user
//   - co-parent    -> remove only this parent row + auth user; household survives
//
// The sole-vs-co-parent decision is made atomically by the
// delete_own_account_scope() RPC (household row lock), so two co-parents
// deleting simultaneously can't both take the co-parent path and orphan the
// household — see 20260610120001_delete_account_scope_rpc.sql.
//
// The auth-user deletion happens LAST so a failed DB/storage step leaves the
// account intact and safe to retry rather than orphaned in auth.users.
//
// Deploy: supabase functions deploy delete-account
// (verify_jwt = true in config.toml — the gateway rejects unauthenticated calls;
//  we additionally resolve the caller from their JWT below.)

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

// Household art/avatars live under a "{household_id}/…" prefix in these (now
// private) buckets. Postgres cascades don't touch Storage, so we purge them
// explicitly via the service-role admin client (which bypasses RLS + the
// public flag alike).
const HOUSEHOLD_BUCKETS = ['sticker-images', 'kid-avatars'] as const

// Pin CORS to the app origin in production: this is a destructive endpoint.
// Set via `supabase secrets set APP_ORIGIN=https://…`; the '*' fallback keeps
// deletion working (JWT still required) until the secret is configured.
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? '*'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// Recursively collect every OBJECT path under a prefix. Storage layouts differ
// per bucket — sticker-images is flat ("{household}/{uuid}") but kid-avatars
// nests a level ("{household}/{kid}/{uuid}"), so a single list() of the
// household prefix returns the kid *folders*, not the files. supabase-js
// surfaces a folder/prefix as an entry with `id === null` (no metadata); a real
// object has a non-null id. Recurse into prefixes so we never leave a file
// orphaned (Storage isn't touched by the Postgres cascade).
async function listObjectPaths(
  admin: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const { data: entries, error } = await admin.storage
    .from(bucket)
    .list(prefix, { limit: 1000 })
  if (error) throw new Error(`Failed to list ${bucket}/${prefix}: ${error.message}`)

  const paths: string[] = []
  for (const entry of entries ?? []) {
    const fullPath = `${prefix}/${entry.name}`
    if (entry.id === null) {
      // A prefix/"folder" — descend into it.
      paths.push(...(await listObjectPaths(admin, bucket, fullPath)))
    } else {
      paths.push(fullPath)
    }
  }
  return paths
}

// Remove every object under "{householdId}/" in each household bucket, at any
// depth (flat sticker images AND nested kid avatars).
async function purgeHouseholdStorage(
  admin: SupabaseClient,
  householdId: string,
): Promise<void> {
  for (const bucket of HOUSEHOLD_BUCKETS) {
    const paths = await listObjectPaths(admin, bucket, householdId)
    if (paths.length > 0) {
      const { error: removeError } = await admin.storage.from(bucket).remove(paths)
      if (removeError) {
        throw new Error(`Failed to clear ${bucket}: ${removeError.message}`)
      }
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    return json({ error: 'Function is not configured' }, 500)
  }

  // Identify the caller from their JWT (anon client scoped to the bearer token).
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userError,
  } = await caller.auth.getUser()
  if (userError || !user) {
    return json({ error: 'Not authenticated' }, 401)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    const { data: parentRow, error: parentError } = await admin
      .from('parent')
      .select('id, household_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (parentError) throw new Error(parentError.message)

    // No household membership (or a retry after the DB step already ran): just
    // remove the auth user. Idempotent.
    if (!parentRow) {
      const { error: authError } = await admin.auth.admin.deleteUser(user.id)
      if (authError) throw new Error(authError.message)
      return json({ outcome: 'self_removed' })
    }

    // Atomic decision via the CALLER's client (auth.uid() must resolve): the
    // RPC locks the household row, so two simultaneous deletions serialize —
    // the second recounts after the first commits and correctly becomes the
    // last-parent-out case instead of orphaning the household.
    // 'self' also means the RPC already deleted the caller's parent row.
    const { data: scope, error: scopeError } = await caller.rpc(
      'delete_own_account_scope',
    )
    if (scopeError) throw new Error(scopeError.message)

    if (scope === 'household') {
      // Last parent out: storage first (safe to re-run), then the household row
      // (cascades to kids, chapters, events, redemptions, chores, tiers,
      // sticker images, push subscriptions), then the auth user.
      await purgeHouseholdStorage(admin, parentRow.household_id)
      const { error: householdError } = await admin
        .from('household')
        .delete()
        .eq('id', parentRow.household_id)
      if (householdError) throw new Error(householdError.message)

      const { error: authError } = await admin.auth.admin.deleteUser(user.id)
      if (authError) throw new Error(authError.message)
      return json({ outcome: 'household_deleted' })
    }

    // Co-parent: the RPC dropped this parent row (FK ON DELETE SET NULL keeps
    // the history; push_subscription cascades) — finish with the auth user.
    const { error: authError } = await admin.auth.admin.deleteUser(user.id)
    if (authError) throw new Error(authError.message)
    return json({ outcome: 'self_removed' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Account deletion failed'
    return json({ error: message }, 500)
  }
})
