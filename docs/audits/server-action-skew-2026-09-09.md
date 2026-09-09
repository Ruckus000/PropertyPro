# `Failed to find Server Action` — what it is, and why Skew Protection is not the fix

**Date:** 2026-09-09 · **Trigger:** Sentry issue 7679494141 · **Outcome:** the reported event needs
no fix; a different, silent defect on the payment path did.

This note exists to stop one specific wrong action. The error text says *"This request might be from
an older or newer deployment"*, the obvious response is to enable Vercel Skew Protection, and that
response is wrong on both counts: it does not address the event that was reported, and it is
actively hazardous in this repo.

## The reported event

| | |
|---|---|
| Title | `Error: Failed to find Server Action. This request might be from an older or newer deployment.` |
| URL | `https://mail.getpropertypro.com/signup` |
| Stored body | 210 B in `request.data` |

**It was an outside multipart POST, not deployment skew.** Established by reading
`apps/web/node_modules/next` (15.5.12), not by inference:

- That exact message — **with no action id in quotes** — is constructed at only two places, both in
  the **non-fetch multipart** branch and both `throw`: `dist/server/app-render/action-handler.js:472`
  and `:608`. The other constructor, `getActionNotFoundError` (`:821`), interpolates the id
  (`Failed to find Server Action "<id>". …`).
- `areAllActionIdsValid` ends `return hasAtLeastOneAction` (`:867`), so a multipart POST carrying
  **no `$ACTION_` field at all** throws it.
- `isFetchAction` requires a string `Next-Action` header (`dist/server/lib/server-action-request-meta.js:38`),
  so the request had none.
- We never send such a request ourselves: `encType` does not appear anywhere in `apps/web/src`, and
  the three `<form … method="POST">` in the demo pages are URL-encoded, which bails out at `:335`.

Any unauthenticated multipart POST to any page path, on any subdomain, reproduces it. That is
consistent with a scanner, which also explains the `mail.` host. `#1098` already deletes
`event.request.data` at the `scrubServerEvent` chokepoint, so no *new* event of this class carries a
body; the stored one predates that fix and ages out with 90-day retention.

> **Superseded claim.** An earlier session recorded this body as "a
> `createCheckoutSession(signupRequestId)` payload". The audit script deliberately never printed
> bodies, so that was inferred, and the message shape above disproves it.

## The inversion: real skew is silent, not noisy

Next does **not** throw for programmatic *fetch* actions — the path all three of our Server Actions
use. `handleUnrecognizedFetchAction` (`:310`) warns and returns 404 +
`x-nextjs-action-not-found`, commented in Next's own source:

> "If the deployment doesn't have skew protection, this is expected to occasionally happen, so we
> use a warning instead of an error."

The client then throws `UnrecognizedActionError`
(`dist/client/components/router-reducer/reducers/server-action-reducer.js:64-70`) — **it does not
self-heal.** `(public)/signup/checkout/page.tsx` flattens that into
`setError('Failed to start checkout. Please try again.')` with no logging and no capture.

So the noisy event in Sentry was harmless, and the harmful case produced **no signal at all**.

## What was actually wrong

Every entrance to `/signup/checkout` was a client-side navigation, so the page never received a
fresh bundle, while `createCheckoutSession` fires from a mount effect:

| Entry | Was | Stale window |
|---|---|---|
| `verify-email-content.tsx` poll success | `router.push` | 5 min (`MAX_POLLS 60` × `POLL_INTERVAL_MS 5000`) |
| `verify-email-content.tsx` resend 409 | `router.push` | unbounded |
| `signup-form.tsx` "Proceed to Checkout" | `<Link>` | unbounded |

Production ships **8–18 times a day**, and every deploy rotates Server Action ids. The idle step is
"wait for your verification email" — exactly where a tab sits.

**Fix:** all three now perform a document navigation, so checkout always runs with a bundle served
seconds earlier. Safe by construction — on an id miss the action never executes, so no
`pending_signups` row and no Stripe session are touched, and a reload is a clean retry.

## Why not Skew Protection

1. **It does not fix the reported issue.** Nothing pins a scanner's multipart POST to a deployment.
2. **It is not free here.** Vercel pins a browser to its original deployment via the `__vdpl` cookie,
   default max-age **30 days**. This repo applies **contract** migrations on the premise that the old
   code that read a dropped column is no longer live (`.claude/rules/migration-safety.md`). At 8–18
   deploys/day, keeping old server code reachable for weeks falsifies that premise.

The Vercel plan is `pro`, so the feature *is* available, and its current state is readable only from
the dashboard or `vercel project protection` — not from the repo. If it is ever enabled, use a short
`--skew-max-age` and revisit contract-migration timing first.

## Deliberately not done

- **No Sentry filter** for this error class. One event in 90 days, the body leak is already closed,
  and an `ignoreErrors` entry would also hide *genuine* skew if anyone later adds a
  `<form action={serverAction}>` (the only shape that reaches the throwing branch).
- **`createCheckoutSession` not converted to a route handler.** That is the true structural fix —
  route handlers are URL-addressed and immune to id rotation — but it costs a contract, tests and
  `runRoute` compliance for marginally more benefit than the navigation change.
- **No host hardening.** Separately real and unrelated to this issue: `RESERVED_SUBDOMAINS` is inert
  on the request path (`middleware.ts:672` is an empty block; `:844`/`:1072`/`:1125` only *suppress*
  work; the only enforcement is `signup.ts:70`, at slug-claim time), so arbitrary subdomains serve
  the genuine `/signup` over the wildcard certificate. `#1103` did not change that.
- **Abandoned-signup squat**, found in passing: nothing can ever set `pending_signups.status =
  'expired'`, so an `email_verified` row holds its `candidate_slug` and email indefinitely. Its own
  issue.

## Verification limit worth knowing

No test can distinguish `<a>` from `<Link>` in the DOM — both render an anchor. The document-load
requirement is held by comments at the call sites and by this note, not by an assertion. The
`verify-email-content` tests do guard the two `router.push` sites: they assert
`window.location.assign`, and `useRouter` is deliberately absent from their `next/navigation` mock,
so reintroducing `router.push` fails loudly rather than passing.

---

# Addendum — host handling, 2026-09-09

Closing the "no host hardening" item above turned up a larger defect and one
narrower fix. Recorded here because both start from the same root confusion:
`RESERVED_SUBDOMAINS` mixes names **nobody should serve** (`mail`,
`autodiscover`) with names **we serve ourselves** (`www`, `pm`, `app`, `login`),
and different parts of the codebase read the list to mean different things.

## 1. The marketing site was de-indexed (fixed)

Production 307s the apex to `www`, `www` is in the reserved list, and
`robots.ts` answered `disallow: '/'` for reserved hosts with `sitemap.ts`
returning `[]` — on the only host anyone reaches. Live since #883 (2026-07-30);
`www` was in the original ten-entry list, so #1103 did not cause it.

Fixed by having both files consult `isApexHost`, which already encoded
"apex or www or localhost is us" for middleware and was the one piece of
host-policy code they never used.

**Do not fix this by flipping the Vercel redirect to `www → apex`.** It needs no
code and matches what the docs claimed, but the apex redirects *everything*
including `/api`, so it breaks `production-health.yml` (`curl -fsS`, no `-L`)
and the Forward Email inbound webhook, whose URL is a live DNS TXT record
pointing at `www`. See `docs/DEPLOYMENT.md` §5.1.

## 2. `/signup` was served on every hostname (fixed)

Nothing on the request path ever rejected a label — the reserved flag only
*suppresses* tenant resolution (`middleware.ts:672` is an empty block;
`:844`/`:1072`/`:1125` only skip work), and the sole enforcement is
`signup.ts:70`, at slug-claim time. So the genuine signup form was served, 200,
on `mail.`, on `pm.`, on any tenant's subdomain, and on labels nobody has
registered — each minting a `.getpropertypro.com`-scoped session.

`shouldCanonicaliseSignupHost` now 307s `/signup*` to the canonical origin.
Two exemptions are load-bearing and must not be "simplified" away:

- **`isApexHost`** spares apex, `www`, `localhost`, `127.0.0.1`. `www` is where
  production serves, so redirecting it would loop.
- **The under-root test** spares FOREIGN hosts — `*.vercel.app` previews and
  verified community custom domains. Removing it redirects every PR preview of
  the signup flow to production.

307 rather than 308: browsers cache a permanent redirect hard, and which host is
canonical is still unsettled (see `DEPLOYMENT.md` §5.1).

## 3. Deliberately still not done

A blanket host gate for all app-class paths. `pm.getpropertypro.com/pm/dashboard/…`
is a live authenticated surface pinned by
`apps/web/__tests__/auth/middleware-no-tenant-redirect.test.ts:142-148`, and
`admin.getpropertypro.com` is a separate Vercel project that never reaches this
middleware at all. The reserved list cannot be read as "not us" without breaking
our own surfaces — which is exactly the mistake that produced defect 1.
