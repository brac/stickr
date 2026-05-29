# send-award-push

Sends a Web Push notification to the *other* parent(s) in a household when a
sticker is awarded. Triggered by a database webhook on `sticker_event` INSERT.

## One-time setup

### 1. Client build env (Vercel + local `.env`)

The browser needs the **public** VAPID key to subscribe. It's public — safe to
commit/share:

```
VITE_VAPID_PUBLIC_KEY=BK58jBpQY1qYPN180ZjWvL_DFgegKKf84GipC-zki03XhyB6gM90Lk7CRJ_hqp-AWjzjeSIDF5dLe-OQ8tLI9IM
```

Add it in Vercel (Project → Settings → Environment Variables) and to your local
`.env`, then redeploy/rebuild so the opt-in toggle appears.

### 2. Function secrets (Supabase)

The **private** key is a secret — never commit it. Set all four:

```bash
supabase secrets set \
  VAPID_PUBLIC_KEY=BK58jBpQY1qYPN180ZjWvL_DFgegKKf84GipC-zki03XhyB6gM90Lk7CRJ_hqp-AWjzjeSIDF5dLe-OQ8tLI9IM \
  VAPID_PRIVATE_KEY=<the private key from the keypair> \
  VAPID_SUBJECT=mailto:you@yourdomain.com \
  PUSH_WEBHOOK_SECRET=<a long random string you generate>
```

### 3. Deploy the function

```bash
supabase functions deploy send-award-push
```

(`verify_jwt = false` is set in `config.toml` so the webhook can call it without
a user JWT; the `PUSH_WEBHOOK_SECRET` header authenticates the caller instead.)

### 4. Wire the database webhook

**Option A — Dashboard (recommended):** Database → Webhooks → *Create a new hook*

- Table: `sticker_event`, Events: **Insert**
- Type: **Supabase Edge Functions** → `send-award-push`
- HTTP Headers: add `x-webhook-secret` = the same value you set for
  `PUSH_WEBHOOK_SECRET`.

**Option B — SQL** (run once against your project; keep the secret out of git):

```sql
create trigger send_award_push_on_insert
  after insert on public.sticker_event
  for each row execute function supabase_functions.http_request(
    'https://<PROJECT_REF>.supabase.co/functions/v1/send-award-push',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"<PUSH_WEBHOOK_SECRET>"}',
    '{}',
    '5000'
  );
```

## Notes

- iOS only delivers Web Push to an **installed** PWA (Add to Home Screen),
  iOS 16.4+. A Safari tab won't receive it. The in-app toggle hides itself when
  push is unsupported.
- Lapsed subscriptions (HTTP 404/410) are pruned automatically.
- Degrades gracefully: with no subscriptions or no other parent, the function
  no-ops and returns 200.
