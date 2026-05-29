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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// Remove every object under "{householdId}/" in each household bucket.
// Layout is flat one level deep, so a single list() per bucket suffices.
async function purgeHouseholdStorage(
  admin: SupabaseClient,
  householdId: string,
): Promise<void> {
  for (const bucket of HOUSEHOLD_BUCKETS) {
    const { data: files, error } = await admin.storage
      .from(bucket)
      .list(householdId, { limit: 1000 })
    if (error) throw new Error(`Failed to list ${bucket}: ${error.message}`)
    if (files && files.length > 0) {
      const paths = files.map((file) => `${householdId}/${file.name}`)
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

    const { count, error: countError } = await admin
      .from('parent')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', parentRow.household_id)
    if (countError) throw new Error(countError.message)

    const soleParent = (count ?? 1) <= 1

    if (soleParent) {
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

    // Co-parent: drop only this parent row (FK ON DELETE SET NULL keeps the
    // history; push_subscription cascades), then the auth user.
    const { error: deleteError } = await admin
      .from('parent')
      .delete()
      .eq('id', parentRow.id)
    if (deleteError) throw new Error(deleteError.message)

    const { error: authError } = await admin.auth.admin.deleteUser(user.id)
    if (authError) throw new Error(authError.message)
    return json({ outcome: 'self_removed' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Account deletion failed'
    return json({ error: message }, 500)
  }
})
