# Phase 1 Code Audit Report — TuringMind Methodology

**Branch:** `phase-1/unified`
**Date:** 2026-03-18
**Scope:** 118 files changed, 13,068 insertions vs `main`
**Sub-phases:** 1A (Payments), 1B (Emergency Notifications), 1C (Violations), 1D (E-Voting)

---

## Summary

| Agent | Found | Reported | Filtered | Critical | Warning | Medium |
|---|---|---|---|---|---|---|
| Bugs | 8 | 5 | 3 | 3 | 2 | 0 |
| Security | 6 | 5 | 1 | 2 | 3 | 0 |
| Compliance | 8 | 6 | 2 | 2 | 4 | 0 |
| Architecture | 9 | 7 | 2 | 0 | 4 | 3 |
| TypeScript | 9 | 5 | 4 | 1 | 4 | 0 |
| **Total** | **40** | **28** | **12** | **8** | **17** | **3** |

After deduplication across agents: **18 unique issues** (6 Critical, 9 Warning, 3 Medium).

---

## Critical Issues (95-100) — Must Fix Before Merge

### C1. `owners_only` emergency broadcasts deliver to zero recipients — Confidence: 97
**File:** `apps/web/src/lib/services/emergency-broadcast-service.ts:117`
**Agents:** Bugs, Security, Compliance

`isAudienceMatch` checks `role === 'resident'` but the DB stores legacy role values (`owner`, `tenant`, `board_member`, etc.). No user has role `'resident'`, so `owners_only` broadcasts silently resolve to **0 recipients**. This is a complete functional failure of a life-safety feature.

```typescript
// Current (broken)
if (audience === 'owners_only') return role === 'resident' && opts?.isUnitOwner === true;

// Fix
if (audience === 'owners_only') return role === 'owner';
```

---

### C2. In-memory OTP rate limiting is ineffective on Vercel — Confidence: 97
**File:** `apps/web/src/app/api/v1/phone/verify/send/route.ts:17`, `confirm/route.ts:22`
**Agents:** Bugs, Security, TypeScript

`otpCooldownCache` and `otpAttemptCache` are module-level `Map` instances. On Vercel's serverless model, each cold start or different instance gets an empty map. The 60-second cooldown and 5-attempt lockout are bypassed entirely across instances.

**Fix:** Replace with Vercel KV (Redis), Upstash, or a Supabase table to persist OTP attempt state.

---

### C3. Elections schema not exported from `schema/index.ts` — Confidence: 100
**File:** `packages/db/src/schema/index.ts`
**Agent:** Compliance

The `elections.ts` schema defines 5 tables (`elections`, `electionCandidates`, `electionBallots`, `electionProxies`, `electionEligibilitySnapshots`) but none are exported from the barrel file. Any code importing elections types from `@propertypro/db` will fail.

**Fix:** Add `export * from './elections';` and corresponding `$inferSelect`/`$inferInsert` type exports.

---

### C4. Twilio `response.json()` on success path can abort entire SMS batch — Confidence: 82
**File:** `apps/web/src/lib/services/sms/twilio-provider.ts:95`
**Agent:** Bugs

In `TwilioProvider.sendSms()`, the success-path `response.json()` has no try/catch. A malformed JSON response from Twilio throws, propagating through `Promise.all` in `sendBulkEmergencySms` and aborting the entire 20-recipient batch. Remaining batches never execute. This is life-safety infrastructure.

**Fix:** Wrap `response.json()` in `.catch(() => null)` with a fallback error result.

---

### C5. `require('crypto')` in ESM module — latent Edge Runtime failure — Confidence: 95
**File:** `apps/web/src/lib/services/sms/twilio-provider.ts:124`
**Agents:** Security, Architecture, TypeScript

`validateWebhookSignature` uses CommonJS `require('crypto')` — the only CJS require in the entire `apps/web/src` tree. If the webhook route is ever moved to Edge Runtime, this will throw `require is not defined`, silently disabling webhook signature validation (fails open → accepts all requests).

**Fix:** Replace with top-level ESM import: `import { createHmac, timingSafeEqual } from 'crypto';`

---

### C6. `updateBroadcastAggregates` double-counts delivery stats — Confidence: 85
**File:** `apps/web/src/lib/services/emergency-broadcast-service.ts:517`
**Agent:** Bugs

Counts `smsStatus === 'delivered' || emailStatus === 'sent'` as `deliveredCount`, mixing confirmed SMS delivery with unconfirmed email acceptance. A single recipient can inflate both `deliveredCount` and `sentCount`. Admin dashboard shows inflated delivery stats for emergency broadcasts.

**Fix:** Count SMS and email channels separately with clearer semantics.

---

## Warning Issues (80-94) — Should Fix

### W1. Emergency broadcast service uses full-table scans for single-record lookups — Confidence: 88
**File:** `apps/web/src/lib/services/emergency-broadcast-service.ts:224,399,466,506,538,595`
**Agents:** Bugs, Architecture

Every function calls `scoped.query(emergencyBroadcasts)` to fetch the entire community's broadcast table, then `.find()` in JS. Same for recipients. At scale (500 recipients × N broadcasts × webhook callbacks), each Twilio status webhook triggers a full table scan. The violations and finance services correctly use `scoped.selectFrom()` with `where` clauses.

**Fix:** Replace `scoped.query(table)` + `.find()` with `scoped.selectFrom(table, {}, eq(table.id, id))`.

---

### W2. Unsafe bracket-access casts throughout `emergency-broadcast-service.ts` — Confidence: 83
**File:** `apps/web/src/lib/services/emergency-broadcast-service.ts` (multiple locations)
**Agent:** TypeScript

Typed ORM rows accessed via untyped bracket indexing (`broadcast['title'] as string`) rather than typed properties. TypeScript cannot catch field name typos, and every value is silently `unknown` before the `as` cast. Inconsistent with `violations-service.ts` which uses typed `selectFrom<T>`.

---

### W3. Phone number PII echoed in OTP responses — Confidence: 80
**File:** `apps/web/src/app/api/v1/phone/verify/send/route.ts:88`, `confirm/route.ts:112`
**Agent:** Security

Both endpoints return the raw E.164 phone number in JSON responses (`{ sent: true, phone }`). This leaks to browser dev tools, Sentry breadcrumbs, and CDN logs. The project already has `maskPhone()` in `@/lib/utils/phone`.

**Fix:** Return `maskPhone(phone)` instead of raw phone.

---

### W4. `BroadcastComposer` undo/cancel doesn't handle API failure — Confidence: 80
**File:** `apps/web/src/components/emergency/BroadcastComposer.tsx:109-116`
**Agent:** TypeScript

`handleUndo` calls `cancelMutation.mutate()` fire-and-forget and immediately resets UI state. If the cancel API fails (undo window expired), the UI shows "canceled" while the broadcast proceeds to send. This is a life-safety UX bug.

**Fix:** Use `mutate()` callbacks: reset state on `onSuccess`, show error on `onError`.

---

### W5. `BroadcastComposer` auto-send useEffect can double-fire — Confidence: 85
**File:** `apps/web/src/components/emergency/BroadcastComposer.tsx:46-63`
**Agent:** TypeScript

The countdown `useEffect` includes `sendMutation` in deps (identity changes every render). When countdown hits 0, `sendMutation.mutate()` can fire multiple times in the transition window before `step` changes to `'sent'`. The eslint-disable comment suppresses the warning.

**Fix:** Add a `hasSentRef` guard or stabilize the mutation reference.

---

### W6. `emergency_broadcast_recipients` missing `deletedAt` column — Confidence: 88
**File:** `packages/db/src/schema/emergency-broadcast-recipients.ts`
**Agent:** Compliance

Table is tenant-scoped (has `community_id` FK) but missing `deletedAt` — violates the CLAUDE.md soft-delete convention. Every other tenant-scoped table has it.

---

### W7. `violations/route.ts` creates its own scoped client alongside service calls — Confidence: 85
**File:** `apps/web/src/app/api/v1/violations/route.ts:61,106`
**Agent:** Compliance

Route handler creates `createScopedClient(communityId)` directly to call `getActorUnitIds()`, then also calls service functions that create their own scoped clients. Double-instantiation is wasteful and deviates from the convention that routes delegate all DB work to services.

---

### W8. `finance-service.ts` ↔ `violations-service.ts` bidirectional coupling — Confidence: 82
**Files:** `apps/web/src/lib/services/finance-service.ts:27`, `violations-service.ts`
**Agent:** Architecture

`finance-service` imports `markMatchingViolationFinePaid` from `violations-service`, creating tight peer coupling. The payment webhook handler reaches directly into the violations domain.

**Fix:** Extract to a cross-domain helper or use event-driven decoupling.

---

### W9. Migration `0102_elections_schema.sql` header comment says "0101" — Confidence: 100
**File:** `packages/db/migrations/0102_elections_schema.sql:1`
**Agent:** Compliance

Copy-paste error: file is `0102` but comment reads `-- 0101: Elections schema`.

---

## Medium Issues (70-79) — Consider Fixing

### M1. `getActorUnitIds` duplicated in 4 domain modules — Confidence: 88
**Files:** `finance/common.ts`, `violations/common.ts`, `logistics/common.ts`, `work-orders/common.ts`
**Agent:** Architecture

Identical function duplicated 4 times, each delegating to `listActorUnitIds` from `@/lib/units/actor-units`. Should be exported once from the source module.

---

### M2. `AssessmentFrequency` type defined in 1400-line service file — Confidence: 76
**Files:** `finance-service.ts:34`, imported by `assessment-automation-service.ts`
**Agent:** Architecture

Domain constant type belongs in `@propertypro/shared`, not buried in a large service file.

---

### M3. PDF helper functions duplicated across `violation-notice-pdf.ts` and `finance-pdf.ts` — Confidence: 74
**Agent:** Architecture

Both files implement identical `escapePdfText`, `wrapText`, `formatDate`, `toUsd` helpers. Should be extracted to a shared `pdf-primitives.ts`.

---

## Filtered Issues (Not Reported)

| Issue | Reason | Agent |
|---|---|---|
| Quarterly modulo produces negative results | False positive — `(-N) % 3 === 0` is correct for multiples of 3 | TypeScript |
| Stripe Connect complete endpoint auth ordering | Defense-in-depth; start flow already enforces membership | Bugs |
| `Math.abs(amountCents)` on positive value | No-op on Stripe's always-positive amounts | Bugs |
| `window.location.reload()` in ViolationDetailView | Low confidence (72) — UX annoyance, not a bug | TypeScript |
| `notification_preferences` missing `deletedAt` | May be pre-existing (not introduced in Phase 1) | Compliance |
| Timing oracle in HMAC length comparison | Base64 HMAC-SHA1 is always 28 chars, making this unexploitable | Security |
| Assessment-automation 3x community query | Below threshold (70) — boilerplate, not a bug | Architecture |
| `createMutation.mutateAsync` missing try/catch | TanStack Query captures errors; browser handler warns but doesn't crash | TypeScript |
| CSRF on state-mutating endpoints | Next.js App Router + Supabase cookies provide CSRF protection | Security |
| `ViolationDetailView` hard reload | Below threshold | TypeScript |
| Multiple assessment service helpers | Below threshold | Architecture |
| `handleCreateDraft` unhandled rejection | Below threshold | TypeScript |

---

## Priority Fix Order

| Priority | Issue | Impact | Effort |
|---|---|---|---|
| **P0** | C1: `owners_only` role mismatch | Life-safety feature broken | 5 min |
| **P0** | C2: In-memory rate limiting | Security control ineffective | 2-4 hr |
| **P0** | C4: Twilio JSON parse abort | Emergency SMS batch failure | 15 min |
| **P1** | C3: Elections barrel export | Schema unusable downstream | 10 min |
| **P1** | C5: `require('crypto')` | Latent failure, easy fix | 5 min |
| **P1** | C6: Delivery stats double-count | Misleading admin dashboard | 30 min |
| **P1** | W1: Full-table scans | Perf degradation at scale | 1 hr |
| **P2** | W3: PII in responses | Data protection concern | 5 min |
| **P2** | W4: Cancel doesn't handle failure | UX gap on life-safety feature | 15 min |
| **P2** | W5: Auto-send double-fire | Emergency SMS sent twice | 15 min |
| **P2** | W6: Missing `deletedAt` | Convention violation | 15 min |
| **P2** | W2: Unsafe bracket casts | Type safety gap | 1 hr |
| **P3** | W7: Double scoped client | Wasteful pattern | 20 min |
| **P3** | W8: Cross-service coupling | Maintainability | 30 min |
| **P3** | W9: Migration comment typo | Correctness | 1 min |
| **P3** | M1-M3: Deduplication | Maintainability | 1 hr |

---

## Methodology

This audit applied the [TuringMind Code Review](https://github.com/turingmindai/turingmind-code-review) methodology:
- **5 specialized agents** run in parallel (Bugs, Security, Compliance, Architecture, TypeScript)
- **Confidence scoring** (0-100) with severity tiers: Critical (95-100), Warning (80-94), Medium (70-79)
- **False-positive filtering**: pre-existing issues, linter territory, intentional patterns, below-threshold findings
- **Diff-focused**: only Phase 1 code analyzed (not pre-existing codebase)
