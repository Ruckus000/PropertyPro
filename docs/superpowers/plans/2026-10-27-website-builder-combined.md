# Website Builder (Live on Day One, Pick a Look) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The plan is also shaped for `/phase-run`:
> - each phase is one PR;
> - tasks in the same wave own disjoint files;
> - every task names its blast radius and its done-criteria commands;
> - `passes` stays false until those commands have run and their output has been read.
>
> Every path and symbol below was checked against `87121edb1` on 2026-10-27. Before dispatching a task, grep its symbols again (`plans_rot_preverify_each_task`) and put any corrections at the top of the dispatch prompt.

**Goal:** Every new Florida association gets a complete, accurate website at creation. Choosing a look takes one click, Florida records link themselves with an alert for what's missing, and editing gets simpler.

**Architecture:**
- **Looks.** Four looks replace today's six colour-only templates. Each look is a code layout, a `site_theme_presets` row and a set of default home-page sections. One pure function decides what a look switch does, for both the saved draft and the preview.
- **Linked fields.** Sign-up facts appear through linked fields resolved at render time, so a rename in Settings shows on the site without a publish.
- **Records.** Florida records link by title rules, only to documents owners can already see. Anything uncertain is shown to a person.
- **Manager pages.** Two new pages, `/pm/website` and `/pm/website/looks`, live in the app shell. The editor keeps its existing click-to-select inspector and loses its tool rail and onboarding guides.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, TanStack Query 5, Drizzle + Supabase Postgres, Zod 4, Vitest (`node` and `jsdom` projects per `apps/web/vitest.shared.ts`), Playwright, `@propertypro/api-contract` (`runRoute`).

**Spec:** `docs/superpowers/specs/2026-10-27-website-builder-combined-design.md` (approved 2026-10-27, commit `d0b547488`). Read it alongside this plan. Where they differ, the spec corrections below win.

## Global Constraints

**Copy and law**
- Copy describes what the law lists for associations. Never say "compliant", never give legal advice, never quote a fine amount (no "$50 per day"). Records lists end with: "This list shows what the statute names. It isn't legal advice."
- Coverage comes only from `requirementLevel` in `packages/shared/src/site-diff/required.ts` (`'required' | 'recommended' | 'none'`): condos with 25+ units, HOAs with 100+ parcels, and an unknown count counts as covered. Apartments get no records list.

**Looks and accessibility**
- Look fonts come only from `ALLOWED_FONTS` (`packages/theme/src/constants.ts`). All seven fonts the looks use are already in it.
- Contrast is checked with `contrastRatio` from `packages/shared/src/site-diff/contrast.ts`: body text ≥ 4.5:1, headings ≥ 3:1.
- Visible focus everywhere; 44 px touch targets below 768 px; status is always icon + text + colour. Decorative previews get `inert`, `aria-hidden="true"` and `tabIndex={-1}`.

**Records and privacy**
- Automatic linking touches only documents with `posted_at IS NOT NULL`, `deleted_at IS NULL` and `source_type IN ('library','authored')`. It never posts a draft, never sets `public_access`, never changes a category and never replaces an existing link.
- No public contact form. The public site never shows an email address that wasn't entered as the community's public contact email.
- Publishing never sends email. Owners are emailed only by the separate **Email owners** click (Task 22).

**Engineering**
- Every new or changed route follows `.claude/rules/api-patterns.md`:
  - a `runRoute` contract inside `withErrorHandler`; import `runRoute` from `@/lib/api/run-route` when the contract declares `tenantScope`;
  - no table imports in routes: queries live in services;
  - `logAuditEvent` on every mutation.
- **The website routes' gate** (Tasks 14, 21, 22, 23) is the chain the publish route declares locally as `ensurePmAccess` (`apps/web/src/app/api/v1/pm/site/publish/route.ts:27`):
  1. `requireAuthenticatedUserId`
  2. `resolveEffectiveCommunityId`
  3. `assertNotDemoGrace` (writes only)
  4. `requireCommunityMembership`
  5. `requireRole(membership, PM_MANAGER_ROLES, …)`
  6. `requirePlanFeature(communityId, 'hasSiteEditor')`

  Each route declares its own copy, as the existing site routes do.
- Migrations:
  - are applied to production by hand, expand before the code that uses them;
  - take their number from the three-source rule in `.claude/rules/migration-safety.md` (0095 was free on 2026-10-27);
  - use `pnpm --filter @propertypro/db db:generate` when a table changes, `pnpm db:migration:new` for SQL only.
- New section types ship in two releases: readers in Phase 2A, **deployed to production**, before writers in Phase 2B.
- Size: `pnpm build && pnpm perf:check` passes.
  - Every page route's first load must stay ≤ 1160 KiB.
  - The budgeted route groups' unique first-load JS must stay ≤ 1435 KiB.
  - On 2026-10-27: `/settings` 1128.0 KiB, the editor 1024.9 KiB, aggregate 1402.0 KiB.
  - New client UI on an existing route loads with `next/dynamic`; look previews are iframes.
- Lint guards:
  - semantic colour classes only (`pnpm guard:design-tokens`, `guard:class-resolution`); look palettes live in preset rows, never as hex in components;
  - pages use `PageHeader` (its `<h1>` is `sr-only`) + `PageBody` with no root padding (`guard:page-header`, `guard:page-padding`, `guard:breadcrumbs`). Visible page headings are `<h2>`.
- Tests:
  - run one file with `pnpm test <path>`, never with `--`;
  - run integration files with `pnpm test:integration:local <path>`, never against `.env.local`;
  - every fix gets a revert-check per `.claude/rules/verification.md`.

## Spec corrections (trust these over the spec)

1. **Board titles.** Board members shows the title `getContactInfo` already returns: `user_roles.display_title` when set, else "Board President" or "Board Member", as the Contact section does today.
2. **The daily compliance digest is unchanged.** `compliance-alert-service.ts` already lists missing records once they're overdue, so no new count is added.
3. **History gate.** The full publish-history list is gated in the UI on `hasSitePolishBlocks`, the existing flag for Professional site features (Professional and Operations Plus). The history API has no plan gate. One-step Restore is on every plan.
4. **Restore = revert, then publish.**
   - Each snapshot holds the state *after* its publish, so "previous version" is the second-newest snapshot.
   - Revert replaces the whole draft layer, so unpublished edits are discarded. The confirm dialog says so.
5. **"Email owners" uses the existing site-update email.** `notifyResidentsOfSitePublish` always sends to audience `'all'` today. Task 22 adds an `audience` input, and the website home sends with the existing `'owners_only'` announcement audience.
6. **Some communities have no checklist.** Communities created by a manager get no compliance checklist rows. The website home calls `ensureTransparencyChecklistInitialized` first.
7. **Demo communities.** Prospect demos (`isDemo` communities, filled on entry by `applyStarterPackToDemoCommunity`) get their suggested look through the same function as new communities (Task 13). The seeded fixtures in `scripts/seed-demo.ts` and `scripts/help-capture/fixtures.ts` stay on starter packs: they are shared test data with their own consumers.
8. **Click-to-select already exists.** `use-canvas-selection.ts` and `Inspector.tsx` already do it. Phase 5 removes the tool rail and simplifies the panels; it does not rebuild selection.
9. **Profile fields.**
   - County is left out of the Community profile: sign-up collects it, but it isn't stored on `communities` and nothing on the site shows it.
   - The public phone, email and contact name reuse `communities.contact_*`. Community creation never sets them, so the sign-up email can't reach the site.
10. **The publish sheet loses its email box** (spec §7: "publish without the email"). The publish route keeps accepting `notifyResidents`, so editor tabs opened before the deploy still work. Removing the field is a later contract change.
11. **Default photos.** Only two of the repo's marketing photos are scenery: sunset over the water (`close-coast-1440.webp`) and a palm-lined street (`who-hoa-1100.webp`). The aerial beach photo centres on condo towers, which a Miami association could mistake for its own building, so no look uses it. Heritage shares Bayfront's sunset photo.
12. **Success is measured from existing data, with no new telemetry.**
    - Time to choose a look: `site_onboarding_completed_at − communities.created_at`.
    - Automatic links: items where `document_id = auto_linked_document_id`.
    - Live at creation: `site_published_at`.

## Decision ledger (normative: implementers file a finding instead of stopping to ask)

- **D1. What a look is.**
  - `apps/web/src/lib/site-looks/looks.ts` defines id, name, description, layout id, preset slug and default home-page sections.
  - Colours and fonts live in four new `site_theme_presets` rows, in `tokens` jsonb (`primaryColor`, `secondaryColor`, `accentColor`, `headingFont`, `bodyFont`, as migration `0004` seeds them).
  - Layouts are four new layout components plus `site_layout_metadata` rows.
- **D2. Ids.** Look ids, layout ids and preset slugs are the same: `bayfront`, `heritage`, `palm-grove`, `plain-simple`. The legacy layouts `tidewater`, `boulevard` and `sable` keep rendering existing sites unchanged. `resolveLayoutId` already falls back to the type default for an unknown id, so a rollback past Phase 2B renders legacy layouts instead of failing.
- **D3. Stock photos.**
  - Hero photos may be `{ stock: 'sunset' | 'palms', alt }`, served from `apps/web/public/site-looks/`.
  - Storage paths must match `^\d+/(logo|hero|content)/`, and copying files into each community's storage adds quota accounting for nothing.
- **D4. Linked fields.** The tokens are `{{name}}`, `{{city}}` and `{{units}}`, used in hero headline and subtitle text. They resolve at render time:
  - `{{name}}` becomes the short name when set, else the full name.
  - `{{units}}` resolves only for a positive integer.
  - A sentence holding a token with no value is dropped.
  - Values are inserted as text and never re-scanned.
- **D5. Switching looks keeps edits.**
  - A home-page section is *untouched* when its parsed content deep-equals a default the site could have received: the outgoing look's default for that type, or, for a site still on a legacy layout, that type's block in **any version** of its community type's starter pack. `site_starter_packs.blocks` is inserted verbatim, so equality holds.
  - If every section is untouched, the result is exactly the incoming look's sections in its order.
  - Otherwise:
    - untouched sections are replaced in their slot by the incoming default, or removed when the incoming look lacks the type;
    - edited and hidden sections keep their content and slot;
    - incoming-only types are inserted after the nearest preceding section in the incoming look's order (or first).
  - One pure function, `planLookSwitch`, makes this decision for both the written draft and the preview. Other pages are untouched.
- **D6. Day one.** `seedNewCommunitySite` calls `applyLookAtCreation`, which has the same idempotency as starter packs (skip if any published block exists).
  - It writes branding with the preset's colours and fonts plus `layoutId` and `themePresetSlug`.
  - It publishes the home-page sections and stamps `site_published_at` when it is null.
  - Prospect demos get the same through `fillDemoCommunitySite` (Task 13).
  - Admin's "reset to starter" is unchanged.
- **D7. Routes.**
  - Website home: `/pm/website?communityId=` (`(authenticated)/pm/website/page.tsx`).
  - Look picker: `/pm/website/looks?communityId=`.
  - The editor stays at `/pm/website-editor`.
  - The nav Website item points to the home and matches all three prefixes.
- **D8. Look previews.**
  - Previews are iframes of `/pm/site-preview?communityId=&look=<id>&preview=true`. `preview=true` responses already allow `frame-ancestors 'self'`, which the wizard's live preview relies on today, and signed-in previews show drafts.
  - `look` renders the look's layout and preset over the result of `planLookSwitch`, writing nothing.
- **D9. The picker.**
  - Selecting a card saves it as a draft (`PATCH /api/v1/pm/site/look`, `draftLookSwitch`), so leaving and coming back keeps it. The picker opens on the draft look when there is one, else the live look.
  - **Publish this look** (`POST`) runs `draftLookSwitch` (idempotent), `publishCommunitySite`, `markSiteOnboardingComplete` and `tryAutoComplete(…, 'customize_portal')`.
  - Visiting the picker also calls `tryAutoComplete` (spec C0).
  - If other drafts were pending when the page loaded, the picker says they will publish too.
- **D10. "Email owners" is its own action.** `POST /api/v1/pm/site/live-notice` sends it once.
  - It first claims `site_live_notice_sent_at` with a conditional update.
  - A second send gets 409; a failed send releases the claim.
  - `PATCH` with `{ dismissed: true }` stamps `site_live_notice_dismissed_at`.
  - The offer shows while both columns are null and the community has at least one owner (a `resident` member with `is_unit_owner`).
- **D11. Missing records.**
  - `missingRecordItems` lists a covered community's applicable, non-conditional items without a posted, current record.
  - `conditionalRecordItems` lists conditional items with no record; they appear with **Doesn't apply**.
  - Below the threshold (`'recommended'`) the home shows a one-line note and no alert.
  - Snooze is per user: `user_preferences` key `site_records_alert:<communityId>`, `{ snoozedUntil }`, 7 days. The nav badge ignores snooze.
- **D12. Automatic linking.** A document links only when all three hold:
  - the rules return exactly one template key;
  - that item is applicable and unlinked;
  - no other eligible, unlinked posted document matches that key.

  How it's written:
  - The update is guarded by `document_id IS NULL` and sets `auto_linked_document_id` in the same statement. An item counts as auto-linked while `document_id = auto_linked_document_id`, so a later manual relink or unlink needs no clean-up.
  - It's audited as `link_document` with `metadata: { linkedBy: 'auto_match', templateKey }`.
  - Every eligible, unlinked match the rule did not link is offered to a person as a candidate.
  - Unlinking (`unlinkChecklistItemsForDocument`) is now audited as `unlink_document`.
- **D13. "Doesn't apply"** stores `not_applicable_reason` (1–200 characters, required for `mark_not_applicable`). `mark_applicable` clears it.
- **D14. Empty sections.**
  - The public async shells for Meetings and Announcements return `null` when they have nothing.
  - The Documents shell does three things:
    - lists public documents when there are any;
    - renders `OwnerRecordsSummary` when any records group has a posted record (below the list when both);
    - returns `null` when neither.
  - The `*BlockView` components are unchanged, so the editor canvas keeps its placeholders. This reaches every site on deploy.
- **D15. Community profile.**
  - `GET`/`PATCH /api/v1/community/profile` cover name, short name, address, office hours and the existing contact fields.
  - The gate is `membership.isAdmin`, matching `community/contact`.
  - Unit count stays on `PATCH /api/v1/community/unit-count` and shows in the same card.
  - The public site renders dynamically (no `revalidate` or `unstable_cache` under `app/public-site`), so a change shows on the next request.
- **D16. Section types `quicklinks` and `board`.**
  - Their content is strict: `{ hidden? }` for quicklinks, `{ heading?, hidden? }` for board.
  - Board data comes from `getContactInfo`'s board list.
  - Quick links shows only links whose target has content on that page; Owner sign in always shows.
  - When a look includes Board members, its Contact section uses `showBoard: false`.
- **D17. No feature flag.** Each phase leaves the product coherent on its own.
- **D18. Dashboard card.**
  - `WebsiteLiveCard` replaces `FoundingAhaPanel`. Managers with `hasSiteEditor` see it while `site_onboarding_completed_at` is null.
  - Its **Dismiss** and the picker's **Keep this look** both call `PATCH /api/v1/pm/site/look` with `{ keepCurrent: true }`.
- **D19. One loader per manager page.**
  - The picker uses `loadSiteFacts`; the home uses `loadWebsiteHome`. Both live in `apps/web/src/lib/services/website-home-service.ts`.
  - Components render what the loader returns and query nothing on the server themselves.

## Review Focus

1. **Odd community names.** A name containing `{{`, HTML, or 120 characters renders literally, is never re-resolved and never injects markup. Tests in Task 2 and Task 6.
2. **Missing facts.** With a fact missing (no city, unknown unit count), only the sentence that held it disappears. Every look still shows a full sentence, and an empty subtitle renders nothing. Tests in Tasks 2, 6 and 12.
3. **Two matching documents.** When two posted documents match one item (a 2025 and a 2026 budget), nothing links silently. Both are offered, and the one a person picks is linked. Tests in Tasks 16, 17 and 26.
4. **Switching after edits.** Switching looks after editing keeps the edited text and slot, and hidden sections stay hidden. Test in Task 12.
5. **Duplicate sends.** A double click on **Email owners**, or two managers clicking at once, sends exactly one email. Test in Task 22.

## Phases

| Phase | PR | Waves (tasks) | Blast radius | Migration | Merge only after |
|---|---|---|---|---|---|
| 1 Foundations | 1 | 1A: T1, T2, T3 · 1B: T4, T6 · 1C: T5 | PUBLIC-URL, RESIDENT-APP | 0095 (expand) | — |
| 2A New section types, read release | 2 | 2A-1: T7, T8 · 2A-2: T9 | PUBLIC-URL | 0096 (expand) | Phase 1 merged |
| 2B Looks, write release | 3 | 2B-1: T10, T11 · 2B-2: T12 · 2B-3: T13, T14, T15 | PUBLIC-URL, RENDER | 0097 (DML, expand) | Phase 2A **deployed** |
| 3 Records | 4 | 3-1: T16, T18 · 3-2: T17, T19 · 3-3: T20 | RESIDENT-APP, INTERNAL | none (uses 0095) | Phase 1 merged |
| 4 Website home, picker, retire guides | 5 | 4-1: T21, T22, T23, T25 · 4-2: T24, T26 | RESIDENT-APP | none | Phases 2B and 3 merged |
| 5 Editor | 6 | 5-1: T27, T29 · 5-2: T28 | RESIDENT-APP | none | Phase 4 merged |

Wave 2A-1 is the one exception to green-after-every-wave: see Task 8, Step 4.

**Every phase is done when:**
- `pnpm typecheck && pnpm lint && pnpm test` is green;
- `pnpm build && pnpm perf:check` is green;
- every migration's `expect` block matches after its hand apply.

---

## Phase 1: Foundations

### Task 1: Migration 0095 (profile, notice, reason and auto-link columns)

**Blast radius:** INTERNAL · **passes:** false

**Files:**
- Modify: `packages/db/src/schema/communities.ts`, `packages/db/src/schema/compliance-checklist-items.ts`
- Create (generated): `packages/db/migrations/0095_website_builder_columns.sql`, `packages/db/migrations/meta/0095_snapshot.json`; Modify `packages/db/migrations/meta/_journal.json`
- Test: `apps/web/__tests__/integration/website-builder-columns.integration.test.ts`

**Interfaces:** Produces these columns, with their Drizzle names:
- `communities.short_name text NULL CHECK (char_length(short_name) <= 60)` → `shortName`
- `communities.office_hours text NULL CHECK (char_length(office_hours) <= 200)` → `officeHours`
- `communities.site_live_notice_sent_at timestamptz NULL` → `siteLiveNoticeSentAt`
- `communities.site_live_notice_dismissed_at timestamptz NULL` → `siteLiveNoticeDismissedAt`
- `compliance_checklist_items.not_applicable_reason text NULL CHECK (char_length(not_applicable_reason) BETWEEN 1 AND 200)` → `notApplicableReason`
- `compliance_checklist_items.auto_linked_document_id bigint NULL REFERENCES documents(id) ON DELETE SET NULL` → `autoLinkedDocumentId`
- Index `compliance_checklist_items_document_id_idx ON compliance_checklist_items (document_id) WHERE document_id IS NOT NULL AND deleted_at IS NULL`

- [ ] **Step 1: Write the failing test.** `website-builder-columns.integration.test.ts`:
  - `adds the four community columns as nullable` (`information_schema.columns`, `is_nullable = 'YES'`)
  - `rejects a 61-character short name` (expect a 23514 check violation)
  - `adds not_applicable_reason with its length check`
  - `adds auto_linked_document_id with a set-null foreign key to documents` (`pg_constraint`, `confdeltype = 'n'`)
  - `creates compliance_checklist_items_document_id_idx` (`pg_indexes`)
- [ ] **Step 2: Run** `pnpm test:integration:local apps/web/__tests__/integration/website-builder-columns.integration.test.ts`. Expected: FAIL, because the columns don't exist.
- [ ] **Step 3: Implement.**
  1. Confirm the number with the three-source rule.
  2. Edit both schema files.
  3. Run `pnpm --filter @propertypro/db db:generate --name website_builder_columns`.
  4. Read the generated SQL: additive only, no drops.
- [ ] **Step 4: Run** `pnpm db:test-local:reset`, then the test. Expected: PASS.
- [ ] **Step 5: Write the `expect` block** into the PR description (EXPAND, so apply it before merging):

```sql
select count(*) = 4 from information_schema.columns where table_name = 'communities'
  and column_name in ('short_name','office_hours','site_live_notice_sent_at','site_live_notice_dismissed_at') and is_nullable = 'YES';
select count(*) = 2 from information_schema.columns where table_name = 'compliance_checklist_items'
  and column_name in ('not_applicable_reason','auto_linked_document_id');
select count(*) = 1 from pg_indexes where indexname = 'compliance_checklist_items_document_id_idx';
do $$ begin if exists (select 1 from communities where short_name is not null or office_hours is not null) then raise exception 'new columns should be empty'; end if; end $$;
```

- [ ] **Step 6: Commit.** `git commit -m "feat(db): profile, live-notice, not-applicable and auto-link columns (0095)"`

### Task 2: Linked fields

**Blast radius:** INTERNAL · **passes:** false

**Files:** Create `packages/shared/src/site-blocks/linked-fields.ts`; Modify `packages/shared/src/site-blocks/index.ts`, `packages/shared/src/index.ts`; Test `packages/shared/__tests__/site-blocks/linked-fields.test.ts`

**Interfaces:** Produces:

```ts
export const LINKED_FIELDS = ['name', 'city', 'units'] as const;
export type LinkedField = (typeof LINKED_FIELDS)[number];
export interface LinkedFacts { name: string; shortName: string | null; city: string | null; unitCount: number | null }
export function resolveLinkedText(text: string, facts: LinkedFacts): string;
export type LinkedSegment = { kind: 'text'; value: string } | { kind: 'field'; field: LinkedField };
export function parseLinkedText(text: string): LinkedSegment[];
```

- [ ] **Step 1: Write the failing tests:**
  - `uses the short name for {{name}} when set`: `resolveLinkedText('Welcome to {{name}}', {name:'Harbor Pointe Condominium Association, Inc.', shortName:'Harbor Pointe', city:null, unitCount:null})` returns `'Welcome to Harbor Pointe'`.
  - `falls back to the full name`
  - `drops only the sentence whose fact is missing`: `'{{units}} homes in {{city}}. News and records, all in one place.'` with `unitCount: null` returns `'News and records, all in one place.'`
  - `treats a unit count of 0 as missing`
  - `inserts values literally and never re-resolves them`: name `'Pointe {{city}} <b>'` with city `'Miami'` gives output containing `'Pointe {{city}} <b>'`.
  - `leaves unknown tokens as written`: `'{{phone}}'` returns `'{{phone}}'`.
  - `returns an empty string when every sentence drops`
  - `parseLinkedText splits text and fields`: `'Hi {{name}}!'` returns `[{kind:'text',value:'Hi '},{kind:'field',field:'name'},{kind:'text',value:'!'}]`.
- [ ] **Step 2: Run** `pnpm --filter @propertypro/shared test linked-fields`. Expected: FAIL, because the module doesn't exist.
- [ ] **Step 3: Implement.**
  - Split sentences after `.`, `!` or `?` followed by whitespace.
  - Resolve in a single pass with `/\{\{(name|city|units)\}\}/g`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(shared): linked fields for site copy"`

### Task 3: Hide empty sections; Documents shows the owners' summary

**Blast radius:** PUBLIC-URL · **passes:** false

**Files:**
- Modify: `apps/web/src/components/public-site/blocks/MeetingsBlock.tsx`, `AnnouncementsBlock.tsx`, `DocumentsBlock.tsx`
- Create: `apps/web/src/components/public-site/blocks/OwnerRecordsSummary.tsx`
- Modify: `apps/web/src/lib/db/public-community-reader.ts`, `apps/web/src/lib/site-editor/records-status.ts` (export the group labels)
- Test: `apps/web/__tests__/components/public-site/blocks/empty-sections.test.tsx`; extend `apps/web/__tests__/lib/db/public-community-reader.test.ts`

**Interfaces:** Produces:
- `RECORD_GROUP_LABELS` (from `records-status.ts`), built from today's `GROUPS` list:

  ```ts
  export const RECORD_GROUP_LABELS: Readonly<Record<'governing_documents' | 'financial_records' | 'meeting_records' | 'insurance' | 'operations', string>>;
  ```

- The reader method `listOwnerRecordGroups(): Promise<Array<{ category: keyof typeof RECORD_GROUP_LABELS; label: string; postedCount: number }>>`.
  - It counts applicable checklist items whose linked document is posted and undeleted, grouped by `compliance_checklist_items.category`.
  - It returns counts only, never titles. Add an `// AUTHZ:` note: public read of aggregate counts.
- `OwnerRecordsSummary({ groups }: { groups: Array<{ label: string; postedCount: number }> })` renders:
  - the heading "Association documents";
  - the line "Owners can sign in to see the association's official records.";
  - one row "{label} · {count}" per group with a count above 0;
  - an "Owner sign in" link to `/auth/login`, the href `SiteChrome` uses.

- [ ] **Step 1: Write the failing tests** (`render(await MeetingsBlock(props))` style):
  - `meetings section renders nothing when no meeting is upcoming` (container empty)
  - `announcements section renders nothing when there are none`
  - `documents section shows the owners' summary, never "No documents available."`
    - Input: groups `[{label:'Financial records', postedCount: 3}]` and no public documents.
    - Expect `queryByText('No documents available.')` to be null, and the `Owner sign in` link `href` to be `/auth/login`.
  - `documents section lists public documents and the owners' summary together`
  - `documents section renders nothing when nothing is public and nothing is posted`
  - `listOwnerRecordGroups counts only posted, undeleted, linked records of applicable items`
  - `MeetingsBlockView still shows its empty text in the editor canvas` (the existing assertion still holds)
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/components/public-site/blocks/empty-sections.test.tsx apps/web/__tests__/lib/db/public-community-reader.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement D14** in the async shells only. Leave every `*BlockView` untouched.
- [ ] **Step 4: Run.** Expected: PASS. Also run `pnpm test apps/web/__tests__/components/public-site/blocks` (the existing view tests stay green).
- [ ] **Step 5: Commit.** `git commit -m "feat(public-site): drop empty sections; owners' records summary"`

### Task 4: Community profile service and route

**Blast radius:** RESIDENT-APP · **passes:** false

**Files:** Modify `apps/web/src/lib/services/community-profile-service.ts`; Create `apps/web/src/app/api/v1/community/profile/contract.ts`, `route.ts`; Test `apps/web/__tests__/community/profile-route.test.ts`, `apps/web/__tests__/lib/services/community-profile-service.test.ts`

**Interfaces:** Consumes:
- Task 1's columns;
- `updateCommunityName` (same file; keeps its own audit);
- `updateCommunityContact` (`community-contact-service.ts`; audits `community.contact_updated`).

Produces:

```ts
export interface CommunityProfile {
  name: string; shortName: string | null; addressLine1: string | null; addressLine2: string | null;
  city: string | null; state: string | null; zipCode: string | null; unitCount: number | null;
  officeHours: string | null; contactName: string | null; contactEmail: string | null; contactPhone: string | null;
}
export async function getCommunityProfile(communityId: number): Promise<CommunityProfile>;
export async function updateCommunityProfile(
  communityId: number,
  patch: Partial<Omit<CommunityProfile, 'unitCount'>>,
  opts: { actorUserId: string },
): Promise<CommunityProfile>;
```

**Route:** `GET` and `PATCH /api/v1/community/profile`, with contracts `communityProfileGetContract` (`tenantScope: { in: 'query' }`) and `communityProfilePatchContract` (`tenantScope: { in: 'body' }`).
- **PATCH body** (strict; nullable means clear):

  | Field | Rule |
  |---|---|
  | `name` | 1–120 characters |
  | `shortName` | ≤ 60, nullable |
  | `addressLine1`, `addressLine2` | ≤ 120 each |
  | `city` | ≤ 80 |
  | `state` | `/^[A-Z]{2}$/` |
  | `zipCode` | `/^\d{5}(-\d{4})?$/` |
  | `officeHours` | ≤ 200 |
  | `contactName` | ≤ 120 |
  | `contactEmail` | email, ≤ 254 |
  | `contactPhone` | ≤ 40 |

- **Gates, in order:** `requireAuthenticatedUserId`, then `assertNotDemoGrace` (PATCH), then `requireCommunityMembership`, then `membership.isAdmin`, else `ForbiddenError`.
- **Audit:** `logAuditEvent({ action: 'update', resourceType: 'community_profile', oldValues, newValues })`, covering only changed keys the two reused services don't already audit.

- [ ] **Step 1: Write the failing tests:**
  - `PATCH updates only the fields sent`: `updateCommunityProfile` is called with `{ officeHours: 'Mon–Fri, 9–5' }` only.
  - `returns 403 for a resident`
  - `returns 401 without a session`
  - `rejects a 61-character short name (400)`
  - `rejects a malformed ZIP (400)`
  - `refuses a demo in its grace window before checking membership` (`requireCommunityMembership` not called)
  - `routes a rename through updateCommunityName and contact fields through updateCommunityContact`
  - `audits changed keys only`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/community/profile-route.test.ts apps/web/__tests__/lib/services/community-profile-service.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the service and route.
- [ ] **Step 4: Run.** Expected: PASS. Then `pnpm guard:route-gates && pnpm guard:contracts && pnpm guard:tenant-scope`.
- [ ] **Step 5: Commit.** `git commit -m "feat(settings): community profile route"`

### Task 5: Community profile card in Settings

**Blast radius:** RESIDENT-APP · **passes:** false

**Files:** Create `apps/web/src/components/settings/community-profile-card.tsx`, `apps/web/src/hooks/use-community-profile.ts`; Modify `apps/web/src/app/(authenticated)/settings/page.tsx`; Test `apps/web/__tests__/components/settings/community-profile-card.test.tsx`

**Interfaces:** Consumes Task 4's contract types. Produces:
- `useCommunityProfile(communityId)` (query key `['community-profile', communityId]`);
- `useUpdateCommunityProfile(communityId)`;
- `CommunityProfileCard({ communityId })`.

**Card:**
- Built from the `settings-layout.tsx` parts (`SettingsCardFooter` as the other cards use it), with three groups:
  - **Name**: name and short name.
  - **Address**: street lines, city, state and ZIP.
  - **Shown on your website**: contact name, email, phone and office hours.
- Help line: "Leave a field blank to hide it on your website."
- A unit-count row uses the existing `PATCH /api/v1/community/unit-count` and shows the line for its `requirementLevel`.
- It saves immediately and says so in the footer.

The page adds `{ id: 'community-profile', label: 'Community profile' }` to the Community nav group, which shows when `membership.isAdmin`. It imports the card with `next/dynamic`.

- [ ] **Step 1: Write the failing tests:**
  - `shows saved values`
  - `sends only changed fields`
  - `sends null for a cleared field`
  - `shows the danger AlertBanner when saving fails`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/components/settings/community-profile-card.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the card, the hook and the page wiring.
- [ ] **Step 4: Run.** Expected: PASS. Then `pnpm build && pnpm perf:check`: `/settings` must stay ≤ 1160 KiB.
- [ ] **Step 5: Commit.** `git commit -m "feat(settings): community profile card"`

### Task 6: The public site uses real facts, linked fields and the profile

**Blast radius:** PUBLIC-URL · **passes:** false

**Files:**
- Modify: `apps/web/src/lib/api/branding.ts`: `getCommunityPublicInfo` also selects `city`, `state`, `unitCount` and `shortName`.
- Modify: `apps/web/src/components/public-site/blocks/types.ts`: `PublicCommunity` gains `shortName: string | null; unitCount: number | null`.
- Modify: `apps/web/src/app/public-site/[[...slug]]/page.tsx` and `apps/web/src/app/(site-preview)/pm/site-preview/page.tsx`: pass real values where they hard-code `city: null` and `state: null`.
- Modify: `apps/web/src/components/public-site/blocks/HeroBlock.tsx`: headline and subtitle go through `resolveLinkedText`, and an empty result renders nothing.
- Modify: `apps/web/src/components/public-site/blocks/ContactBlock.tsx`, `ContactBlockView.tsx`, `apps/web/src/lib/db/public-community-reader.ts`: `getContactInfo` adds `address` and `officeHours`.
- Modify: `apps/web/src/lib/site-editor/load-canvas-context.ts`: the canvas gets the same facts.
- Test: extend `apps/web/__tests__/components/public-site/blocks/HeroBlock.test.tsx`, `ContactBlock.test.tsx`, `apps/web/__tests__/app/public-site/site-page.test.tsx`

**Interfaces:** Consumes Task 2 (`resolveLinkedText`, `LinkedFacts`) and Task 1's columns. Facts are built as `{ name, shortName, city, unitCount }`.

**Contact rules:**
- The address shows when present.
- Office hours, contact name, email and phone each show only when set.
- The shell returns `null` when none of them exist.
- `showBoard` behaviour is unchanged.

- [ ] **Step 1: Write the failing tests:**
  - `hero shows the community name in place of {{name}}`
  - `hero renders a name with {{city}} in it literally` (Review Focus 1)
  - `hero renders no subtitle paragraph when every sentence drops` (Review Focus 2)
  - `contact shows office hours when set and leaves out the row when not`
  - `contact renders no email link when the contact email is empty`
  - `public page passes the community's real city to the layout`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/components/public-site/blocks/HeroBlock.test.tsx apps/web/__tests__/components/public-site/blocks/ContactBlock.test.tsx apps/web/__tests__/app/public-site/site-page.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Also run `pnpm test apps/web/__tests__/accessibility/public-site-axe.test.tsx`.
- [ ] **Step 5: Commit.** `git commit -m "feat(public-site): real community facts, linked fields, profile-backed contact"`

---

## Phase 2A: Two new section types and stock photos (read release)

### Task 7: Migration 0096 (allow `quicklinks` and `board`)

**Blast radius:** INTERNAL · **passes:** false

**Files:** Modify `packages/db/src/schema/site-blocks.ts` (the `check()` literal, around lines 103–106); Create (generated) `packages/db/migrations/0096_site_blocks_quicklinks_board.sql`, `packages/db/migrations/meta/0096_snapshot.json`; Modify `packages/db/migrations/meta/_journal.json`; Test: extend `apps/web/__tests__/integration/site-blocks-block-type-check.integration.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `accepts quicklinks and board block types`
  - `still rejects an unknown type`
- [ ] **Step 2: Run** `pnpm test:integration:local apps/web/__tests__/integration/site-blocks-block-type-check.integration.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  1. Add `'quicklinks'` and `'board'` to the Drizzle `check()` literal.
  2. Run `pnpm --filter @propertypro/db db:generate --name site_blocks_quicklinks_board`.
  3. Make the SQL drop and re-add `site_blocks_block_type_check` exactly as `0044_site_blocks_payments_type.sql` does, with the 11 existing types, the two new ones and `'tombstone'`.
  4. Confirm the snapshot's check literal matches. Commit `a9c60efb9` is the lesson: a mismatch makes drizzle-kit drop a type.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: `expect` block** (EXPAND):

```sql
select pg_get_constraintdef(oid) like '%quicklinks%' and pg_get_constraintdef(oid) like '%board%'
  from pg_constraint where conname = 'site_blocks_block_type_check';
```

- [ ] **Step 6: Commit.** `git commit -m "feat(db): allow quicklinks and board site blocks (0096)"`

### Task 8: Shared schemas (Quick links, Board members, stock photos)

**Blast radius:** RENDER · **passes:** false

**Files:**
- Create: `packages/shared/src/site-blocks/quicklinks.ts`, `board.ts`, `stock-photos.ts`
- Modify:
  - `packages/shared/src/site-blocks/types.ts` (`BLOCK_TYPES`), `index.ts` (`blockSchemaRegistry`), `packages/shared/src/index.ts` (barrel);
  - `hero.ts` (`heroPhotoSchema`), `hero-photos.ts` (`resolveHeroPhotos` keeps stock entries);
  - `packages/shared/src/site-diff/diff.ts` (`SECTION_TITLES`), `packages/shared/src/site-diff/validate.ts`.
- Test: create `packages/shared/__tests__/site-blocks/quicklinks.test.ts`, `board.test.ts`, `stock-photos.test.ts`; extend `packages/shared/__tests__/site-blocks/hero-photos.test.ts`. `registry-completeness.test.ts` must pass unchanged.

**Interfaces:** Produces:

```ts
export const quicklinksBlockSchema = z.object({ hidden: hiddenSchema.optional() }).strict();
export const boardBlockSchema = z.object({ heading: z.string().trim().min(1).max(80).optional(), hidden: hiddenSchema.optional() }).strict();
export const STOCK_PHOTO_IDS = ['sunset', 'palms'] as const;
export type StockPhotoId = (typeof STOCK_PHOTO_IDS)[number];
export const STOCK_PHOTO_SRC: Readonly<Record<StockPhotoId, string>>; // '/site-looks/sunset.webp', '/site-looks/palms.webp'
// heroPhotoSchema accepts the existing {path, alt | decorative} OR {stock: StockPhotoId, alt: altTextSchema} (strict); HeroPhoto becomes that union.
```

`SECTION_TITLES` adds `quicklinks: 'Quick links'` and `board: 'Board members'`.

- [ ] **Step 1: Write the failing tests:**
  - `quicklinks rejects unknown keys`
  - `board heading is 1–80 characters`
  - `hero accepts {stock:'sunset', alt}`
  - `hero rejects {stock:'beach'}`
  - `hero rejects a photo with both stock and path`
  - `resolveHeroPhotos keeps stock entries in order`
  - `validate treats quicklinks and board as known types`
- [ ] **Step 2: Run** `pnpm --filter @propertypro/shared test site-blocks site-diff`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Then run `pnpm --filter @propertypro/shared typecheck` and `pnpm --filter @propertypro/db typecheck`. apps/web and apps/admin compile again only after Task 9: adding block types breaks their exhaustive registries, as the payments read release did. So wave 2A-1's verify gate is these two package checks, and the full `pnpm typecheck` runs after wave 2A-2.
- [ ] **Step 5: Commit.** `git commit -m "feat(shared): quicklinks and board schemas; stock hero photos"`

### Task 9: Render the new sections and stock photos (no writers yet)

**Blast radius:** PUBLIC-URL · **passes:** false

**Files:**
- Create: `apps/web/src/components/public-site/blocks/QuickLinksBlock.tsx`, `QuickLinksBlockView.tsx`, `BoardBlock.tsx`, `BoardBlockView.tsx`
- Copy: `apps/web/public/marketing/v1/close-coast-1440.webp` → `apps/web/public/site-looks/sunset.webp`; `who-hoa-1100.webp` → `palms.webp`
- Modify (public site):
  - `apps/web/src/components/public-site/blocks/registry.ts`, `view-registry.ts` (both `'view'` kind, data-driven);
  - `HeroBlock.tsx` and `HeroPhotoStrip.tsx`: a stock photo renders `STOCK_PHOTO_SRC` with no `srcSet`;
  - the root `<section>` of each data view gets `id` = its block type, for Quick links anchors.
- Modify (validation and helpers):
  - `apps/web/src/lib/site-assets/scoped-paths.ts`: a stock entry has no path and passes;
  - `apps/web/src/lib/site-editor/hero-imagery.ts` and every other compile error the `HeroPhoto` union raises in apps/web and apps/admin (narrow on `'stock' in photo`).
- Modify (editor, readers only): `apps/web/src/components/pm/site-editor-v3/canvas/CanvasBlock.tsx`, `apps/web/src/lib/site-editor/preview-data.ts`, `load-canvas-context.ts`, `site-editor-v3/section-label.ts`, `site-editor-v3/use-undoable-remove.ts` (add `'payments'`, `'quicklinks'` and `'board'` to `RESTORABLE_BLOCK_TYPES`)
- Modify (admin): `apps/admin/src/lib/site-templates/block-registry.ts` (`BLOCK_META`), `apps/admin/src/components/site-templates/StarterPackBlocksEditor.tsx` (derive its list from `BLOCK_TYPES`)
- Test:
  - create `apps/web/__tests__/components/public-site/blocks/QuickLinksBlock.test.tsx` and `BoardBlock.test.tsx`;
  - extend `HeroBlock.test.tsx` and `apps/web/__tests__/lib/site-assets/scoped-paths.test.ts`;
  - update `view-registry.test.ts` (data-driven set) and `apps/web/__tests__/components/pm/site-editor-v3/add-catalog.test.ts` (exclude `quicklinks` and `board` as "not addable until Phase 2B");
  - extend `apps/admin/__tests__/site-templates/*`.

**Interfaces:** Consumes Task 8.
- `QuickLinksBlock` reads, from the reader:
  - `listMeetings({ limit: 1, timeWindowDays: 365 })`;
  - `listAnnouncements({ limit: 1 })`;
  - `getContactInfo({ showBoard: false, showManagement: true })`;
  - the page's sections (`listSiteBlocks`).
- `QuickLinksBlockView({ data: { nextMeeting: { startsAt: string } | null; showMeetings: boolean; showNews: boolean; showContact: boolean } })` renders these links:
  - **Meetings** (`#meetings`), with "Next: Tue, Nov 17" when there is a next meeting;
  - **News** (`#announcements`);
  - **Owner documents** (`/auth/login`), always;
  - **Contact** (`#contact`).

  A link appears only when its section is on this page and has content.
- `BoardBlock` reads `getContactInfo({ showBoard: true, showManagement: false })` and uses its `board`.
  - `BoardBlockView({ content, data: { members: Array<{ name: string; title: string }> } })` renders the heading (`content.heading ?? 'Board of Directors'`) and one row per member, with name and title only.
  - The shell returns `null` when there are no members.

- [ ] **Step 1: Write the failing tests:**
  - `quick links show the next meeting's date`
  - `quick links leave out News when there are no announcements`
  - `quick links always show Owner documents`
  - `board lists names and titles and never an email`
  - `board renders nothing when no one holds a seat`
  - `hero renders /site-looks/sunset.webp for a stock photo without srcSet`
  - `a stock photo passes the scoped-path check`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/components/public-site/blocks/QuickLinksBlock.test.tsx apps/web/__tests__/components/public-site/blocks/BoardBlock.test.tsx apps/web/__tests__/components/public-site/blocks/HeroBlock.test.tsx apps/web/__tests__/lib/site-assets/scoped-paths.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Then run, in order:
  1. `pnpm typecheck`
  2. `pnpm test apps/web/__tests__/components/public-site apps/web/__tests__/components/pm/site-editor-v3/add-catalog.test.ts`
  3. `pnpm --filter @propertypro/admin test site-templates`
- [ ] **Step 5: Commit.** `git commit -m "feat(public-site): quick links and board sections; stock hero photos (read release)"`

**Deploy gate:** do not merge Phase 2B until this PR is deployed to production (`vercel inspect` Ready on a SHA that contains it).

---

## Phase 2B: The four looks (write release)

### Task 10: Migration 0097 (catalog rows for the four looks)

**Blast radius:** RENDER · **passes:** false

**Files:** Create `packages/db/migrations/0097_site_looks_catalog.sql` (`pnpm db:migration:new site_looks_catalog`); Modify `packages/db/migrations/meta/_journal.json` (the scaffolder copies the snapshot); Test `apps/web/__tests__/integration/site-looks-catalog.integration.test.ts`

**Interfaces:**
- `site_theme_presets (slug, display_name, description, tokens, tier, is_featured)`, with `tier 'essentials'`, `is_featured true`, `ON CONFLICT (slug) DO NOTHING`:

  | slug | display_name | description | tokens |
  |---|---|---|---|
  | bayfront | Bayfront | Photo-led and modern. | `{"primaryColor":"#0B4F5C","secondaryColor":"#F5EFE6","accentColor":"#E9A23B","headingFont":"Playfair Display","bodyFont":"Source Sans 3"}` |
  | heritage | Heritage | Formal and official. | `{"primaryColor":"#1D2B4A","secondaryColor":"#FBF8F1","accentColor":"#7A5B27","headingFont":"Libre Baskerville","bodyFont":"Lato"}` |
  | palm-grove | Palm Grove | Warm and friendly. | `{"primaryColor":"#2D5E4A","secondaryColor":"#FBF6EA","accentColor":"#B4532A","headingFont":"Lora","bodyFont":"Nunito Sans"}` |
  | plain-simple | Plain & Simple | No photos needed, larger text. | `{"primaryColor":"#1D4E89","secondaryColor":"#EEF3FA","accentColor":"#FFF4CC","headingFont":"Figtree","bodyFont":"Figtree"}` |

  Heritage's accent is `#7A5B27`, darker than the mockup's `#9A7536`, because `#9A7536` is 4.0:1 as text on `#FBF8F1`.
- `site_layout_metadata (slug, display_name, tagline, description, tier, is_featured, default_preset_slug, version)`:
  - the same four slugs and display names;
  - `tagline` = the description above, and `description` = the same sentence;
  - `tier 'essentials'`, `is_featured true`;
  - `default_preset_slug` = the slug, `version '1.0.0'`;
  - `ON CONFLICT (slug) DO NOTHING`.

- [ ] **Step 1: Write the failing test.** `site-looks-catalog.integration.test.ts`:
  - `seeds the four presets with allowed fonts`, which imports `ALLOWED_FONTS` and checks `tokens->>'headingFont'` and `tokens->>'bodyFont'`
  - `seeds the four layouts pointing at their presets`
- [ ] **Step 2: Run** `pnpm test:integration:local apps/web/__tests__/integration/site-looks-catalog.integration.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the SQL.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: `expect` block** (EXPAND, idempotent DML):

```sql
select count(*) = 4 from site_theme_presets where slug in ('bayfront','heritage','palm-grove','plain-simple') and tokens ? 'headingFont';
select count(*) = 4 from site_layout_metadata where slug in ('bayfront','heritage','palm-grove','plain-simple') and default_preset_slug = slug;
```

- [ ] **Step 6: Commit.** `git commit -m "feat(db): catalog rows for the four looks (0097)"`

### Task 11: Four look layouts

**Blast radius:** RENDER · **passes:** false

**Files:**
- Create: `apps/web/src/components/public-site/layouts/Bayfront.tsx`, `Heritage.tsx`, `PalmGrove.tsx`, `PlainSimple.tsx`, `apps/web/src/components/public-site/layouts/look-styles.ts`
- Modify:
  - `apps/web/src/components/public-site/blocks/types.ts` (`LAYOUT_IDS` adds the four ids; `layouts/types.ts` re-exports it);
  - `layouts/registry.ts`, `layouts/SiteChrome.tsx` (four `LAYOUT_CHROME` entries);
  - `blocks/HeroBlock.tsx` (hero markup by `LOOK_STYLES[layout]`; legacy layouts are unchanged).
- Test: create `apps/web/__tests__/components/public-site/layouts/looks.test.tsx` and `look-contrast.test.ts`; extend `apps/web/__tests__/components/public-site/layouts/registry.test.ts`

**Interfaces:** Produces:

```ts
export type HeroStyle = 'photo-full' | 'photo-split' | 'photo-card' | 'text';
export interface LookStyle {
  heroStyle: HeroStyle; sectionTint: 'alternate' | 'none'; radius: 'square' | 'rounded' | 'pill';
  accentUse: 'text' | 'background';   // how the layout paints the accent colour
  onAccent: 'inverse' | 'text';       // text colour on an accent background
}
export const LOOK_STYLES: Readonly<Record<'bayfront' | 'heritage' | 'palm-grove' | 'plain-simple', LookStyle>>;
// bayfront     {photo-full,  alternate, pill,    background, text}
// heritage     {photo-split, none,      square,  text,       inverse}
// palm-grove   {photo-card,  alternate, rounded, background, inverse}
// plain-simple {text,        none,      rounded, background, text}
```

Colours come only from the theme CSS variables. The contrast test reads the preset hex values from a fixture that mirrors migration 0097, and the `--text-primary` and `--text-inverse` values from `packages/tokens`.

- [ ] **Step 1: Write the failing tests:**
  - `each look renders its hero style` (`data-hero-style` attribute)
  - `legacy layouts render unchanged` (the existing Tidewater, Boulevard and Sable tests stay green)
  - `every look's colour pairs pass AA`, for each look:
    - `--text-primary` on white and on the secondary colour ≥ 4.5;
    - the primary colour (headings) on white and on the secondary colour ≥ 3;
    - `--text-inverse` on the primary colour ≥ 4.5;
    - when `accentUse` is `'background'`, the `onAccent` colour on the accent ≥ 4.5;
    - when `accentUse` is `'text'`, the accent on white and on the secondary colour ≥ 4.5.
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/components/public-site/layouts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Then `pnpm guard:design-tokens && pnpm guard:class-resolution`.
- [ ] **Step 5: Commit.** `git commit -m "feat(public-site): bayfront, heritage, palm grove and plain & simple layouts"`

### Task 12: Looks registry, switch planner and look service

**Blast radius:** PUBLIC-URL · **passes:** false

**Files:** Create `apps/web/src/lib/site-looks/looks.ts`, `apps/web/src/lib/services/site-look-service.ts`; Test `apps/web/__tests__/lib/site-looks/looks.test.ts`, `apps/web/__tests__/lib/services/site-look-service.test.ts`, `apps/web/__tests__/integration/site-look-switch.integration.test.ts`

**Interfaces:** Consumes:
- Task 8's schemas, Task 10's presets and Task 11's layout ids;
- `ensureHomePage` (`site-pages-service.ts`, as `applyStarterPackToCommunity` uses it);
- `updateBrandingForCommunity` (`apps/web/src/lib/api/branding.ts`);
- `saveDraftDesign` (`site-design-service.ts`; it accepts `layoutId` and `themePresetSlug` into `draftLook`);
- the site-blocks service writers the editor uses, so the editor's publish and discard work unchanged.

Produces:

```ts
export type LookId = 'bayfront' | 'heritage' | 'palm-grove' | 'plain-simple';
export const LOOK_IDS: readonly LookId[];
export interface LookSection { blockType: BlockType; content: unknown }
export interface LookDefinition { id: LookId; name: string; description: string; layoutId: LayoutId; presetSlug: LookId; sections: readonly LookSection[] }
export const LOOKS: readonly LookDefinition[];
export function getLook(id: string): LookDefinition | null;
export function suggestedLookFor(type: CommunityType): LookId; // condo_718→bayfront, hoa_720→palm-grove, apartment→plain-simple
export function lookIdForLayout(layoutId: string | null | undefined): LookId | null;
export interface SiteSection { id?: number; blockType: BlockType; content: unknown }
export function planLookSwitch(input: {
  current: readonly SiteSection[];
  outgoingDefaults: readonly (readonly LookSection[])[]; // the outgoing look's sections, or every starter-pack version for the type
  incoming: LookDefinition;
}): SiteSection[]; // pure; D5

export async function applyLookAtCreation(communityId: number, communityType: CommunityType): Promise<{ applied: boolean; lookId: LookId }>;
export async function draftLookSwitch(communityId: number, lookId: LookId, opts: { actorUserId: string }): Promise<{ replaced: number; kept: number; added: number; removed: number }>;
```

**Default sections** (home page, in order; the copy is exact):
- **bayfront**
  1. hero:
     - headline `Welcome to {{name}}`
     - subtitle `{{units}} homes in {{city}}. Meeting notices, news and community records, all in one place.`
     - photos `[{stock:'sunset', alt:'Sunset over the water, with palm trees in silhouette'}]`
  2. `quicklinks {}`
  3. `announcements {limit:3}`
  4. `meetings {limit:5}`
  5. `documents {limit:5, includeCategories:['budget','minutes','financial','rules','other']}`
  6. `contact {showBoard:true, showManagement:true}`
- **heritage**
  1. hero:
     - headline `{{name}}`
     - subtitle `The website of {{name}}. Notices, meetings and records for owners and residents.`
     - photos `[{stock:'sunset', alt:'Sunset over the water, with palm trees in silhouette'}]`
  2. `announcements {limit:5}`
  3. `meetings {limit:5}`
  4. documents (as bayfront)
  5. `board {}`
  6. `contact {showBoard:false, showManagement:true}`
- **palm-grove**
  1. hero:
     - headline `Welcome home to {{name}}`
     - subtitle `News, meetings and everyday information for our neighbors. {{units}} homes in {{city}}.`
     - photos `[{stock:'palms', alt:'A quiet street lined with tall palm trees'}]`
  2. `announcements {limit:3}`
  3. `meetings {limit:5}`
  4. documents (as bayfront)
  5. `contact {showBoard:true, showManagement:true}`
- **plain-simple**
  1. hero:
     - headline `Welcome to {{name}}`
     - subtitle `Meeting notices, news and community records, in one place.`
     - no photos
  2. `quicklinks {}`
  3. `meetings {limit:5}`
  4. `announcements {limit:3}`
  5. documents (as bayfront)
  6. `contact {showBoard:true, showManagement:true}`

- [ ] **Step 1: Write the failing tests.**

  Registry:
  - `every look's sections parse with blockSchemaRegistry`
  - `no look uses a Professional-only section type` (faq, gallery, amenities)
  - `the presets mirrored for tests match migration 0097` (string-compare the SQL file)
  - `every look's welcome copy keeps a full sentence with no city and no unit count` (Review Focus 2)
  - `suggestedLookFor maps condo, HOA and apartment`

  `planLookSwitch`:
  - `an untouched site becomes exactly the incoming look, in its order`
  - `an edited hero keeps its text and slot; untouched neighbours are replaced in place` (Review Focus 4)
  - `a hidden section stays hidden` (Review Focus 4)
  - `switching to heritage inserts Board members after Documents`
  - `leaving heritage removes an untouched Board members`
  - `a legacy site's starter-pack sections count as untouched, for any pack version`

  Service:
  - `applyLookAtCreation skips a community that already has published blocks`
  - `applyLookAtCreation writes layout, preset, colours and fonts, publishes the sections, and stamps site_published_at only when null`
  - `draftLookSwitch writes draftLook and draft sections, never the live site`

  Integration: `switching twice and publishing leaves exactly the target look's sections plus the edited ones`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/lib/site-looks/looks.test.ts apps/web/__tests__/lib/services/site-look-service.test.ts` and `pnpm test:integration:local apps/web/__tests__/integration/site-look-switch.integration.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** "Untouched" compares `blockSchemaRegistry[type].parse` output on both sides. `draftLookSwitch` loads every `site_starter_packs` version for the type only when `lookIdForLayout` returns null.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(site): looks registry, switch planner and look service"`

### Task 13: New communities and prospect demos start with their suggested look

**Blast radius:** PUBLIC-URL · **passes:** false

**Files:**
- Modify: `apps/web/src/lib/services/new-community-site.ts`
- Modify: `apps/web/src/lib/services/site-look-service.ts` (add `fillDemoCommunitySite`)
- Modify: `apps/web/src/lib/services/starter-pack-service.ts` (remove `applyStarterPackToDemoCommunity`)
- Modify: `apps/web/src/app/api/v1/demo/[slug]/enter/route.ts`, `apps/web/src/app/api/v1/auth/demo-login/route.ts`, and every `vi.mock` of the old name (grep `applyStarterPackToDemoCommunity`)
- Test: update `apps/web/__tests__/lib/services/new-community-site.test.ts` and `apps/web/__tests__/lib/services/starter-pack-service.test.ts`; create `apps/web/__tests__/integration/new-community-look.integration.test.ts`

**Interfaces:** Consumes `applyLookAtCreation` (Task 12).
- `seedNewCommunitySite(communityId, communityType)` keeps its signature and its never-throws contract (log plus `captureException`).
- Produces `fillDemoCommunitySite(communityId: number): Promise<void>`. It has the old function's guards and best-effort catch: a no-op unless `isDemo`, and a no-op when any `site_blocks` row ever existed, removed rows included. It then calls `applyLookAtCreation`.

- [ ] **Step 1: Write the failing tests:**
  - `a condo gets the bayfront look with published sections`
  - `an apartment gets plain & simple`
  - `a failure is reported, never thrown`
  - `a prospect demo with no section rows gets its suggested look`
  - `a demo with any section row, even a removed one, is left alone`
  - `a community that isn't a demo is left alone`
  - Integration: `a freshly provisioned condo's public page shows no "No documents available." and no "{{"`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/lib/services/new-community-site.test.ts apps/web/__tests__/lib/services/starter-pack-service.test.ts` and `pnpm test:integration:local apps/web/__tests__/integration/new-community-look.integration.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Replace the starter-pack call and `seedDefaultSiteBranding` in `seedNewCommunitySite` with one `applyLookAtCreation` call, and move the demo function.
- [ ] **Step 4: Run.** Expected: PASS. Also run `pnpm test apps/web/__tests__/billing/provisioning-service.test.ts` and `pnpm guard:service-dead-exports`, and delete any starter-pack export it reports dead.
- [ ] **Step 5: Commit.** `git commit -m "feat(site): new communities and prospect demos go live with their suggested look"`

### Task 14: The look route (draft), the Design panel and look previews

**Blast radius:** RESIDENT-APP · **passes:** false

**Files:**
- Create: `apps/web/src/app/api/v1/pm/site/look/contract.ts`, `route.ts`
- Modify: `apps/web/src/components/pm/site-editor-v3/panels/DesignPanel.tsx`. It lists `LOOKS`, and choosing one calls the look route. This list is interim: Task 27 replaces it with a link to the picker.
- Delete: `apps/web/src/components/pm/site-editor-v3/design-templates.ts` (only `DesignPanel` imports it) and its test
- Modify: `apps/web/src/app/(site-preview)/pm/site-preview/page.tsx` (`look` param)
- Test: create `apps/web/__tests__/api/pm/site/look-route.test.ts`; update `apps/web/__tests__/components/pm/site-editor-v3/DesignPanel.test.tsx`; extend `apps/web/__tests__/app/public-site/site-preview-page.test.tsx`

**Interfaces:** Consumes Task 12. Produces `PATCH /api/v1/pm/site/look` (`siteLookPatchContract`):
- Body (strict union): `{ communityId, lookId: z.enum(LOOK_IDS) }` or `{ communityId, keepCurrent: z.literal(true) }`.
- `lookId` runs `draftLookSwitch` and returns its counts.
- `keepCurrent` runs `markSiteOnboardingComplete(communityId)` plus `tryAutoComplete(communityId, userId, 'customize_portal')`, and returns `{ ok: true }`.
- Gate: the website routes' gate (Global Constraints).
- Audit: `update` on `site_look`, with `newValues { lookId }` or `{ keepCurrent: true }`.

**Preview:** `?look=<id>` renders that look's layout and preset over `planLookSwitch(current home sections → look)`. Nothing is written.

- [ ] **Step 1: Write the failing tests:**
  - `PATCH returns 403 for a resident`
  - `PATCH returns 400 for an unknown look`
  - `PATCH lookId calls draftLookSwitch`
  - `PATCH keepCurrent marks onboarding complete and the checklist item`
  - `Design panel lists the four looks`
  - `site-preview ?look=heritage renders the heritage layout with a board section and writes nothing`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/api/pm/site/look-route.test.ts apps/web/__tests__/components/pm/site-editor-v3/DesignPanel.test.tsx apps/web/__tests__/app/public-site/site-preview-page.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Then `pnpm guard:route-gates && pnpm guard:contracts`.
- [ ] **Step 5: Commit.** `git commit -m "feat(site): look route, four looks in the Design panel, look previews"`

### Task 15: Writers (add catalog, forms, stock photos in the hero form)

**Blast radius:** RESIDENT-APP · **passes:** false

**Files:**
- Modify: `apps/web/src/components/pm/site-editor-v3/panels/add-catalog.ts` (entries for `quicklinks` and `board`, `isPolish: false`), `inspector/form-registry.ts` (dynamic entries)
- Create: `inspector/forms/BoardForm.tsx` (heading), `inspector/forms/QuickLinksForm.tsx` (no fields; explains it fills itself)
- Modify:
  - `inspector/forms/HeroForm.tsx`: a "Shows as: …" line under headline and subtitle, using `resolveLinkedText` with the canvas facts;
  - `inspector/forms/fields/HeroPhotosField.tsx`: a stock photo shows its thumbnail and can be removed or replaced, and its alt text stays editable.
- Test: update `add-catalog.test.ts` (remove the Phase 2A exclusion) and `form-registry.test.ts`; extend `inspector-forms.test.tsx` and `apps/web/__tests__/components/pm/site-editor-v3/HeroPhotosField.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - `the Add panel offers Quick links and Board members on every plan`
  - `every addable type has a dynamic form`
  - `the hero form shows "Shows as: Welcome to Harbor Pointe" for "Welcome to {{name}}"`
  - `a stock photo shows its thumbnail and can be removed or replaced`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/components/pm/site-editor-v3/add-catalog.test.ts apps/web/__tests__/components/pm/site-editor-v3/form-registry.test.ts apps/web/__tests__/components/pm/site-editor-v3/inspector-forms.test.tsx apps/web/__tests__/components/pm/site-editor-v3/HeroPhotosField.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Then `pnpm build && pnpm perf:check` (editor route).
- [ ] **Step 5: Commit.** `git commit -m "feat(site-editor): add quick links and board sections; stock photos and preview line in the hero form"`

---

## Phase 3: Records automation

### Task 16: Record-matching rules

**Blast radius:** INTERNAL · **passes:** false

**Files:** Create `packages/shared/src/compliance/record-matching.ts`; Modify `packages/shared/src/index.ts`; Test `packages/shared/__tests__/compliance/record-matching.test.ts`

**Interfaces:** Produces:

```ts
export interface RecordMatchRule { categoryKeys: readonly DocumentCategoryKey[]; title: RegExp }
export const RECORD_MATCH_RULES: Readonly<Record<string, RecordMatchRule>>; // keyed by templateKey
export interface MatchableDocument { title: string; fileName: string; categoryKey: DocumentCategoryKey }
export function matchingTemplateKeys(doc: MatchableDocument, candidateKeys: readonly string[]): string[];
export function proposeTemplateKeyForFile(fileName: string, candidateKeys: readonly string[]): string | null; // exactly one title match on the file name, else null
```

**Rules:** each rule matches the title or the file name, case-insensitive.

| Template keys | Categories | Title pattern |
|---|---|---|
| `718_declaration` | declaration | `\bdeclaration\b` |
| `718_bylaws` | declaration | `\bby-?laws?\b` |
| `718_articles`, `720_articles` | declaration | `\barticles\b` |
| `718_rules` | declaration, rules | `\brules?\b\|\bregulations?\b` |
| `718_qa_sheet` | declaration | `question.{0,6}answer\|\bq\s*&\s*a\b` |
| `718_budget`, `720_budget` | financial_records | `\bbudget\b` |
| `718_financial_report`, `720_financial_report` | financial_records | `financial\s+(report\|statement)s?\|\baudit(ed)?\b\|\bcompilation\b\|review\s+report` |
| `718_minutes_rolling_12m`, `720_minutes_rolling_12m` | meeting_minutes | `\bminutes\b` |
| `718_video_recordings` | meeting_minutes | `\brecording\b\|\bvideo\b` |
| `718_meeting_notices`, `720_meeting_notices` | meeting_minutes | `\bnotice\b\|\bagenda\b` |
| `718_affidavits` | declaration, meeting_minutes | `\baffidavit` |
| `718_insurance`, `720_insurance` | insurance | any title |
| `718_contracts` | contracts | `list\s+of\s+(executory\s+)?contracts\|contracts?\s+list` |
| `718_conflict_contracts` | contracts | `conflict\s+of\s+interest` |
| `718_bids`, `720_bids` | contracts | `\bbids?\b` |
| `718_inspection_reports` | inspection_reports | `milestone\|structural\s+inspection` |
| `718_sirs` | inspection_reports | `reserve\s+study\|\bsirs\b` |
| `720_governing_docs` | declaration | `declaration\|covenants` |
| `720_bylaws_rules` | declaration, rules | `by-?laws?\|\brules?\b\|regulations?` |
| `720_contracts` | contracts | `\bcontract` |

- [ ] **Step 1: Write the failing tests:**
  - `each condo and HOA key matches a realistic title` (table-driven)
  - `a budget title in the insurance category matches nothing`
  - `'Declaration and Bylaws.pdf' returns two keys (ambiguous)`
  - `proposeTemplateKeyForFile('2025-financial-report.pdf', condoKeys) is 718_financial_report`
  - `every template key in templates.ts has a rule`
- [ ] **Step 2: Run** `pnpm --filter @propertypro/shared test record-matching`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(shared): rules for matching documents to Florida records"`

### Task 17: Automatic linking, candidates and audited unlinking

**Blast radius:** RESIDENT-APP · **passes:** false

**Files:**
- Create: `apps/web/src/lib/services/record-auto-link-service.ts`
- Modify (triggers):
  - `apps/web/src/app/api/v1/documents/route.ts`: after `createUploadedDocument` when not a draft, and in `changePostedState` after posting;
  - `apps/web/src/app/api/v1/documents/drafts/[id]/publish/route.ts`: after `createAuthoredDocument`;
  - `apps/web/src/lib/pm/bulk-document-upload.ts`: one `autoLinkCommunityRecords` call after the insert.
- Modify: `apps/web/src/lib/services/compliance-service.ts`: `unlinkChecklistItemsForDocument` audits `unlink_document` per unlinked item.
- Test:
  - create `apps/web/__tests__/lib/services/record-auto-link-service.test.ts` and `apps/web/__tests__/compliance/unlink-audit.test.ts`;
  - extend `apps/web/__tests__/documents/documents-route.test.ts`;
  - create `apps/web/__tests__/integration/record-auto-link.integration.test.ts`.

**Interfaces:** Consumes:
- Task 16;
- `getDocumentCategoryNames` (`document-category-service.ts`), `normalizeCategoryName`, `getComplianceTemplate` (`@propertypro/shared`);
- `logAuditEvent`.

Produces:

```ts
export async function autoLinkDocument(communityId: number, documentId: number, actorUserId: string | null):
  Promise<{ templateKey: string | null; outcome: 'linked' | 'ambiguous' | 'no_match' | 'not_eligible' }>;
export async function autoLinkCommunityRecords(communityId: number, actorUserId: string | null):
  Promise<{ linked: number; ambiguous: number }>;
export async function listRecordCandidates(communityId: number):
  Promise<Record<number, Array<{ documentId: number; title: string }>>>; // checklist item id → eligible, unlinked posted documents matching its rule
```

**Rules (D12):**
- Only condo and HOA communities.
- Only eligible documents (Global Constraints).
- Candidate items are applicable, unlinked and have a rule.
- The update:
  - is `WHERE id = $item AND document_id IS NULL AND deleted_at IS NULL`;
  - sets `document_id`, `document_posted_at` and `auto_linked_document_id` together;
  - counts zero rows updated as `not_eligible`.
- Audit: `link_document` on `compliance_checklist_item`, with `metadata { linkedBy: 'auto_match', templateKey }`.
- Every trigger is wrapped in `try/catch` plus `captureException`, and never fails the request.

- [ ] **Step 1: Write the failing tests:**
  - `links a posted budget in Financial Records to 718_budget and records auto_linked_document_id`
  - `does not link a draft`
  - `does not link violation evidence`
  - `does nothing for an apartment`
  - `never replaces an existing link`
  - `does not link when two posted budgets both match, and lists both as candidates` (Review Focus 3)
  - `audits with linkedBy auto_match`
  - `unlinking a document audits unlink_document for each item`
  - `documents POST calls autoLinkDocument once for a posted upload and never for a draft`
  - `an auto-link failure does not fail the upload`
  - Integration: `a posted budget links; a second budget uploaded later does not steal the link`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/lib/services/record-auto-link-service.test.ts apps/web/__tests__/compliance/unlink-audit.test.ts apps/web/__tests__/documents/documents-route.test.ts` and `pnpm test:integration:local apps/web/__tests__/integration/record-auto-link.integration.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Then `pnpm guard:route-table-imports`: routes must not import `complianceChecklistItems`; the service does the query.
- [ ] **Step 5: Commit.** `git commit -m "feat(compliance): link posted documents to Florida records automatically"`

### Task 18: "Doesn't apply" needs a reason; the checklist exposes auto-links

**Blast radius:** RESIDENT-APP · **passes:** false

**Files:** Modify `apps/web/src/app/api/v1/compliance/contract.ts`, `route.ts`, `apps/web/src/hooks/use-compliance-mutations.ts`, `apps/web/src/lib/compliance/load-checklist-with-status.ts`, `apps/web/src/components/compliance/compliance-checklist-item.tsx`; Test: extend `apps/web/__tests__/compliance/compliance-route.test.ts` and `apps/web/src/hooks/__tests__/use-compliance-mutations.test.tsx`

**Interfaces:**
- The PATCH body adds `reason: z.string().trim().min(1).max(200).optional()`. A refine requires it when `action === 'mark_not_applicable'`.
- The hook becomes `markNotApplicable({ itemId: number; reason: string })`.
- The audit adds `newValues: { reason }`. `mark_applicable` sets `notApplicableReason: null`.
- `ChecklistItemData` (in `compliance-checklist-item.tsx`) gains `notApplicableReason?: string | null` and `autoLinkedDocumentId?: number | null`. `loadChecklistWithStatus` and the GET response carry both.

- [ ] **Step 1: Write the failing tests:**
  - `400 when mark_not_applicable has no reason`
  - `stores and audits the reason`
  - `mark_applicable clears the reason`
  - `GET returns autoLinkedDocumentId and notApplicableReason`
  - Update the existing `mark_not_applicable` tests to send a reason.
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/compliance/compliance-route.test.ts apps/web/src/hooks/__tests__/use-compliance-mutations.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(compliance): record why an item doesn't apply; expose automatic links"`

### Task 19: Missing records, and the requirements pill counts records

**Blast radius:** RESIDENT-APP · **passes:** false

**Files:** Modify `apps/web/src/lib/site-editor/records-status.ts`, `apps/web/src/components/pm/site-editor-v3/RequirementsPill.tsx`; Test: extend `apps/web/__tests__/lib/site-editor/records-status.test.ts`; update `apps/web/__tests__/components/pm/site-editor-v3/required-sections.test.tsx`

**Interfaces:** Consumes Task 18's `ChecklistItemData` fields. Produces:

```ts
export interface MissingRecord { itemId: number; templateKey: string; title: string; category: string; state: 'nothing_posted' | 'not_posted' | 'out_of_date' }
export function missingRecordItems(items: readonly ChecklistItemData[], subject: ComplianceSubject): MissingRecord[]; // [] unless requirementLevel(subject) === 'required'; non-conditional, applicable, not up to date
export function conditionalRecordItems(items: readonly ChecklistItemData[], subject: ComplianceSubject): MissingRecord[]; // conditional, applicable, no record
export function autoLinkedRecordCount(items: readonly ChecklistItemData[]): number; // documentId != null && documentId === autoLinkedDocumentId
```

The pill reads `Records: {posted} of {total} posted`, with totals as `summarizeRecords` computes them. `allSet` is true only when `missingRecordItems(...)` is empty and every required section is visible. It uses `useComplianceChecklist(communityId)`.

- [ ] **Step 1: Write the failing tests:**
  - `below the threshold nothing is missing`
  - `a record linked to a draft is not_posted`
  - `items marked not applicable are excluded`
  - `conditional items are only in conditionalRecordItems`
  - `autoLinkedRecordCount ignores items relinked by hand`
  - `the pill reads "Records: 9 of 12 posted" for the fixture and is not "all set"`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/lib/site-editor/records-status.test.ts apps/web/__tests__/components/pm/site-editor-v3/required-sections.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(site-editor): requirements pill counts posted records"`

### Task 20: Backfill script (dry run by default)

**Blast radius:** INTERNAL · **passes:** false

**Files:** Create `scripts/backfill-record-auto-links.ts`; Test `scripts/__tests__/backfill-record-auto-links.test.ts` (the `scripts` vitest project)

**Interfaces:** Consumes `autoLinkCommunityRecords` (Task 17) and its pure planning half.
- Flags:
  - `--apply`; the default is a dry run;
  - `--community <id>`, repeatable;
  - `--operator <name>`, required with `--apply` and written to the audit `metadata.operator`.
- A dry run prints the planned links and the ambiguous items per community, and writes nothing.
- Main-module detection uses `isMainModule(import.meta.url)` (`scripts/lib/is-main-module.ts`).

- [ ] **Step 1: Write the failing tests:**
  - `a dry run writes nothing and prints planned links`
  - `--apply without --operator exits 2`
- [ ] **Step 2: Run** `pnpm test scripts/__tests__/backfill-record-auto-links.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Then `pnpm typecheck` (the scripts project).
- [ ] **Step 5: Commit.** `git commit -m "feat(scripts): backfill automatic record links (dry run by default)"`

**Human step, not for `/phase-run`:** run the dry run against production and review the output with the product owner. Then run `--apply --operator <name>`.

---

## Phase 4: Website home, look picker, owner email, dashboard, retired guides

Task 25 lands in wave 4-1, before Task 26: its deletions offset the new pages in the size budget.

### Task 21: The look picker, and publishing a look in one click

**Blast radius:** RESIDENT-APP · **passes:** false

**Files:**
- Modify: `apps/web/src/app/api/v1/pm/site/look/contract.ts`, `route.ts` (add `POST`)
- Create: `apps/web/src/lib/services/website-home-service.ts`
- Create: `apps/web/src/app/(authenticated)/pm/website/looks/page.tsx`, `apps/web/src/components/website-home/look-picker.tsx`, `look-preview-frame.tsx`
- Create: `apps/web/src/hooks/use-site-look.ts`
- Test:
  - extend `apps/web/__tests__/api/pm/site/look-route.test.ts`;
  - create `apps/web/__tests__/components/website-home/look-picker.test.tsx`, `apps/web/__tests__/lib/services/website-home-service.test.ts`, `apps/web/__tests__/accessibility/look-picker-axe.test.tsx`.

**Interfaces:** Consumes Tasks 4, 12, 14 and 19. Produces:

```ts
export interface SiteFacts {
  profile: CommunityProfile;                       // Task 4
  communityType: CommunityType;
  upcomingMeetingCount: number;                    // public reader listMeetings({ limit: 50, timeWindowDays: 365 }).length
  newsCount: number;                               // public reader listAnnouncements({ limit: 50 }).length
  recordsPosted: number; recordsTotal: number;     // summarizeRecords over loadChecklistWithStatus
  liveLookId: LookId | null;                       // lookIdForLayout(branding.layoutId); null = a legacy look
  draftLookId: LookId | null;                      // lookIdForLayout(branding.draftLook?.layoutId)
  pendingDraftCount: number;                       // the count GET /api/v1/pm/site/drafts reports
  siteUrl: string;
}
export async function loadSiteFacts(communityId: number): Promise<SiteFacts>;
```

- **`POST /api/v1/pm/site/look`** (`siteLookPostContract`)
  - Body: `{ communityId, lookId, expectedPublishedAt: string | null }`.
  - It calls, in order:
    1. `draftLookSwitch`
    2. `publishCommunitySite`
    3. `markSiteOnboardingComplete`
    4. `tryAutoComplete(…, 'customize_portal')`
  - It returns `{ publishedAt: string; lookId }`. A stale token gets 409 from `publishCommunitySite`.
  - It never calls `notifyResidentsOfSitePublish`.
- **`useSiteLook(communityId)`** returns `{ selectLook, publishLook, keepCurrent }`.
  - `selectLook` is the PATCH, run serially with `scope: { id: \`site-look-${communityId}\` }`.
  - `publishLook` sends the token from `useSitePublishToken(communityId)` (`hooks/use-content-blocks.ts`).

**Page** (gates like the editor page, else redirect; calls `tryAutoComplete(communityId, userId, 'customize_portal')` on render):
- **Heading.** `PageHeader title="Pick a look"`, then a visible `<h2>`: "Pick a look for {name}'s website". The line under it: "Your site is already live with {live look name}. You can change anything later."
- **Filled in for you** (read-only chips):
  - name and address;
  - unit count and type;
  - "{n} upcoming meetings · {n} news posts" (50 shows as "50+");
  - "{posted} of {total} records found in Documents" (condo and HOA only);
  - "Welcome photo and message".

  Plus a link to the Community profile settings section.
- **Look cards.** Four cards, each a scaled `LookPreviewFrame`:
  - the frame is `/pm/site-preview?communityId=&look=<id>&preview=true`, with `loading="lazy"`, `inert`, `aria-hidden` and `tabIndex={-1}`;
  - each card has a real `<button>`, which calls `selectLook`;
  - the picker opens on `draftLookId ?? liveLookId`;
  - the live look is marked **Live now**; when `liveLookId` is null: "Your site uses an older look".
- **Large preview** of the selection at 1120 or 390 px wide (Computer/Phone switch).
- **Sticky bar:**
  - the text "Nothing changes until you click Publish";
  - **Open full preview** (new tab, same URL);
  - **Keep this look** (outline), which calls `keepCurrent`, then goes to `/pm/website`;
  - **Publish this look** (primary, disabled while the live look is selected). On success it goes to `/pm/website?communityId=&published=1`.
  - When `pendingDraftCount > 0`: "You also have {n} unpublished edits. They'll publish too."

- [ ] **Step 1: Write the failing tests:**
  - `POST switches, publishes, then marks onboarding and the checklist, in that order`
  - `POST never sends an owner email`
  - `POST returns 409 on a stale token`
  - `visiting the picker completes customize_portal`
  - `the picker opens on the draft look when there is one, else the live look`
  - `selecting a look saves a draft and publishes nothing`
  - `Publish is disabled while the live look is selected`
  - `loadSiteFacts counts what the public site shows`
  - `preview frames are inert and out of the tab order`
  - `the axe run has no violations`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/api/pm/site/look-route.test.ts apps/web/__tests__/components/website-home/look-picker.test.tsx apps/web/__tests__/lib/services/website-home-service.test.ts apps/web/__tests__/accessibility/look-picker-axe.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** Mirror `WizardLivePreview.tsx`'s iframe setup; Task 25 deletes that file.
- [ ] **Step 4: Run.** Expected: PASS. Then `pnpm guard:page-header && pnpm guard:page-padding && pnpm guard:breadcrumbs`.
- [ ] **Step 5: Commit.** `git commit -m "feat(website): pick a look and publish it in one click"`

### Task 22: "Email owners", sent once; publishing stops emailing

**Blast radius:** RESIDENT-APP · **passes:** false

**Files:**
- Modify: `apps/web/src/lib/services/site-publish-notification.ts`. Add `audience?: 'all' | 'owners_only'` (default `'all'`), used for the announcement, the delivery and the audit metadata.
- Create: `apps/web/src/lib/services/site-live-notice-service.ts`, `apps/web/src/app/api/v1/pm/site/live-notice/contract.ts`, `route.ts`, `apps/web/src/hooks/use-site-live-notice.ts`
- Modify: `apps/web/src/components/pm/site-editor-v3/publish/PublishSheet.tsx` (remove the email box and its state)
- Test:
  - create `apps/web/__tests__/api/pm/site/live-notice-route.test.ts` and `apps/web/__tests__/lib/services/site-live-notice-service.test.ts`;
  - update `apps/web/__tests__/components/pm/site-editor-v3/PublishSheet.test.tsx`;
  - extend the existing `notifyResidentsOfSitePublish` tests (grep under `apps/web/__tests__`).

**Interfaces:**

```ts
export interface SiteLiveNoticeState { sentAt: string | null; dismissedAt: string | null; ownerCount: number; offerable: boolean }
export async function getSiteLiveNoticeState(communityId: number): Promise<SiteLiveNoticeState>; // ownerCount = resident members with is_unit_owner; offerable = both dates null && ownerCount > 0
export async function claimSiteLiveNotice(communityId: number): Promise<boolean>; // UPDATE … SET site_live_notice_sent_at = now() WHERE id = $1 AND site_live_notice_sent_at IS NULL; true when one row changed
export async function releaseSiteLiveNotice(communityId: number): Promise<void>;
export async function dismissSiteLiveNotice(communityId: number): Promise<void>;
```

- **`POST /api/v1/pm/site/live-notice`** with `{ communityId }`:
  1. Runs the website routes' gate, then `requirePermission(membership, 'announcements', 'write')`.
  2. Claims the send. A lost claim throws `ConflictError` (409).
  3. Calls `notifyResidentsOfSitePublish({ communityId, actorUserId, summary: 'Our community website is live', audience: 'owners_only' })`.
  4. On `'failed'`, releases the claim. On `'partial'`, keeps it (the announcement exists).
  5. Returns `{ status: 'sent' | 'partial' | 'failed', recipientCount?: number, reason?: string }`.
- **`PATCH`** with `{ communityId, dismissed: true }` calls `dismissSiteLiveNotice` and audits `update` on `site_live_notice`.
- **`useSiteLiveNotice(communityId)`** returns `{ send, dismiss }`.

- [ ] **Step 1: Write the failing tests:**
  - `sends once to owners and stamps sent_at` (audience `'owners_only'`)
  - `a second POST returns 409 and sends nothing` (Review Focus 5)
  - `when two requests race, only the one that claims the row sends` (claim returns false)
  - `a failed send releases the claim and reports failed`
  - `a partial send keeps the claim`
  - `a resident gets 403`
  - `PATCH dismissed stamps dismissed_at`
  - `offerable is false without owners, after sending, or after dismissing`
  - `the publish sheet offers no email and never sends notifyResidents`
  - `notifyResidentsOfSitePublish defaults to audience all`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/api/pm/site/live-notice-route.test.ts apps/web/__tests__/lib/services/site-live-notice-service.test.ts apps/web/__tests__/components/pm/site-editor-v3/PublishSheet.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Then `pnpm guard:route-gates && pnpm guard:contracts`.
- [ ] **Step 5: Commit.** `git commit -m "feat(website): email owners once that the site is live; publishing no longer emails"`

### Task 23: Records actions kit (drawer, doesn't-apply dialog, snooze and count)

**Blast radius:** RESIDENT-APP · **passes:** false

**Files:**
- Create: `apps/web/src/components/website-home/records/add-records-drawer.tsx`, `not-applicable-dialog.tsx`, `applies-hint.ts`
- Create: `apps/web/src/app/api/v1/pm/site/records-alert/contract.ts`, `route.ts`, `apps/web/src/hooks/use-records-alert.ts`
- Test: `apps/web/__tests__/components/website-home/records/add-records-drawer.test.tsx`, `not-applicable-dialog.test.tsx`, `apps/web/__tests__/api/pm/site/records-alert-route.test.ts`

**Interfaces:** Consumes existing pieces:
- `proposeTemplateKeyForFile` (Task 16)
- `missingRecordItems` and `conditionalRecordItems` (Task 19)
- `markNotApplicable` (Task 18)
- `getTemplateDocumentCategory(templateKey, fallback)` (`components/compliance/compliance-visibility.ts`)
- `useDocumentCategories(communityId).resolveCategoryId`
- `uploadDocumentFile` (`hooks/use-document-upload.ts`)
- `POST /api/v1/documents` and `useComplianceMutations().linkDocument`
- `getCommunityUnitCount` and `mergeUserPreference(userId, key, patch)`

**Hints** (`APPLIES_HINT: Readonly<Record<string, string>>`, exact copy):

| Keys | Hint |
|---|---|
| `718_inspection_reports`, `718_sirs` | "Usually applies to buildings three or more stories tall." |
| `718_bids`, `720_bids` | "Usually applies once a bidding period for a contract has closed." |
| `718_video_recordings` | "Usually applies when meetings are held by video conference." |
| `718_conflict_contracts` | "Usually applies when the association has a contract with a director, an officer, or a relative of one." |

**Drawer** (`AddRecordsDrawer({ communityId, missing, conditional, onClose })`):
1. Each dropped file gets a proposed item, shown with a **Matched** badge and **Change** to pick another.
2. Each file is uploaded as posted in its item's category. The redaction attestation checkbox shows once if any category is sensitive.
3. Each upload is then linked with `linkDocument`.
4. **Post {n} records** runs them, two at a time.
5. A "May apply" group lists the conditional items with their hint and **Doesn't apply**.

**Dialog** (`NotApplicableDialog({ item, onDone })`). A reason is required. The choices depend on the item:
- inspections and the reserve study: "The building is under three stories";
- bids: "No bidding period has closed";
- video recordings: "We don't hold meetings by video";
- conflict contracts: "No contracts with directors or officers";
- every item: "Another reason", which opens a text box.

**Route:** `GET` and `PATCH /api/v1/pm/site/records-alert`.
- `GET` returns `{ snoozedUntil: string | null; missingCount: number }`. `missingCount` uses `missingRecordItems` with the community's type and unit count.
- `PATCH` takes `{ communityId, snoozeDays: z.literal(7) }` and writes `site_records_alert:<communityId>` with `{ snoozedUntil }`.
- Both use the website routes' gate.

`useRecordsAlert(communityId)` returns the query plus `{ snooze }`.

- [ ] **Step 1: Write the failing tests:**
  - `proposes "Annual financial report" for 2025-financial-report.pdf`
  - `Change overrides the proposal`
  - `a sensitive category needs the attestation before Post is enabled`
  - `Post uploads then links each file`
  - `the dialog requires a reason`
  - `conditional items show their hint`
  - `snooze is stored per user`
  - `GET counts missing records for a covered condo and returns 0 below the threshold`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/components/website-home/records apps/web/__tests__/api/pm/site/records-alert-route.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(website): add missing records, doesn't-apply reasons, snooze"`

### Task 24: Nav, dashboard card and portfolio links

**Blast radius:** RESIDENT-APP · **passes:** false

**Files:**
- Modify: `apps/web/src/components/layout/nav-config.ts`:
  - the Website `href` becomes `/pm/website?communityId=`;
  - `matchPrefixes` adds `'/pm/website'`;
  - `NavBadgeSignal` adds `'missingRecords'`.
- Modify: `apps/web/src/components/layout/app-sidebar.tsx`. It resolves `missingRecords` from `useRecordsAlert(communityId).data.missingCount` for condo and HOA managers with `hasSiteEditor`.
- Create: `apps/web/src/components/website-home/website-live-card.tsx`
- Modify: `apps/web/src/app/(authenticated)/dashboard/page.tsx` and `apps/web/src/app/(authenticated)/dashboard/apartment/page.tsx`. Both render `WebsiteLiveCard` where they rendered `FoundingAhaPanel`.
- Delete: `apps/web/src/components/onboarding/founding-aha-panel.tsx`, `apps/web/__tests__/onboarding/founding-aha-panel.test.tsx`
- Modify: `apps/web/src/components/pm/SiteSetupBanner.tsx`, `apps/web/src/components/pm/portfolio-columns.tsx`, `apps/web/src/components/onboarding/onboarding-checklist.tsx` (`ACTION_ROUTES.customize_portal`). Every link to the wizard becomes `/pm/website?communityId=`.
- Test:
  - create `apps/web/__tests__/components/website-home/website-live-card.test.tsx`;
  - extend `apps/web/__tests__/layout/nav-config.test.ts`;
  - update the mocks in `apps/web/__tests__/app/dashboard/*`;
  - update `apps/web/__tests__/pm/portfolio-site-pill.test.tsx`, `site-setup-banner.test.tsx`, `pm-dashboard-site-setup-banner.test.tsx` and `apps/web/__tests__/components/onboarding/action-routes-resolution.test.ts`.

**Interfaces:** Consumes `useSiteLook` (Task 21) and `useRecordsAlert` (Task 23). `WebsiteLiveCard({ communityId, communityName, publicUrl })` renders:
- the heading "Your website is live";
- a lazy, inert preview frame;
- **View site**, **Pick a different look** (`/pm/website/looks?communityId=`) and **Open website home**;
- **Dismiss**, which calls `keepCurrent`.

It renders for `property_manager` and `root_manager` with `hasSiteEditor` while `site_onboarding_completed_at` is null.

- [ ] **Step 1: Write the failing tests:**
  - `the Website nav item opens the website home`
  - `the badge shows the missing count for a covered condo`
  - `the dashboard shows the card for both manager roles, not residents`
  - `the card hides once onboarding is complete`
  - `Dismiss calls keepCurrent`
  - `no link points at /pm/onboarding/website`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/components/website-home/website-live-card.test.tsx apps/web/__tests__/layout/nav-config.test.ts apps/web/__tests__/app/dashboard apps/web/__tests__/pm/portfolio-site-pill.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Then `grep -rn "pm/onboarding/website" apps/web/src` returns only Task 25's redirect page.
- [ ] **Step 5: Commit.** `git commit -m "feat(website): one go-live card; nav points at the website home"`

### Task 25: Retire the wizard, mode chooser, tour and Next steps

**Blast radius:** RESIDENT-APP · **passes:** false

**Files:**
- Move first: `PresetCards` and `PresetCardData` to `apps/web/src/components/pm/site-editor-v3/panels/preset-cards.tsx`, and repoint `DesignPanel.tsx` and `EditorRoot.tsx`.
- Delete:
  - `apps/web/src/components/pm/site-editor-v3/guidance/ModeChooser.tsx`, `EditorTour.tsx`, `tour-steps.ts`, `NextSteps.tsx`, `GuidedTabs.tsx`, `ModeSwitch.tsx`, `guided-panel-id.ts`
  - `apps/web/src/lib/site-editor/next-steps.ts`
  - `apps/web/src/hooks/use-site-editor-preferences.ts`, `apps/web/src/app/api/v1/pm/site-editor/preferences/*`, `apps/web/__tests__/pm/site-editor-preferences-route.test.ts`
  - `apps/web/src/hooks/use-website-wizard.ts`, `apps/web/src/app/api/v1/pm/onboarding/website/*`
  - `apps/web/src/components/pm/onboarding-wizard/*`
  - the tests for each of these.

  Keep `apps/web/src/lib/db/theme-preset-catalog.ts`: the site-preview page uses it.
- Replace: `apps/web/src/app/(authenticated)/pm/onboarding/website/page.tsx` with a 307 redirect to `/pm/website?communityId=` (`// breadcrumbs:exempt — redirect-only page`)
- Modify (editor):
  - `EditorRoot.tsx`: remove the mode, tour, next-steps, wizard-banner and preferences state and slots;
  - `EditorShell.tsx`: keep only the non-guided branch;
  - `EditorTopBar.tsx`: remove `ModeSwitch`;
  - `tools.ts`: drop `EditorMode`;
  - `help/HelpDrawer.tsx`: drop the mode cards and the tour;
  - `apps/web/src/app/(site-editor)/pm/website-editor/page.tsx`: drop `showWizardBanner`.
- Modify (guards and fixtures): `scripts/verify-page-state-copy.ts` and `scripts/page-state-copy-baseline.json` (remove the wizard root and its entries); `scripts/help-capture/fixtures.ts` (drop the `site_editor_mode` write)
- Modify (E2E): `apps/web/e2e/responsive-overflow.spec.ts` (remove the `/pm/onboarding/website` block) and `apps/web/e2e/ci-safe-specs.json` (lower `expectedTestCount` by the count CI prints for the removed block, in the same PR)
- Test: update `EditorRoot.test.tsx`, `EditorShell.test.tsx` and `HelpDrawer.test.tsx`

- [ ] **Step 1: Write the failing test.** Add `the editor opens straight to editing with no chooser, tour or banner` to `EditorRoot.test.tsx`, and remove the assertions for deleted behaviour.
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/components/pm/site-editor-v3/EditorRoot.test.tsx`. Expected: FAIL (the chooser still renders).
- [ ] **Step 3: Implement** the move, the deletions and the edits.
- [ ] **Step 4: Run** `pnpm test apps/web/__tests__/components/pm/site-editor-v3` and `pnpm lint`. `pnpm lint` covers every guard, including `guard:service-dead-exports`; `updateCommunityName` is still called by Task 4. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "chore(site-editor): retire the wizard, mode chooser, tour and next steps"`

### Task 26: The website home page

**Blast radius:** RESIDENT-APP · **passes:** false

**Files:**
- Modify: `apps/web/src/lib/services/website-home-service.ts` (add `loadWebsiteHome`)
- Create: `apps/web/src/app/(authenticated)/pm/website/page.tsx`
- Create: `apps/web/src/components/website-home/website-home.tsx`, `site-status-banner.tsx`, `missing-records-alert.tsx`, `coming-up-card.tsx`, `site-details-card.tsx`, `your-site-card.tsx`
- Create: `apps/web/src/hooks/use-restore-previous-site.ts`
- Test:
  - extend `apps/web/__tests__/lib/services/website-home-service.test.ts`;
  - create `apps/web/__tests__/components/website-home/website-home.test.tsx`, `apps/web/__tests__/hooks/use-restore-previous-site.test.tsx`, `apps/web/__tests__/accessibility/website-home-axe.test.tsx`, `apps/web/__tests__/pm/website-home-page-auth.test.ts`.

**Interfaces:** Consumes:
- Tasks 17, 19, 21, 22 and 23;
- `paginateSitePublishHistory` (`site-blocks-service.ts`);
- `listMeetingsForCommunity(communityId, { startUtc, endUtcExclusive })` (`meeting-service.ts`);
- `TransparencyToggle` (`@/components/transparency/transparency-toggle`);
- `UploadDocumentModal` (`components/compliance/upload-document-modal.tsx`).

Produces:

```ts
export interface WebsiteHomeData {
  facts: SiteFacts;                                                              // Task 21
  lastPublish: { publishedAt: string; byName: string | null } | null;           // newest snapshot and its actor's name
  history: Array<{ snapshotId: number; publishedAt: string; byName: string | null }> | null; // latest 10; null unless hasSitePolishBlocks
  liveNotice: SiteLiveNoticeState;                                               // Task 22
  records: {
    level: RequirementLevel;
    missing: MissingRecord[]; conditional: MissingRecord[]; autoLinked: number;  // Task 19
    candidates: Record<number, Array<{ documentId: number; title: string }>>;    // Task 17
    snoozedUntil: string | null;
  };
  upcomingMeetings: Array<{ id: number; title: string; startsAt: string; noticePosted: boolean }>; // next 90 days
}
export async function loadWebsiteHome(communityId: number, userId: string): Promise<WebsiteHomeData>;
export function useRestorePreviousSite(communityId: number): { restoreLatest: () => Promise<void>; restoreSnapshot: (snapshotId: number) => Promise<void> };
// restoreLatest: revert to the second-newest snapshot, then publish with the current token
```

**Server page:**
1. Gates like the editor page, else redirects.
2. Calls `ensureTransparencyChecklistInitialized(communityId, communityType)` for condo and HOA.
3. Renders `loadWebsiteHome`.
4. `AddRecordsDrawer` and `NotApplicableDialog` load with `next/dynamic`.

**Sections:**
- **Status.**
  - With `?published=1`: "{name}'s website has been updated". Otherwise: "Your website is live".
  - Both show the address, **View site** and **Copy link**.
  - While `liveNotice.offerable`: "Let owners know their association has a website.", with **Email owners** and **Not now** (dismiss).
- **Records** (condo and HOA). This section follows `records.level`:
  - `'required'`, with missing items, not snoozed: the amber alert.
    - It opens with "{autoLinked} records were linked automatically from Documents." and "{n} records are still missing:".
    - Each row shows its title and state, with **Upload** (`UploadDocumentModal`, category from `getTemplateDocumentCategory`, then `linkDocument`).
    - A row with candidates adds "Possible matches in Documents:", and each title has **Use this one** (`linkDocument`).
    - Conditional rows show their hint and **Doesn't apply**.
    - It ends with **Add several at once**, **Remind me next week** and the statute line.
  - `'recommended'`: one line, "Florida's website rule doesn't cover associations of this size, so this list is a recommendation. Many associations post these records anyway.", and no alert.
  - `'none'`: nothing.
- **Coming up.** Each meeting shows "Notice marked posted" or "Notice not marked posted yet", with a link to Meetings.
- **Details on your site.** Each profile field, or "Not added yet, so it's hidden on the site", with a link to the Community profile.
- **Your site.**
  - Look name, or "An older look"; **Edit your site**; **Change look**.
  - "Last published {relative time} by {name}".
  - **Restore previous version** asks first: "Your site goes back to how it was before the last publish. Unpublished edits are discarded."
  - When `history` isn't null, **See earlier versions** lists them with **Restore** on each.
- **Transparency page.** `TransparencyToggle`, for condo and HOA.

- [ ] **Step 1: Write the failing tests:**
  - Records:
    - `a covered condo sees the alert with its missing items and the auto-linked count`
    - `an item with two possible matches lists both and links the one chosen` (Review Focus 3)
    - `below the threshold shows the recommended note and no alert`
    - `an apartment shows no records section`
    - `no alert while snoozed`
  - Other sections:
    - `coming up shows "Notice not marked posted yet" and links to Meetings`
    - `details show "Not added yet, so it's hidden on the site" for empty fields`
    - `the email offer shows only while offerable`
    - `?published=1 shows the updated banner`
  - Restore:
    - `restore reverts to the second-newest snapshot, then publishes`
    - `restore shows on Essentials; the version list only with hasSitePolishBlocks`
  - Access: `a resident is redirected`
  - Accessibility: `the axe run has no violations`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/components/website-home/website-home.test.tsx apps/web/__tests__/hooks/use-restore-previous-site.test.tsx apps/web/__tests__/lib/services/website-home-service.test.ts apps/web/__tests__/accessibility/website-home-axe.test.tsx apps/web/__tests__/pm/website-home-page-auth.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Then `pnpm build && pnpm perf:check` (the new route and the aggregate).
- [ ] **Step 5: Commit.** `git commit -m "feat(website): website home with missing-records alert and restore"`

---

## Phase 5: The editor

### Task 27: "Site settings" takes in the tools

**Blast radius:** RESIDENT-APP · **passes:** false

**Files:**
- Modify: `apps/web/src/components/pm/site-editor-v3/settings/SettingsView.tsx`. The tabs become `general`, `pages`, `design`, `notice`, `address`, `search`, `access`:
  - `pages` renders `PagesPanel`;
  - `design` renders colours, fonts, Professional custom colours and logos, with a **Change look** link to `/pm/website/looks`. It lists no looks;
  - `notice` renders `UrgentNoticePanel`;
  - General keeps the footer and site icon.
- Modify: `EditorTopBar.tsx` (the view switch reads "Site settings")
- Modify: `apps/web/src/app/(site-editor)/pm/website-editor/page.tsx` and `EditorRoot.tsx`: `?view=settings&tab=<id>` opens Site settings on that tab.
- Modify: `apps/web/src/components/website-home/your-site-card.tsx` (adds a **Site settings** link)
- Test: extend `apps/web/__tests__/components/pm/site-editor-v3/SettingsView.test.tsx`; update `DesignPanel.test.tsx`, `PagesPanel.test.tsx`

Every tab shows "Saves immediately" or "Saved as a draft until you publish", matching today's behaviour per tab.

- [ ] **Step 1: Write the failing tests:**
  - `Site settings shows Pages, Design and Notice tabs`
  - `the Design tab links to the look picker and lists no looks`
  - `each tab says whether it saves immediately`
  - `?view=settings&tab=pages opens Site settings on Pages`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/components/pm/site-editor-v3/SettingsView.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(site-editor): Site settings holds pages, design and notice"`

### Task 28: Remove the tool rail; add parts from the page

**Blast radius:** RESIDENT-APP · **passes:** false

**Files:**
- Modify (editor shell):
  - `EditorShell.tsx`: remove `ToolRail`, the tool-panel aside and `PanelResizer`;
  - `EditorRoot.tsx`: drop `activeTool`, `renderToolPanel` and `toolBadges`, and host an Add dialog.
- Modify: `canvas/SectionShell.tsx` or the canvas list. An "Add a part" button between sections opens `AddPanel` in a `Dialog`, targeting that slot.
- Modify: `help/HelpDrawer.tsx` and `help/guides.ts`. Actions that pointed at a tool now open a Site settings tab or the Add dialog.
- Modify: `RecordsAttention.tsx` becomes a top-bar link to `/pm/website` showing the missing count.
- Delete: `ToolRail.tsx`, `PanelResizer.tsx` and `tools.ts` (move `HELP_DRAWER_ID` into `help/`), and their tests
- Test: update `EditorShell.test.tsx` and `HelpDrawer.test.tsx`; extend `apps/web/__tests__/components/pm/site-editor-v3/Canvas.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - `the editor has no tool rail`
  - `"Add a part" between sections opens the add dialog and inserts at that slot`
  - `help "Show me" for pages opens Site settings on the Pages tab`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/components/pm/site-editor-v3`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. Then `pnpm test apps/web/__tests__/accessibility/site-editor-axe.test.tsx`, then `pnpm build && pnpm perf:check`.
- [ ] **Step 5: Commit.** `git commit -m "feat(site-editor): edit on the page; tools live in Site settings"`

### Task 29: Plain-language panels

**Blast radius:** RESIDENT-APP · **passes:** false

**Files:**
- Modify: `apps/web/src/components/pm/site-editor-v3/Inspector.tsx` (the title is the section's plain name)
- Modify: `inspector/forms/HeroForm.tsx`:
  - linked-field chips from `parseLinkedText`;
  - **Name**, **City** and **Homes** buttons that insert tokens;
  - **Use the look's wording**, which restores the defaults from `getLook(lookIdForLayout(layoutId))`.
- Modify: `inspector/forms/SorEmptyTextForm.tsx`, replaced per type by a source panel:
  - announcements: "Updates by itself from Announcements", with **Write an announcement**;
  - meetings: the same, linking to Meetings;
  - documents: the owners' records summary, a website-home link, and `includeCategories` checkboxes, so a new Documents section is never empty.
- Modify: `inspector/forms/ContactForm.tsx`: it lists the profile fields that aren't added yet ("Office hours aren't added yet, so they're hidden") and links to the Community profile. `QuickLinksForm.tsx` and `BoardForm.tsx` add their source links.
- Test: extend `apps/web/__tests__/components/pm/site-editor-v3/inspector-forms.test.tsx`

- [ ] **Step 1: Write the failing tests:**
  - `the Name chip inserts {{name}}`
  - `"Use the look's wording" restores the bayfront defaults`
  - `the Documents panel writes includeCategories`
  - `the Announcements panel links to Announcements for this community`
  - `the Contact panel names the hidden fields and links to the Community profile`
- [ ] **Step 2: Run** `pnpm test apps/web/__tests__/components/pm/site-editor-v3/inspector-forms.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "feat(site-editor): plain-language section panels with linked fields"`

---

## Spec coverage

| Spec section | Tasks |
|---|---|
| §3 decision 1, Settings: Community profile | 4, 5, 6 |
| §3 decisions 2 and 3, C1 | 11, 12, 14, 21 |
| §3 decision 4, C2 alert, C3 | 16, 17, 18, 19, 20, 23, 26 |
| §3 decision 5, one click; owners emailed only on request | 21, 22 |
| §3 decision 7, live on day one (demos included) | 12, 13 |
| §3 decision 8, two new section types | 7, 8, 9, 15 |
| §5 C0 (card, retired guides, `customize_portal`) | 21, 24, 25 |
| §5 C2 (status, owner email, alert, coming up, details, restore and history, transparency) | 22, 23, 26 |
| §5 C4 and Site settings | 27, 28, 29 |
| §6 Content (hidden when missing, no empty boxes, owners' summary, every site on deploy) | 3, 6, 12, 29 |
| §6 Records (linking only, proposals, audit, thresholds) | 16–20, 26 |
| §6 Privacy (no form; no personal email) | 6; nothing built |
| §6 Looks (fonts, contrast, every plan, scenic photos) | 8, 9, 10, 11, 12 |
| §6 Engineering (budget, API rules, migrations, a11y) | every task's done-criteria; axe tests in 6, 21, 26, 28 |
| §7 Publish without the email | 22 |
| §10 Acceptance checks | 13; 12 and 21; 6; 17; 21 and 22; 26; 9 |
