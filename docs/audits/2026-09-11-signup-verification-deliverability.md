# Signup verification email → Gmail spam

**Date:** 2026-09-11 · **Trigger:** the live-cutover signup's verification email
landed in spam, blocking the funnel at its most expensive point — after the user
has filled in the form and is waiting.

**Verdict: the CTA's link domain is the leading hypothesis, and it is NOT proven.
Domain reputation is not excluded.** Read the "What this does not establish"
section before acting on it.

---

## Authentication is ruled out — measured, not assumed

From the delivered message's own headers (`Authentication-Results: mx.google.com`):

```
dkim=pass  header.i=@getpropertypro.com header.s=resend
dkim=pass  header.i=@amazonses.com      header.s=224i4yxa5dv7c2xz3womw6peuasteono
spf=pass   smtp.mailfrom=…@send.getpropertypro.com
dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=getpropertypro.com
```

All three pass and align. **`dis=NONE` is the decisive token**: DMARC applied no
disposition, so the `p=quarantine` ratchet enforced on 2026-09-10 did not cause
this. The DNS posture behind those results is recorded in `DEPLOYMENT.md` §5.4
and is not restated here.

## What was measured

The signup verification email's **only** link is Supabase's `action_link`, used
verbatim from `generateLink` (`lib/auth/signup.ts:486`):

```
https://<project-ref>.supabase.co/auth/v1/verify?token=…&redirect_to=…
```

| # | Recipient | Sent (UTC) | CTA host | Placement |
|---|---|---|---|---|
| 1 | `johnphilistin12@gmail.com` | 16:14 | `…supabase.co` | **SPAM** |
| 2 | `cymlilk@gmail.com` | 19:07 | `…supabase.co` | **SPAM** |
| 3 | `johnphilistin12@gmail.com` — *welcome* email | 16:34 | `getpropertypro.com` | **INBOX** (+IMPORTANT) |

Rows 1 and 2 are two **independent Google accounts**, both spam-foldering the
same message. Row 3 is a different template from the same sender, twenty minutes
after row 1, whose only link is first-party — and it inboxed.

## What this does not establish

Three caveats, each of which weakens the conclusion and none of which is
hypothetical:

1. **Row 3 is confounded.** Rescuing row 1 from spam trains Gmail's per-user
   filter for that sender. The rescue demonstrably happened (the message reads
   `INBOX` now), but its timestamp is not recoverable, so it may precede row 3.
2. **Row 2's mailbox is not pristine.** `cymlilk@gmail.com` already had a signup
   attempt on 2026-04-24 — `pending_signups` id 45, originally slug `wrathland`,
   which today's test *updated in place* rather than inserting beside. That mail
   predates DKIM/SPF/DMARC being configured, so any training it left biases
   **toward** spam. A spam verdict on row 2 is therefore weaker evidence than it
   looks; an inbox verdict would have been strong.
3. **The discriminating arm was not run.** The experiment that would settle it is
   the same template, same sender, same recipient, with only the CTA host changed
   to first-party. It was attempted and abandoned: rendering
   `SignupVerificationEmail` outside Next fails with *"Objects are not valid as a
   React child"*, the same class of trap recorded for prod email probes. Five
   attempts at disposable tooling was the wrong trade.

## Recommendation

**Move the verification link onto our own domain** — but for reasons that hold
whether or not it fixes the spam placement:

- A mail from `getpropertypro.com` whose sole button points at an unrelated,
  random-looking third-party host is the textbook phishing shape. That is a
  **trust** problem before it is a deliverability one.
- The chain today is `supabase.co` → 302 → apex → 307 → `www`: three hosts and
  two redirects for one click.
- **Invitations already do this** (`invitations/route.ts:96` sends
  `${getBaseUrl()}/auth/accept-invite?token=…`). Verification is the outlier.
- The mechanism already exists in-repo **four times**: `generateLink` returns
  `hashed_token` alongside `action_link`, and `demo-session.ts:72`,
  `dev/agent-login/route.ts:93` and `provisioning-service.ts:1198` all complete
  auth server-side with `verifyOtp` and never show a user a Supabase URL.

**Then re-measure.** Shipping the route and observing placement on a *fresh*
address is the discriminating experiment, run against real mail on the real path
— strictly better evidence than the probe that was abandoned, at no extra cost.

> If placement does not improve, the answer is sender reputation on a young
> domain, which no code change fixes. Record that here rather than shipping a
> second guess on top of the first.

## Not done

- **`NEXT_PUBLIC_APP_URL` is not moved from apex to `www`.** ~26 callers, nearly
  all outbound email, and `DEPLOYMENT.md:284-309` records the apex/www split as a
  decision that must move together with the health check and the inbound-webhook
  DNS record.
- **No DNS, DMARC, SPF or DKIM change.** They are correct, and `aspf=r` is
  documented as load-bearing.
- **No template rewrite.** One change worth noting for whoever builds the route:
  the template has a single button and **no visible URL**
  (`signup-verification-email.tsx:37`), so a reader cannot see where it goes —
  itself a mild spam and trust signal.
