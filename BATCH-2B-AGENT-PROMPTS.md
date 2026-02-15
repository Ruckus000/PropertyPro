# Phase 2 Batch 2B — Agent Prompts

Generated: 2026-02-14
Previous batch: Batch 2A (P2-40, P2-31, P2-32, P2-32a, P2-37, P2-41, P2-42) — all merged to `main` via commit `444185e`.

## Batch Overview

Two tasks with all dependencies satisfied. These can run in parallel on separate branches. No schema migrations in this batch — lower conflict risk than Batch 2A.

After this batch, P2-34 (Stripe Integration) becomes unblocked, which is the highest-priority remaining item on the critical path to a paying customer.

**Merge order:** No preference — P2-33 and P2-36 have no inter-dependencies.

**After this batch completes, the following tasks become unblocked:**
- P2-34 + P2-34a (Stripe Integration + Payment Failure Handling) — blocked on P2-33
- P2-44 (Apartment Demo Seed) — blocked on P2-36 + P2-37 (both now done)

---

## Pre-Flight (run before any agent starts)

```bash
cd /path/to/PropertyPro
git checkout main && git pull
pnpm install --frozen-lockfile
pnpm build && pnpm typecheck && pnpm lint && pnpm test
set -a; source .env.local; set +a; pnpm test:integration:preflight
```

All commands must pass. The post-merge fix from Batch 2A (`444185e`) must be verified green before branching.

---

## Agent 1: P2-33 Self-Service Signup

**Priority: CRITICAL PATH — unblocks Stripe → Provisioning → Onboarding Wizards**

```
Branch: feat/p2-33-self-service-signup

You are implementing P2-33 (Self-Service Signup) for PropertyPro Florida, a multi-tenant SaaS platform for Florida condo/HOA/apartment compliance.

BEFORE YOU START — READ THESE FILES IN ORDER:
1. AGENTS.md (root) — mandatory warnings and patterns for all agents
2. IMPLEMENTATION_PLAN.md — find "Task: P2-33" (line ~1200) for acceptance criteria
3. specs/phase-2-multi-tenancy/33-self-service-signup.md — full spec
4. packages/shared/src/features/community-features.ts — community feature flags (use these, NEVER check type directly)
5. packages/shared/src/features/types.ts — CommunityFeatures type definition
6. packages/shared/src/features/get-features.ts — getFeaturesForCommunity() helper
7. packages/shared/src/index.ts — COMMUNITY_TYPE_VALUES, COMMUNITY_ROLES_BY_TYPE, reserved subdomain list
8. apps/web/src/middleware.ts — existing tenant resolution, reserved subdomain handling, auth checks
9. apps/web/src/lib/api/community-membership.ts — requireCommunityMembership pattern
10. apps/web/src/app/(marketing)/ — marketing pages created in Batch 2A (landing page with CTA to /signup)
11. apps/web/src/app/legal/terms/page.tsx — legal pages (signup requires Terms acceptance)
12. packages/email/src/templates/ — existing email templates for reference pattern
13. docs/adr/ADR-001-canonical-role-model.md — role constraints by community type

WHAT TO BUILD:
A self-service signup flow where a board president or site manager creates their community account.

The flow:
1. User clicks "Get Compliant Now" on marketing page → navigates to /signup
2. Multi-step signup form collects: community name, community type, address, county, unit/parcel count, primary contact email, password
3. Subdomain auto-generated from community name (lowercase, hyphenated, alphanumeric only)
4. Real-time subdomain availability check (debounced, queries communities table)
5. Reserved subdomains rejected immediately (use the list from packages/shared — admin, api, www, mobile, pm, app, dashboard, login, signup, legal)
6. Community type selection (Condo §718 / HOA §720 / Apartment) with brief explanation of each
7. Terms of Service checkbox (links to /legal/terms)
8. On submit: create user via Supabase Auth (supabase.auth.signUp), create community record, assign initial role (board_president for condo/HOA, site_manager for apartment per ADR-001)
9. Send email verification via Resend (NOT Supabase default — see AGENTS.md Email section)
10. Redirect to /auth/verify-email with "check your inbox" message
11. After email verification, redirect to Stripe checkout (P2-34 will build this — for now redirect to a placeholder /onboarding/pending page that says "Payment setup coming soon")

Files to create:
- apps/web/src/app/(auth)/signup/page.tsx — signup page
- apps/web/src/app/(auth)/signup/layout.tsx — auth layout (no tenant context needed)
- apps/web/src/components/signup/signup-form.tsx — multi-step form component
- apps/web/src/components/signup/community-type-selector.tsx — type picker with descriptions
- apps/web/src/components/signup/subdomain-checker.tsx — real-time availability with debounce
- apps/web/src/lib/actions/signup.ts — server action: validate, create user, create community, assign role
- apps/web/src/app/api/v1/signup/check-subdomain/route.ts — GET endpoint for subdomain availability
- apps/web/src/app/(auth)/verify-email/page.tsx — "check your inbox" page (may already exist — check first)
- apps/web/src/app/onboarding/pending/page.tsx — placeholder for post-verification redirect
- packages/email/src/templates/welcome-verification-email.tsx — verification email template
- apps/web/__tests__/signup/ — test directory

CRITICAL IMPLEMENTATION DETAILS:

1. Subdomain generation:
   - Strip non-alphanumeric except hyphens
   - Lowercase
   - Collapse multiple hyphens
   - Trim hyphens from start/end
   - Max length: 63 characters (DNS subdomain limit)
   - If auto-generated subdomain is taken, append incremental suffix (-1, -2, etc.)

2. Community creation (in the server action):
   ```
   // Pseudocode — use actual Drizzle insert
   const community = await db.insert(communities).values({
     name, slug: subdomain, communityType, timezone: 'America/New_York',
     addressLine1, city, state: 'FL', zip, county
   });
   // Then create user_role
   const role = COMMUNITY_ROLES_BY_TYPE[communityType][0]; // board_president or site_manager
   await db.insert(userRoles).values({ userId, communityId, role });
   // Then seed default document categories for the community type
   ```

3. Default document categories: After community creation, seed the system document categories for the community type. Look at scripts/seed-demo.ts for the pattern — it creates categories per community type (condo gets declaration, bylaws, etc.; apartment gets lease_docs, community_handbook, etc.).

4. Password requirements: Minimum 8 characters. The statute requires "unique username and password" (§718.111(12)(g)) so password-based auth is mandatory.

5. State field: Default to 'FL' and make it non-editable. This is a Florida-specific product.

6. Email verification: Use Resend template, NOT Supabase's default verification email. The verification link should use Supabase's generateLink({ type: 'signup' }) to get the token, then embed it in a branded Resend email.

WHAT NOT TO BUILD:
- Stripe checkout (P2-34)
- Provisioning pipeline (P2-35)
- Onboarding wizard (P2-38/P2-39)
- Payment UI of any kind
The signup flow ends at "verification email sent → placeholder pending page." Stripe picks up from there in the next task.

FORM DESIGN:
- Use shadcn/ui form components (already in the project)
- Clear validation errors shown inline
- Disable submit button until all required fields valid
- Loading state on submit (prevents double submission)
- Professional appearance — this is the first impression for a board president evaluating the product

Tests:
- Component: form renders, validates required fields, shows inline errors
- Component: community type selector shows all 3 types with descriptions
- Component: subdomain checker shows available/unavailable/reserved states
- Unit: subdomain generation from community name (edge cases: special characters, reserved words, length limit)
- Unit: server action validates input, rejects weak passwords, rejects duplicate emails
- Route: subdomain check endpoint returns correct availability
- Integration: signup creates user + community + role in correct order

ACCEPTANCE GATE:
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

---

## Agent 2: P2-36 Apartment Operational Dashboard

**Priority: Medium (unblocks P2-44 Apartment Demo Seed)**

```
Branch: feat/p2-36-apartment-dashboard

You are implementing P2-36 (Apartment Operational Dashboard) for PropertyPro Florida. This dashboard replaces the compliance dashboard for apartment community types.

BEFORE YOU START — READ THESE FILES IN ORDER:
1. AGENTS.md (root) — mandatory warnings and patterns
2. IMPLEMENTATION_PLAN.md — find "Task: P2-36" for acceptance criteria
3. specs/phase-2-multi-tenancy/36-apartment-operational-dashboard.md — full spec
4. packages/shared/src/features/community-features.ts — feature flags (apartment: hasCompliance=false, hasLeaseTracking=true)
5. packages/shared/src/features/get-features.ts — getFeaturesForCommunity() helper
6. apps/web/src/app/(authenticated)/communities/[id]/dashboard/page.tsx — existing dashboard (or similar path — search for dashboard page)
7. apps/web/src/components/dashboard/ — existing dashboard components
8. packages/db/src/schema/leases.ts — lease schema (created in Batch 2A, P2-37)
9. packages/db/src/scoped-client.ts — scoped query builder (EVERY query must use this)
10. apps/web/src/lib/api/community-membership.ts — requireCommunityMembership pattern
11. packages/db/src/schema/enums.ts — all enum definitions including lease status
12. docs/adr/ADR-001-canonical-role-model.md — apartment roles: tenant, site_manager, property_manager_admin

WHAT TO BUILD:
An operational dashboard for apartment communities that shows lease management metrics, occupancy, maintenance, and announcements. This is NOT a compliance dashboard — apartments don't have statutory compliance requirements.

Files to create:
- apps/web/src/app/(authenticated)/communities/[id]/dashboard/apartment/page.tsx — apartment dashboard page
- apps/web/src/components/dashboard/apartment-dashboard.tsx — main dashboard layout
- apps/web/src/components/dashboard/apartment-metrics.tsx — metrics cards (occupancy, maintenance, lease alerts)
- apps/web/src/components/dashboard/lease-expiration-alerts.tsx — upcoming lease expirations list
- apps/web/src/lib/queries/apartment-metrics.ts — scoped queries for dashboard data
- apps/web/__tests__/dashboard/apartment-dashboard.test.tsx — component tests

Dashboard sections:

1. OCCUPANCY OVERVIEW (top row, Card component):
   - Occupied units count / total units
   - Occupancy rate percentage
   - Vacant units count
   - Data source: units table LEFT JOIN active leases

2. LEASE EXPIRATION ALERTS (prominent section):
   - Leases expiring in next 30/60/90 days (configurable tabs or filter)
   - Each alert shows: unit number, tenant name, end date, days remaining
   - Color coding: red (<30 days), yellow (30-60), blue (60-90)
   - Data source: leases table WHERE status='active' AND endDate BETWEEN now AND now+90days
   - Use date-fns for all date calculations [AGENTS #16-17]

3. MAINTENANCE REQUESTS SUMMARY (Card component):
   - Open count, In Progress count, Completed (last 30 days) count
   - Link to full maintenance list
   - Data source: maintenance_requests table (if it exists — check schema; if not, show placeholder)

4. RECENT ANNOUNCEMENTS (Card component):
   - Last 5 announcements for this community
   - Title, date, truncated body
   - Data source: announcements table via scoped client

5. QUICK ACTIONS (bottom row):
   - "Add Tenant" → link to resident management
   - "Post Announcement" → link to announcement creation
   - "Create Maintenance Request" → link to maintenance form (or placeholder if not built yet)

ROUTING & GATING:
- The dashboard page MUST check community type using getFeaturesForCommunity()
- If features.hasCompliance is true (condo/HOA), redirect to the compliance dashboard (or show the existing compliance dashboard)
- If features.hasLeaseTracking is true (apartment), render the apartment dashboard
- NEVER check communityType === 'apartment' directly — use feature flags [AGENTS #34]

QUERY PATTERN:
Every query MUST go through createScopedClient(communityId). Example:
```typescript
const scoped = createScopedClient(communityId);
const activeLeases = await scoped.query(leases, eq(leases.status, 'active'));
```

The scoped client auto-injects community_id filter and deleted_at IS NULL.

DESIGN:
- Use existing Card, Badge components from the design system
- Match the professional tone of the rest of the app
- Responsive: works on tablet and desktop
- Loading skeleton states while data fetches
- Empty states when no leases/announcements exist yet ("No leases tracked yet. Add your first tenant to get started.")

Tests:
- Component: dashboard renders all sections for apartment type
- Component: dashboard does NOT render for condo/HOA type (redirects or shows compliance)
- Component: lease expiration alerts color coding (red/yellow/blue by days remaining)
- Component: empty states render correctly when no data exists
- Unit: apartment metrics queries return correct counts from mock data
- Unit: lease expiration window calculation respects timezone (community.timezone)

ACCEPTANCE GATE:
pnpm build && pnpm typecheck && pnpm lint && pnpm test
```

---

## Post-Batch Merge Protocol

1. Merge both branches (no ordering requirement).
2. Run full verification on `main`:
```bash
pnpm build && pnpm typecheck && pnpm lint && pnpm test
set -a; source .env.local; set +a; pnpm test:integration:preflight
```
3. Update IMPLEMENTATION_PLAN.md — mark P2-33 and P2-36 as complete. ALSO update all Batch 2A tasks that are still showing "Not Started" (P2-30, P2-40, P2-31, P2-32, P2-32a, P2-37, P2-41, P2-42).
4. Record any learnings in AGENTS.md.

## Next Batch Preview (Batch 2C — after this batch merges)

The critical path accelerates:

**P2-34 + P2-34a (Stripe Integration + Payment Failure Handling):**
- This is the biggest remaining task — estimated "Large" effort
- Must be idempotent, handle out-of-order webhooks, verify signatures
- Includes subscription schema, webhook route, checkout action, subscription guard middleware
- Includes email alert sequence for payment failures (Day 0/3/7/cancellation/23)
- Includes graceful degradation rules (public site stays readable during canceled period)
- This is a single-agent task — don't split it

**P2-44 (Apartment Demo Seed):**
- Can run in parallel with P2-34 (no inter-dependency)
- Needs P2-36 (from this batch) + P2-37 (from Batch 2A) — both done

**After P2-34:**
- P2-35 (Provisioning Pipeline) — triggered by Stripe webhook
- Then P2-38 (Apartment Onboarding) + P2-39 (Condo Onboarding) — the finish line for Phase 2
