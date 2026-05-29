// send-award-push — notifies the *other* parent(s) in a household when a
// sticker is awarded. Invoked by a database webhook on `sticker_event` INSERT
// (see README.md). Runs with the service role so it can read across the
// household; authenticates the webhook caller with a shared secret header.
//
// Deploy: supabase functions deploy send-award-push
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_WEBHOOK_SECRET

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface StickerEventRecord {
  id: string
  kid_id: string
  awarded_by: string | null
  chore_id: string | null
  label: string | null
  amount: number
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: StickerEventRecord | null
}

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:stickr@example.com'
const WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

function pluralStickers(amount: number): string {
  return amount === 1 ? 'a sticker' : `${amount} stickers`
}

Deno.serve(async (req) => {
  // Authenticate the webhook caller via shared secret. With verify_jwt=false on
  // this function the secret is the ONLY caller gate, so fail CLOSED if it's
  // unset — otherwise anyone who can reach the URL could trigger pushes.
  if (!WEBHOOK_SECRET) {
    return new Response('Webhook secret not configured', { status: 500 })
  }
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response('VAPID keys not configured', { status: 500 })
  }

  let payload: WebhookPayload
  try {
    payload = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const record = payload.record
  if (payload.type !== 'INSERT' || payload.table !== 'sticker_event' || !record) {
    // Not an award insert — nothing to do, but acknowledge so the webhook
    // doesn't retry.
    return new Response(JSON.stringify({ skipped: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Who/what to describe: the kid, and what the sticker was for.
  const { data: kid } = await supabase
    .from('kid')
    .select('name, household_id')
    .eq('id', record.kid_id)
    .single()
  if (!kid) {
    return new Response(JSON.stringify({ error: 'kid not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let reason: string | null = record.label
  if (!reason && record.chore_id) {
    const { data: chore } = await supabase
      .from('chore')
      .select('name')
      .eq('id', record.chore_id)
      .single()
    reason = chore?.name ?? null
  }

  // The other parent(s) in the household — never notify the awarder themselves.
  const { data: parents } = await supabase
    .from('parent')
    .select('id')
    .eq('household_id', kid.household_id)
  const recipientIds = (parents ?? [])
    .map((p) => p.id)
    .filter((id) => id !== record.awarded_by)

  if (recipientIds.length === 0) {
    // Log the no-op so "nothing happened" is distinguishable from a failure: the
    // awarder is the household's only parent.
    console.log(
      `[send-award-push] no recipients kid=${record.kid_id} ` +
        `awarded_by=${record.awarded_by ?? 'null'} (awarder is sole parent)`,
    )
    return new Response(JSON.stringify({ sent: 0, reason: 'no other parents' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { data: subscriptions } = await supabase
    .from('push_subscription')
    .select('id, endpoint, p256dh, auth')
    .in('parent_id', recipientIds)

  if (!subscriptions || subscriptions.length === 0) {
    // The common "I awarded but my partner got nothing" cause: the recipient
    // parent never enabled notifications on any device. Make it visible.
    console.log(
      `[send-award-push] no subscriptions for ${recipientIds.length} ` +
        `recipient(s) kid=${record.kid_id} — recipient(s) have not enabled push`,
    )
    return new Response(JSON.stringify({ sent: 0, reason: 'no subscriptions' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = reason
    ? `${kid.name} earned ${pluralStickers(record.amount)} for ${reason}! 🌟`
    : `${kid.name} earned ${pluralStickers(record.amount)}! 🌟`
  const notification = JSON.stringify({ title: 'Stickr', body, url: '/' })

  // Send to every recipient device. A 404/410 means the subscription has
  // lapsed — prune it so we stop trying. Any OTHER failure (401/403 VAPID-key
  // mismatch, network, payload too large) is a real delivery problem: log it
  // and count it, so a silent push outage shows up in the function logs and the
  // response body instead of looking identical to success.
  const stale: string[] = []
  let sent = 0
  let failed = 0
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          notification,
        )
        sent += 1
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          stale.push(sub.id)
        } else {
          failed += 1
          const detail = err instanceof Error ? err.message : String(err)
          const responseBody = (err as { body?: string }).body
          let host = 'unknown'
          try {
            host = new URL(sub.endpoint).host
          } catch {
            // endpoint not a valid URL — leave host as 'unknown'
          }
          // A 401/403 here almost always means the stored subscription was
          // created with a different VAPID key than this function signs with;
          // re-subscribe each device after any key change.
          console.error(
            `[send-award-push] delivery failed for subscription ${sub.id} ` +
              `(host ${host}, status ${statusCode ?? 'unknown'}): ${detail}` +
              (responseBody ? ` — ${responseBody}` : ''),
          )
        }
      }
    }),
  )

  if (stale.length > 0) {
    await supabase.from('push_subscription').delete().in('id', stale)
  }

  // Always log the outcome (not just failures): a bare "POST | 200" in the edge
  // logs is identical whether we delivered or silently failed. This one line
  // makes a delivery test conclusive — sent>0 means the push reached the push
  // service; failed>0 (with the per-failure status logged above) means a real
  // delivery problem, most often a VAPID-key mismatch (403).
  console.log(
    `[send-award-push] result kid=${record.kid_id} ` +
      `recipients=${recipientIds.length} subscriptions=${subscriptions.length} ` +
      `sent=${sent} pruned=${stale.length} failed=${failed}`,
  )

  return new Response(JSON.stringify({ sent, pruned: stale.length, failed }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
