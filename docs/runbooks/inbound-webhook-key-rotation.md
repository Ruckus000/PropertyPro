# Rotating `INBOUND_EMAIL_WEBHOOK_SECRET`

The HMAC key Forward Email signs inbound webhooks with. Rotate it when it has been
exposed — pasted into a chat, a ticket, a screenshot, a log — or on a schedule if you
adopt one.

> **This is a two-sided edit with an unavoidable outage, and almost nothing will tell you
> it is happening.** The key lives in Forward Email's dashboard *and* in Vercel, and the
> code accepts exactly one value at a time. Read the failure modes below before starting.
> Budget 30 minutes and do not start one you cannot finish.

Vendor background — the plan dependency, the alias records, why the free tier does not
work — is in [`../DEPLOYMENT.md`](../DEPLOYMENT.md) §5.5. This document covers only the
rotation.

---

## What breaks while you are doing it

**All six addresses stop receiving, everywhere.** `support@`, `privacy@`, `contact@`,
`hello@`, `postmaster@` and `abuse@` all route to the same webhook, and a webhook that
rejects takes down the **entire SMTP delivery** — including any catch-all copy going
somewhere else. That was measured in production on 2026-09-06 (`DEPLOYMENT.md` §5.5):
`zzztest@`, with no webhook, delivered; `hello@`, same catch-all *plus* a webhook,
delivered nowhere.

Two of those are RFC-mandated (`postmaster@`, `abuse@`) and one is a statutory intake path
with a clock running on it (`privacy@`).

**Nothing pages you.** A signature mismatch returns 401 and is *deliberately* not reported
to Sentry — there is a test asserting that, because paging on every mismatch during a
rotation trains you to ignore the alert that matters. So the expected mid-rotation failure
produces no telemetry at all. To see it you must look: Vercel logs on the web project,
filtered for `"errorCode":"SIGNATURE_MISMATCH"`.

**A truncated paste looks like a missing variable, not a wrong one.** The floor is exactly
32 characters and the test is `< 32`, so a 32-character key sits on the floor with zero
slack. Thirty-one characters takes the same branch as *unset* — same 429, same
`{"error":"not configured"}`, same Sentry event. Nothing distinguishes "you dropped a
character" from "you never set it".

**The readiness probe answers `200` while failing.** A missing or short secret makes the
overall status `degraded`, and only `unhealthy` returns 503. A monitor watching status
codes sees green. Parse the body.

**`SIGNATURE_MISSING` is a different problem — check it before touching the key.** That
code means Forward Email is not sending a signature at all, which is free-plan behaviour.
No secret change will help; the domain's plan lapsed. `SIGNATURE_MISMATCH` is the one a
rotation causes.

**Do not rotate during a migration, a data repair, or anything holding a table lock.** A
lock wait can outrun the function's 60-second budget, and a platform 504 is a 5xx — which
Forward Email treats as *permanent*, so mail bounces instead of being held.

---

## The order is forced

```
1. Reset in Forward Email   →   2. Update Vercel   →   3. Redeploy
```

You cannot pre-stage the Vercel value to shorten the outage. Forward Email mints the key
server-side and does not reveal it until you click Reset, and the old key is unrecoverable
from that instant. There is no dual-key mode: the verifier reads one variable and computes
one expected signature.

So the window runs from the moment you click Reset to the moment the new deployment is
live — a paste plus a deploy. Have the Vercel tab already open.

---

## Procedure

Every step is idempotent and safe to re-run. Stop at the first failure.

### 0. Send a message you can check later

From an external account, email `support@getpropertypro.com`. Confirm it appears at
`admin.getpropertypro.com/inbox`. Then send a **second** one and leave it unanswered.

That second message is the only way to settle something the codebase cannot: whether
Forward Email really *holds* mail during the window rather than bouncing it. The route's
own docblock flags the HTTP→SMTP mapping as unverified against the deployed MX. If the
second message appears after step 3, deferral is confirmed on the real production path.

### 1. Reset the key — Forward Email dashboard

forwardemail.net → sign in → **My Account → Domains → `getpropertypro.com` → Advanced
Settings** → the **Webhook Signature Payload Verification Key** card → **Reset**.

The old key stops working immediately. From here every inbound message is rejected until
step 3 finishes.

**Do not generate your own key.** `openssl rand -hex 16` produces a value Forward Email
never issued, and every message would fail forever.

### 2. Copy it into Vercel — web project only

Check the paste before it goes anywhere. It should be exactly the string the dashboard
shows, with no whitespace:

```bash
printf '%s' "$NEW_KEY" | wc -c    # must equal the dashboard's length, and be >= 32
```

Then set it on **`property-pro-web`**. Nothing in `apps/admin` reads this variable — do not
add it there.

Prefer the dashboard — **Settings → Environment Variables → edit in place → Save** — which
is atomic. `vercel env rm` followed by `vercel env add` leaves a window where the variable
is unset, which is a *second* outage on top of the one you are already in.

If you use the CLI, follow the invocation in [`../DEPLOYMENT.md`](../DEPLOYMENT.md) §4.1 and
keep `--no-sensitive`. `.env.example` section 14 explains why in full. One reassurance
specific to this variable: if you get it wrong, `[SENSITIVE]` is 11 characters, under the
32 floor, so it fails closed and loudly rather than quietly deploying a public constant.

Run `vercel env ls production --project property-pro-web` first and rotate **every**
environment the old value is set in, or the compromised string survives somewhere.

### 3. Redeploy

Environment values are baked in at `vercel pull` + `vercel build`, so a running deployment
never picks up a change on its own.

```bash
gh workflow run deploy.yml --ref main
```

Two things to know about that command. It deploys **both** web and admin, so an admin
smoke-test failure will redden the run even though the web deploy succeeded — check the
`deploy-production` job, not the overall conclusion. And a manual dispatch **skips** the
Integration Tests gate that the automatic push path waits for; that is deliberate, but it
means nothing is checking the code you are shipping beyond the pre-push gate.

### 4. Verify the secret is present and well-formed

```bash
curl -H "Authorization: Bearer $READINESS_CHECK_SECRET" \
  https://www.getpropertypro.com/api/v1/internal/readiness
```

`CRON_SECRET` also works if you have that to hand instead.

**What counts as a pass:** `.checks.inbound_email_webhook_secret.status` is `pass`. The
HTTP status is **not** the signal — this endpoint returns 200 while reporting `degraded`,
so a green status code means nothing here.

This proves the variable is set and long enough. It does **not** prove the value matches
Forward Email's. Only step 5 does that.

### 5. Prove it end to end

Send a fresh message to `support@getpropertypro.com` and confirm it appears at `/inbox`.

Then check whether the **step 0** message arrived too. If it did, the sender's server held
it through the window and released it — deferral confirmed on the real MX. If it did not,
note that: it means a rejected webhook bounces rather than defers, which contradicts the
route's stated durability model and is worth an issue.

If neither arrives, wait an hour before escalating. Forward Email caches domain settings,
and their cache invalidation on reset is conditional.

---

## If it goes wrong

Step 1 is irreversible — the old key no longer exists anywhere, so there is nothing to roll
back to. Recovery is to re-run steps 2 and 3 with the value currently shown in the Forward
Email dashboard.

If mail is still not arriving after step 5, read the `errorCode` in the Vercel logs before
changing anything: `SIGNATURE_MISMATCH` means the two sides disagree (redo step 2),
`SIGNATURE_MISSING` means the domain is not on a paid plan (see `DEPLOYMENT.md` §5.5), and
`SECRET_NOT_CONFIGURED` means the variable is unset or under 32 characters.

**Do not paste the new key into a chat, a ticket, or a commit message.** That is what made
this rotation necessary.

## Related

- [`../DEPLOYMENT.md`](../DEPLOYMENT.md) §5.5 — the vendor, the DNS records, the plan dependency
- [`../DEPLOYMENT.md`](../DEPLOYMENT.md) §4.1 — the `vercel env add` invocation and `--no-sensitive`
- `.env.example` section 14 — the fail-closed rationale and the Sensitive-variable trap
