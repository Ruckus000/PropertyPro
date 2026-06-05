# Portfolio Templates — Design Spec

**Date:** 2026-06-04
**Feature flag:** `hasSitePortfolioTemplates` (operations_plus)
**Status:** Design approved, pending implementation plan
**Spec lineage:** Phase 2 of [2026-05-26-property-landing-page-design.md](./2026-05-26-property-landing-page-design.md) §Ph2-2

---

## Context

This is the **last** remaining property-landing Phase-2 feature (§Ph2-2: *"Bulk-apply mechanism for
PM-managed multi-community brands; ~5d"*). The flag `hasSitePortfolioTemplates` exists in
`CommunityFeatures` but is inert everywhere.

**The need:** a property manager (PM) managing many community associations has no way to apply a
consistent look across their portfolio — they re-set colors/fonts/layout/logo on each community by
hand. This feature lets a PM **save a polished community's branding as a named template** and
**bulk-apply it across the communities they manage**.

**The critical context finding:** there is **no PM-company / org entity** in the schema. A PM's
"portfolio" is the set of communities where they hold the `pm_admin` role, resolved via
`findManagedCommunitiesPortfolioUnscoped(userId)` ([packages/db/src/queries/pm-portfolio.ts](../../../packages/db/src/queries/pm-portfolio.ts)).
There is a `billing_groups` table (one `owner_user_id` per PM, `communities.billing_group_id` FK) but
it is one-owner-only and not always populated — the closest thing to an org, but ambiguous for
non-owner admins. This shaped D1.

---

## Locked decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **User-owned template library** (`owner_user_id`), NOT org- or community-scoped | No org entity exists; user identity is unambiguous; mirrors `billing_groups.owner_user_id`; the "portfolio" power comes from the apply step (managed-community set), not from ownership. Team-sharing deferred. |
| D2 | **Captures branding tokens + the wordmark logo** | A PM managing *distinct* associations wants a consistent *look* (colors/fonts/layout/theme), plus their management logo. Captured: `primaryColor`, `secondaryColor`, `accentColor`, `fontHeading`, `fontBody`, `layoutId`, `themePresetSlug`, `tagline`, `customCssOverrides`, `customEmailFooter`, `siteLogoPath`. NOT: `logoPath` (auth avatar — community-specific), site blocks (per-community content), `assetsBytesUsed`. |
| D3 | **One-time push apply** (no stored community→template link) | Different communities can get different templates via selective applies; communities remain individually editable afterward. Persistent assignment + re-sync deferred (heavier: drift handling, unbind story). |
| D4 | **Gated to `operations_plus` only** | Top tier ($499) = de-facto "Enterprise", matching the spec's "PM/Enterprise" positioning and keeping this above custom domain (professional+). Management gated by "user holds the feature in ≥1 managed community"; apply does not additionally require each target on that tier. |
| D5 | **Apply is a live, destructive re-skin** | `communities.branding` has no draft/publish cycle — branding is live the instant it is written. So apply requires a confirm step + per-community result reporting. No undo in v1. |
| D6 | **Template owns its own logo copy** | On create-from-community, copy the community's processed wordmark bytes into a stable template path (`documents/portfolio-templates/{templateId}/site-logo.webp`) so the template survives the source community changing/deleting its logo. On apply, copy the *template's* logo into each target. |

---

## Architecture

### Data model — migration 0013, `site_portfolio_templates` (user-owned, RLS by owner)

Mirrors the `user_preferences` (migration 0011) user-owned + RLS-`auth.uid()` pattern.
- `id bigserial PK`, `owner_user_id uuid NOT NULL`, `name text NOT NULL`,
  `branding jsonb NOT NULL` (the D2 captured subset), `site_logo_path text` (template-owned copy,
  nullable), `created_at`, `updated_at`, `deleted_at timestamptz`.
- RLS: select/insert/update/delete `WHERE owner_user_id = auth.uid()`.
- NOT `community_id`-scoped → service reads/writes via `createUnscopedClient` (`@propertypro/db/unsafe`)
  with an `// AUTHZ:` contract (routes authorize ownership), exactly as the custom-domain service does.

### Storage / logo handling (reuses the existing branding pipeline)

Branding logos live in the **`documents` bucket** at `communities/{id}/branding/site-logo.webp` and are
**not** `assetsBytesUsed`-quota-counted (verified). There is **no native Supabase `.copy()`** — the
established pattern is download-presigned-GET → re-upload-presigned-PUT via the service-role admin
client (see `processAndStoreBrandingImage`, [apps/web/src/app/api/v1/pm/branding/route.ts](../../../apps/web/src/app/api/v1/pm/branding/route.ts)).
A reusable `copyStorageObject(bucket, fromPath, toPath)` encapsulates this. No quota accounting is
needed for logo copies (consistent with current branding behavior).

### Create / apply flow

- **Create (MVP = from an existing community):** snapshot the community's captured branding fields into
  a new row + copy its wordmark into the template's storage path. Plus rename, delete (soft-delete +
  purge the template logo via `deleteStorageObject`). Build-from-scratch deferred.
- **Apply (bulk, one-time push):** pick a template → pick target communities (checkbox list from the
  managed set) → **confirm** ("replaces colors, fonts, layout, theme, tagline, and logo on N live
  sites") → per target concurrently (`Promise.allSettled`): merge captured fields into
  `communities.branding`, copy the template logo → target canonical path, set `siteLogoPath`,
  `logAuditEvent` → return a per-community result array (same shape as `pm/bulk/announcements`).

### Surfaces

New PM nav item **"Templates"** → `/pm/portfolio/templates`. A1 routes under
`/api/v1/pm/portfolio/templates` (GET/POST/PATCH/DELETE) + `/[id]/apply` (POST). Service
`site-portfolio-template-service.ts`.

### Gating

Enable `hasSitePortfolioTemplates: true` on `operations_plus` (`plan-features.ts`) and all three
community types (`community-features.ts`); `getEffectiveFeatures` ANDs them. Management routes gate by
`isPmAdminInAnyCommunity` + the user holding the feature in ≥1 managed community.

---

## Out of scope (future)

Build-template-from-scratch editor; persistent community→template assignment + re-sync; snapshot/undo
before apply; capturing site blocks or the 400×400 auth avatar; billing-group (team) sharing.
