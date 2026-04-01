# Demo Link Audit Remediation

**Date:** 2026-03-29
**Scope:** 3 code fixes + 2 documentation comments from security audit of demo link generation

## Context

A code audit of the demo link generation pipeline identified 8 potential issues.
After rigorous verification, 3 required code changes and 2 required documentation.
The remaining 3 were false positives or over-engineered solutions (see Rejected Items).

## Fixes

### Fix 1: Strip `auth_token_secret` from API responses (defense-in-depth)

**Problem:** `GET /api/admin/demos` and `GET /api/admin/demos/:id` return the full
`demo_instances` row including `auth_token_secret` (AES-256-GCM ciphertext). While
these endpoints require `super_admin` auth, returning encrypted secrets to the browser
violates least-privilege — the admin UI never needs this field.

**Fix:** Add a `sanitizeDemoRow()` helper in `apps/admin/src/lib/db/demo-queries.ts`
that strips `auth_token_secret` from the row. Apply it in:
- `listDemos()` return mapping (already iterates rows)
- `getDemoById()` — wrap the return

The admin preview pages (`apps/admin/src/app/demo/[id]/preview/page.tsx` and
`apps/admin/src/app/demo/[id]/mobile/page.tsx`) call `getDemoById()` directly on
the server and need the secret for token generation. These must use the raw result,
not the sanitized version. Solution: add a separate `getDemoByIdWithSecret()` function
(or have the preview pages call the existing `getDemoById()` and pass the result
through a different path that doesn't strip the field). Simplest approach: sanitize
in the API route handlers rather than in the query functions, since only 2 route
handlers return data to the client.

**Files:**
- `apps/admin/src/app/api/admin/demos/route.ts` — strip in GET handler
- `apps/admin/src/app/api/admin/demos/[id]/route.ts` — strip in GET and PATCH handlers

### Fix 2: Client-side delete error handling

**Problem:** `DemoListClient.tsx` `handleDelete()` removes the demo from local state
regardless of whether the API call succeeded. If the DELETE returns a 500, the row
disappears from the UI but persists in the database.

**Fix:** Check `response.ok` before updating local state. On failure, keep the row
and surface an error message.

**Files:**
- `apps/admin/src/components/demo/DemoListClient.tsx`

### Fix 3: Document slug-only auth as accepted design

**Problem:** `POST /api/v1/demo/[slug]/enter` grants a full Supabase session to
anyone who knows the demo slug. This is by design (demo links are meant to be
shareable), but the intentionality should be documented.

**Fix:** Add a code comment to the enter route explaining the security model:
slug knowledge = access, demo data is synthetic, slugs contain 6 random hex chars.

**Files:**
- `apps/web/src/app/api/v1/demo/[slug]/enter/route.ts`

### Fix 4: Document phantom email addresses

**Problem:** Demo user emails use `demo-resident@{slug}.getpropertypro.com` which
are unreceivable addresses (no wildcard MX). This is fine since they're only used
as Supabase Auth identifiers, but should be documented.

**Fix:** Add a code comment near the email generation explaining the intent.

**Files:**
- `apps/admin/src/app/api/admin/demos/route.ts`

## Rejected Items (with rationale)

### Rate limiting on demo enter endpoint — ALREADY COVERED

The middleware classifies `POST /api/v1/demo/[slug]/enter` as a `write` route
(30 req/min per IP). While the route is in `isTokenAuthenticatedApiRoute()` (which
exempts it from CSRF origin checks and session-required redirects), the Phase 2
rate limiting at middleware line 474 runs unconditionally for all `read`/`write`
routes inside `isProtectedPath()`. Since `/api/v1` is a protected path prefix,
the enter endpoint IS rate limited. No change needed.

### CSRF protection on demo enter — DISPROPORTIONATE

The demo enter endpoint creates a session for a synthetic demo user with access to
fake data. Login CSRF here gives the attacker... a victim logged into a fake condo
demo. The cost of a full CSRF flow (cookie + hidden field + validation) outweighs
the near-zero risk. Not implemented.

### Missing `communities.deletedAt` WHERE filter in upgrade — FALSE POSITIVE

`computeDemoStatus()` checks `deletedAt` as its second operation
(`if (community.deletedAt) return 'expired'`), before any expiry logic. Both the
upgrade page and self-service API route pass `communities.deletedAt` into this
function and reject `expired` status. The query-level filter is cosmetically
inconsistent with the landing page but functionally redundant.

### Non-transactional delete reorder — DOESN'T HELP

The proposed reorder changes which orphan you get on partial failure without
eliminating the possibility. Auth user deletion is a Supabase API call (not SQL),
so a true DB transaction can't wrap the full operation. The current code is an
admin-only operation; partial failure is retryable. No change needed.
