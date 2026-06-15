# Help-Fix Batch H — categories: pm

Articles directory scope: `apps/web/src/content/help/pm/`

Item counts: 4 Critical / 21 High / 7 Medium / 5 Low — 37 total.

Work article-by-article: apply every item that targets the same .mdx file in one editing pass, then tick its boxes here.


## Critical

- [x] **[Critical]** `pm/sending-bulk-announcements-and-documents.mdx:39` — The entire bulk flow is unreachable — BulkAnnouncementDialog/BulkDocumentDialog are imported by no page, no nav entry, no community-selection UI exists. → **Fix:** wire the dialogs into the PM dashboard, or rewrite the article as API-only/coming-soon; remove all "Open the PM dashboard → Bulk announcements" instructions. *Evidence:* grep shows both dialogs self-referenced only; `PmDashboardClient.tsx`/`PortfolioTable.tsx` have no bulk trigger or rowSelection.
- [x] **[Critical]** `pm/adding-cams-and-board-admins.mdx:142` — 2FA section fabricated — no MFA/TOTP/authenticator support exists (Supabase email+password only). → **Fix:** delete the section or replace with "2FA is not yet available; use strong unique passwords." *Evidence:* grep factor/mfa/totp across `apps/web/src` — nothing; CLAUDE.md auth stack.
- [x] **[Critical]** `pm/adding-cams-and-board-admins.mdx:71` — "use the PM dashboard's team-management area" — no such area exists. → **Fix:** remove or state portfolio-level admin grants go through PropertyPro support. *Evidence:* `nav-config.ts:300-331` PM_NAV_ITEMS = Communities, Website, Templates, Reports; no team route under `pm/`.
- [x] **[Critical]** `pm/managing-pm-subscriptions-and-billing.mdx:165` — "PropertyPro subscription fees are usually a deductible business expense" is tax/financial advice. → **Fix:** "Consult your accountant about how to treat subscription fees." *Evidence:* `.claude/rules/florida-compliance.md`.

## High

- [x] **[High]** `pm/managing-pm-subscriptions-and-billing.mdx:40` — Tiers "Starter/Standard/Pro/Enterprise" don't exist — actual: Essentials ($199), Professional ($349), Operations Plus ($499). → **Fix:** replace with the three real tiers + PLAN_FEATURES deltas. *Evidence:* `plan-features.ts:52,91,123`; `add-community-modal.tsx:115-117`.
- [x] **[High]** `pm/managing-pm-subscriptions-and-billing.mdx:79` — In-app plan change supports upgrades only; downgrades/cancellation go through the Stripe portal. → **Fix:** state the split. *Evidence:* `api/v1/subscribe/change-plan/route.ts:9,68`.
- [x] **[High]** `pm/managing-pm-subscriptions-and-billing.mdx:107` — Invoices aren't listed at /settings/billing — the page shows plan/status and "View Invoices" opens the Stripe-hosted portal. → **Fix:** correct. *Evidence:* `billing-page-client.tsx:256-261`.
- [x] **[High]** `pm/managing-pm-subscriptions-and-billing.mdx:126` — Dunning schedule (retry 3/7 days, auto-downgrade to Starter at 14, frozen at 30) fabricated — failed payment sets past_due + warning banner; Stripe handles retries; no auto-downgrade. → **Fix:** replace with the real behavior. *Evidence:* `webhooks/stripe/route.ts:302`; `app-shell.tsx:231-240`.
- [x] **[High]** `pm/managing-pm-subscriptions-and-billing.mdx:145` — Cancellation reason picker unreachable — billing-page Cancel opens the Stripe portal; CancelCommunityDialog is orphaned. → **Fix:** describe Stripe-portal cancellation with the 30-day grace period. *Evidence:* `billing-page-client.tsx:271-275`; CancelCommunityDialog unreferenced.
- [x] **[High]** `pm/managing-multiple-communities.mdx:43` — Dashboard fields wrong — no subdomain/pending-join-requests/last-admin-action; actual columns: Community(+type), Units, Residents, Occupancy, Open Maintenance, Compliance %, Outstanding Balance, Site pill; no last-activity sort. → **Fix:** replace the list. *Evidence:* `portfolio-columns.tsx`; `use-portfolio-dashboard.ts:27-46`.
- [x] **[High]** `pm/managing-multiple-communities.mdx:64` — "Click PM Dashboard in the top bar" — the affordance is a "Portfolio" breadcrumb back-link under the top bar. → **Fix:** correct. *Evidence:* `app-shell.tsx:218-226`.
- [x] **[High]** `pm/managing-multiple-communities.mdx:73` — PM nav described as "communities list, bulk operations, reports, branding" — actual: Communities, Website, Templates, Reports. → **Fix:** list the real four. *Evidence:* `nav-config.ts:300-331`.
- [x] **[High]** `pm/managing-multiple-communities.mdx:83` — Add-community flow wrong — modal (name, plan, type, address, subdomain, unit count, timezone) + embedded Stripe checkout; no "Initial admin" or separate billing step. → **Fix:** rewrite the 5-step list. *Evidence:* `add-community-modal.tsx:50-62`; `PmDashboardClient.tsx:137`.
- [x] **[High]** `pm/onboarding-a-new-community.mdx:67` — "Set the initial admin… sends an invitation" step doesn't exist; the PM is the admin and payment happens via embedded checkout (omitted entirely). → **Fix:** remove the step; add the Stripe checkout step; move admin invites to Day 1-3 via Residents. *Evidence:* `add-community-modal.tsx`; `api/v1/pm/communities/route.ts:64-74`.
- [x] **[High]** `pm/onboarding-a-new-community.mdx:94` — "Promote board members from the resident list" — changing an existing member's role has no UI. → **Fix:** "Add board members with their role via Residents → Add Resident; existing-member role changes go through support." *Evidence:* `resident-form.tsx` (role set at creation only).
- [x] **[High]** `pm/customizing-pm-branding.mdx:47` — "/pm/settings/branding" is a permanent redirect — branding lives in the site editor at /pm/settings/website, per-community. → **Fix:** rewrite setup steps: Communities → community → Website → Branding controls. *Evidence:* `pm/settings/branding/page.tsx:18-32`.
- [x] **[High]** `pm/customizing-pm-branding.mdx:39` — "Contact details"/"Email sender name" are not branding options — branding = colors, fonts, two logos, custom email footer; contact info is per-community on "Management Contact" (not "Contact Management"); no sender-name customization. → **Fix:** replace bullets; correct the page name. *Evidence:* `packages/shared/src/branding.ts:8-38`; `help/contact/page.tsx:31`.
- [x] **[High]** `pm/customizing-pm-branding.mdx:63` — "Changes apply to every community immediately" — branding saves per community; portfolio-wide push is the separate Portfolio Templates feature. → **Fix:** state per-community scope; point to /pm/portfolio/templates. *Evidence:* `api/v1/pm/branding/route.ts`; `pm/portfolio/templates/page.tsx`.
- [x] **[High]** `pm/customizing-pm-branding.mdx:77` — Custom domain section wrong — it's a per-community public-site domain via the Custom Domain card in the site editor ("Add domain" → DNS records → "Check status"), not an app-wide white-label login domain. → **Fix:** rewrite around the real card + DNS flow. *Evidence:* `CustomDomainCard.tsx:11-12,125,149`.
- [x] **[High]** `pm/running-portfolio-reports.mdx:49` — Generation steps wrong — reports are auto-loading tabs (Maintenance/Compliance/Occupancy/Violations/Delinquency) with date presets + community picker + Apply; no "Generate" button; export is CSV only, no PDF (also lines 63, 69-72). → **Fix:** rewrite: pick tab → filters → Apply → Export CSV. *Evidence:* `PmReportsClient.tsx:70-76`; `ReportFilters.tsx:39-42,179-180`.
- [x] **[High]** `pm/sending-bulk-announcements-and-documents.mdx:44` — Placeholders `{{community.name}}`/`{{community.manager}}` are not supported — text inserts verbatim. → **Fix:** remove; note identical literal text goes to every community. *Evidence:* `bulk-announcement-broadcast.ts` (no interpolation).
- [x] **[High]** `pm/sending-bulk-announcements-and-documents.mdx:51` — "Click Preview" — the dialog has no preview; it has a Review & Send confirmation listing target communities. → **Fix:** describe the Review & Send → Confirm & Send steps. *Evidence:* `BulkAnnouncementDialog.tsx:143-167,236`.
- [x] **[High]** `pm/sending-bulk-announcements-and-documents.mdx:77` — Bulk document "Set category and date" — dialog offers only an optional Description; no category or date. → **Fix:** files + optional description; category must be edited per community afterwards. *Evidence:* `BulkDocumentDialog.tsx:183-217`; `bulk-document-upload.ts` (categoryId null).
- [x] **[High]** `pm/sending-bulk-announcements-and-documents.mdx:101` — "PM dashboard keeps a log of every bulk operation" — no log UI; bulk routes don't even write audit events. → **Fix:** delete the Tracking section. *Evidence:* grep logAuditEvent in `pm/bulk/*` routes — none.
- [x] **[High]** `pm/adding-cams-and-board-admins.mdx:78` — No in-app way to assign property_manager_admin — Add Resident dropdown offers Owner/Tenant/Board President/Board Member/CAM/Site Manager only. → **Fix:** portfolio-level admin access is granted via support (or as the paying PM at creation). *Evidence:* `resident-form.tsx:28-83`.

## Medium

- [x] **[Medium]** `pm/customizing-pm-branding.mdx:29` — contextPaths point at /pm/settings (no page) and /pm/settings/branding (redirect) — the article never surfaces on the actual branding screen. → **Fix:** set contextPaths to /pm/settings/website. *Evidence:* no page.tsx in `pm/settings/`; `help-article-service.ts:461-470`.
- [x] **[Medium]** `pm/managing-multiple-communities.mdx:61` — "URLs include the community subdomain" — switching redirects to /dashboard?communityId=N on the same PM host. → **Fix:** correct. *Evidence:* `community-context.ts:43-46`.
- [x] **[Medium]** `pm/managing-pm-subscriptions-and-billing.mdx:59` — No in-app billing-email field — change it in the Stripe portal. → **Fix:** reword. *Evidence:* grep billingEmail — nothing.
- [x] **[Medium]** `pm/managing-pm-subscriptions-and-billing.mdx:62` — "Choose the billing cycle" at creation — the modal has no interval choice; interval surfaces later via change-plan. → **Fix:** move interval discussion to Changing Plans. *Evidence:* `add-community-modal.tsx`; `change-plan/page.tsx:91`.
- [x] **[Medium]** `pm/onboarding-a-new-community.mdx:55` — "/pm/dashboard/communities/new" is a redirect back to the list. → **Fix:** drop the parenthetical; entry point is the Add Community button. *Evidence:* `communities/new/page.tsx` (redirect-only).
- [x] **[Medium]** `pm/onboarding-a-new-community.mdx:76` — Never mentions the public-site builder (wizard at /pm/onboarding/website, "finish your site" banner, Site pill) — now core to onboarding. → **Fix:** add a "Set up the public site" step. *Evidence:* `SiteSetupBanner` in `PmDashboardClient.tsx:73`; `portfolio-columns.tsx` Site column.
- [x] **[Medium]** `pm/running-portfolio-reports.mdx:45` — "you pick the date range" — only four fixed presets; compliance and delinquency ignore the date range entirely. → **Fix:** note the presets + point-in-time reports. *Evidence:* `reports/[reportType]/route.ts:40,46`; `ReportFilters.tsx:39-42`.

## Low

- [x] **[Low]** `pm/adding-cams-and-board-admins.mdx:49` — References to `packages/shared/src/manager-permissions.ts` (also line 163) are meaningless to end users. → **Fix:** "the role permission matrix" or a help link. *Evidence:* user-facing MDX context.
- [x] **[Low]** `pm/adding-cams-and-board-admins.mdx:59` — Role dropdown availability is community-type-dependent (CAM/Board for condo/HOA; Site Manager for apartments) but the article implies all options appear together. → **Fix:** add the note. *Evidence:* `resident-form.tsx:36-81`.
- [x] **[Low]** `pm/managing-multiple-communities.mdx:30` — contextPath "/pm" matches no page (no /pm index route). → **Fix:** remove. *Evidence:* no page.tsx at `pm/`.
- [x] **[Low]** `pm/running-portfolio-reports.mdx:30` — contextPath "/pm/reports/*" matches nothing (no subroutes). → **Fix:** remove the wildcard. *Evidence:* only the index page exists.
- [x] **[Low]** `pm/sending-bulk-announcements-and-documents.mdx:109` — "Unpublish the announcement in each community" — available action is archive/delete. → **Fix:** "archive or delete the announcement in each community." *Evidence:* `api/v1/announcements/route.ts:161,212`.

## Report

- Articles edited: sending-bulk-announcements-and-documents, adding-cams-and-board-admins, managing-pm-subscriptions-and-billing, managing-multiple-communities, onboarding-a-new-community, customizing-pm-branding, running-portfolio-reports
- Items fixed: 37 / Skipped: 0
- guard:help-content: PASS
