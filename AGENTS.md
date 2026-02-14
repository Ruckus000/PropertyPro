# PropertyPro Florida — Agent Warnings & Learnings

**Platform:** Compliance and community management for Florida condo/HOA/apartment communities  
**Tech Stack:** Next.js 14+ App Router, TypeScript, Tailwind CSS, Supabase (DB + Auth + Storage), Drizzle ORM, Resend, Stripe, Turborepo + pnpm workspaces, Vercel

These are the persistent "signs next to the slide" — accumulated warnings and learnings that must be read before every iteration.

---

## Supabase & Auth

- **Session availability in Server Components:** Supabase Auth session is not available directly in Server Components. Use `@supabase/ssr` and create a dedicated server client utility that reads cookies from request headers.
- **User roles are per-community, not global:** Roles are keyed by (user_id, community_id) in the `user_roles` table, not stored in Supabase Auth metadata alone. Never assume a user has a single global role.
- **Customizing invite emails:** Supabase's default invite email is generic. Customize via `user_metadata` or use Resend with `generateLink({ type: 'invite' })` for better deliverability and control.
- **Connection strings:** Use the pooled connection string for app queries; use the direct connection for migrations only.

---

## Drizzle & Database

- **Driver selection:** Use `postgres-js` driver, NOT `node-postgres`. The latter is incompatible with PgBouncer.
- **Never modify production schema manually:** All schema changes must go through Drizzle Kit migrations. Disable Supabase's migration UI entirely.
- **Scoped query builder auto-injection:** The scoped query builder must automatically inject `community_id` filter AND `deleted_at IS NULL` on every query.
- **Compliance audit log is append-only:** `compliance_audit_log` is excluded from soft-delete filtering — it's append-only and never deleted.

---

## File Uploads

- **Vercel request body limit:** Vercel enforces a 4.5MB request body limit. Use presigned URLs for direct upload to Supabase Storage instead of streaming files through the API.
- **Validate file types via magic bytes:** Always validate via magic bytes using the `file-type` npm package. Never trust Content-Type headers from the client.
- **PDF text extraction memory constraint:** `pdf-parse` loads the entire PDF into memory. Run this asynchronously outside the upload handler to avoid blocking.
- **File size limits:** Documents max 50MB, images max 10MB.

---

## Multi-Tenancy

- **Community filter on every query:** EVERY query must include a `community_id` filter. Missing it results in a cross-tenant data leak.
- **Always use scoped query builder:** The scoped query builder handles community_id injection automatically. Never use raw Drizzle queries that skip this filtering.
- **Test cross-tenant isolation:** Integration tests must verify that one community cannot access another community's data.

---

## Compliance Engine

- **Dates in UTC, display in local timezone:** All dates are stored as UTC in the database. Convert to community timezone (`communities.timezone` column) at the presentation layer only.
- **Use date-fns for arithmetic:** All date calculations must use `date-fns` for consistency and safety.
- **Edge cases:** Be aware of DST transitions, weekend posting dates, and leap years. Test these scenarios explicitly.
- **Florida timezone split:** Florida spans both Eastern and Central time zones. Timezone is per-community, not per-application.

---

## Next.js & Vercel

- **Configure transpilePackages:** Every internal package must be added to `transpilePackages` in `next.config.ts`.
- **Subdomain routing:** Use query param `?tenant=x` in development; use hostname extraction in production.
- **Reserved subdomains:** Do not use: admin, api, www, mobile, pm, app, dashboard, login, signup, legal.

---

## Tailwind & Design System

- **Extend, don't fight defaults:** Extend the Tailwind theme with custom tokens. Override defaults rather than fighting them.
- **8pt spacing grid:** Map the spacing grid to Tailwind classes: space-1=4px, space-2=8px, etc.
- **Component porting priority:** Port components in priority order: primitives first, then as needed by features.

---

## Stripe

- **Webhook handlers must be idempotent:** Processing the same event twice must be safe. Design handlers to be naturally idempotent or include deduplication logic.
- **Always verify webhook signatures:** Validate the signature before processing.
- **Fetch fresh state from Stripe API:** Inside webhook handlers, fetch the latest state from the Stripe API. Don't rely solely on the webhook payload.
- **Events can arrive out of order:** Assume events may not arrive in chronological order.

---

## Email

- **Set up SPF/DKIM/DMARC in Phase 1:** Configure email authentication records early, not in a later phase.
- **Use Resend for invite emails:** Send invite emails via Resend (not Supabase's built-in invite) for better deliverability control.
- **Check notification preferences:** Verify user notification preferences before sending any non-critical email.
- **Include List-Unsubscribe header:** Include the List-Unsubscribe header to comply with CAN-SPAM and Gmail 2024 requirements.

---

## Community Types

- **Three community types:** condo_718, hoa_720, apartment.
- **Use CommunityFeatures config object:** Map community type to enabled features. Never check type directly in components.
- **Feature checks in components:** Components check `features.hasCompliance`, `features.hasLeaseTracking`, etc.
- **Document access rules:** Use a declarative policy matrix: role × community_type × document_category → allow/deny.
- **Enforce access at query level:** Implement access control in Drizzle where clauses, never at the UI level only.

---

## Testing

- **Tests before implementation is complete:** Tests MUST exist before any implementation is considered complete.
- **Fix implementation, not test assertions:** Never modify test assertions to make them pass. Fix the implementation instead.
- **Integration tests for cross-tenant isolation:** Verify that one community cannot access another community's data.
- **Role-based document filtering coverage:** Ensure specific test coverage for role-based document filtering behavior.

---

## General

- **No escape hatches:** Never use `any` or `@ts-ignore`.
- **Wrap API routes:** Every API route uses `withErrorHandler` wrapper.
- **Log audit events:** Every mutation calls `logAuditEvent` for compliance-relevant actions.
- **Generate request tracing ID:** Generate a UUID per request in middleware for request tracing (X-Request-ID header).

---

## Learnings

Add entries here as failures are encountered during Ralph loops. Format:
```
- [YYYY-MM-DD] [spec-id]: description of what went wrong and how to avoid it
```

- [2026-02-11] [P1-27b]: `claude -p` + wrapper-based multiline prompts can silently stall or parse incorrectly (e.g., prompt consumed by flags). For Ralph loops, run from the task worktree (`pwd` + `git branch --show-current`), and use direct `claude "..."` prompt invocation unless print-mode piping is explicitly required.
- [2026-02-12] [P1-16/P1-26]: Manual SQL migrations without corresponding Drizzle `meta/_journal.json` entry + snapshot cause `db:generate` to re-emit already-created tables (e.g., duplicate `invitations`). Keep journal/snapshots in lockstep with manual migration files before generating subsequent migrations.
- [2026-02-13] [Gate2-evidence]: `psql` 14.x can fail against Supabase pooler in some environments; for Gate 2 evidence capture, use `pnpm seed:verify` (`tsx` + `postgres-js`) as the canonical SQL verification path and treat `psql` as optional.
