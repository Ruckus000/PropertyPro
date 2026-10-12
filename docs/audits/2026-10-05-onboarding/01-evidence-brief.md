# Onboarding and migration audit

Date: October 5, 2026 · Repository revision: `df4e87c4f`

## Recommendation

Run the first few customers through a founder-assisted migration using the existing Directory, imports, document queue, invitations, and support tools. Improve the reliability of those paths before adding a migration platform or another onboarding wizard.

The customer outcome is: **our information is accurate, our people can get in, and we know which work has moved to PropertyPro.** Signup, payment, checklist completion, and publishing a public page are separate milestones; none establishes that outcome alone.

The founder confirmed there have been no onboardings yet and intends to conduct the first few personally. Recommendations below are product hypotheses informed by code, not observed customer behavior or measured conversion losses. All paths are in scope: self-service, assisted onboarding, PM portfolios, and invited residents.

## Method and limits

Read the project architecture and safety instructions, Ponytail README and full skill, current signup/provisioning, both wizard implementations and their callers, checklist creation/completion, resident/unit import UI and APIs, validators, invitation creation/batching/acceptance, account binding and join requests, documents queue, relevant schemas, PM creation, demo conversion, admin pipeline, help content, and first-run tests. Older audit/design documents were treated as historical intent and checked against executable code.

[Ponytail's implementation guidance](https://github.com/DietrichGebert/ponytail/blob/main/skills/ponytail/SKILL.md) informs the sequence: understand the full path, question the need, reuse existing code, then implement the smallest adequate change. Validation, access control, recovery, and accessibility remain requirements. Nothing from that repository was installed or copied into the application.

The existing `.designops/project.json` records a different, already-started Website-tab workflow. This audit has its own evidence and requirements files so that work is preserved. DesignOps project detection confirmed Next.js/Tailwind; its heuristic scan read 2,193 files and reported 118 signals. Those are not 118 verified defects: for example, it flags the welcome screen's motion even though the component contains `motion-reduce` classes, and flags example text in tests. No aesthetic redesign follows from this scan.

`pnpm agent:live:web` failed because Docker is installed but stopped; it also reported missing `node_modules`. Consequently, no authenticated browser rehearsal, Vitest suite, throughput benchmark, email-delivery check, or deployed signup verification was completed. No production credentials or `.env.local` were read. Findings labeled confirmed below are source-confirmed; runtime consequences still need the stated checks. This is not release certification or a statutory interpretation audit.

## Current system worth keeping

| Journey | What exists today | Implication |
|---|---|---|
| Self-service | Grouped signup form, address autocomplete, generated subdomain, verification recovery, 30-day card-required trial, provisioning checkpoints/recovery, auto-login to dashboard | Keep recovery and authorization. Observe this flow before replacing it with a longer wizard. |
| Community setup | Two-step condo/HOA and apartment wizards; in-dashboard role checklists with bootstrap recovery | More setup screens are not the missing capability. The normal dashboard path and direct wizard path differ. |
| Roster migration | Separate unit and resident CSV imports; manual Directory editing; household records without logins; extra ownership via units | Reuse these models and controls. CSV support is narrower than the domain model. |
| Documents | Multi-file queue, two simultaneous uploads, categories, same-name decisions, draft/post distinction, per-file failure retry, redaction attestation | Bulk upload already exists. Preserve draft preparation and deliberate publishing. |
| Resident rollout | Directory selection and batch invites; per-person results; resend; password creation/auto-login; role-specific welcome; access/join requests | Build the operating process around these. Do not create another invitation system. |
| Portfolio | Add Community modal, portfolio pricing/billing, per-community provisioning and root authority | Pilot one community before repeating. Portfolio scale involves repeated setup and authority, not just row count. |
| Assisted operation | Admin leads/demo/trial/active board, support tickets, scoped support access, root reassignment, access plans | Use existing tools and a small migration worksheet for the first cohort. |

Evidence: `components/signup/signup-form.tsx`, `components/signup/provisioning-progress.tsx`, `lib/services/provisioning-service.ts`, `hooks/use-onboarding-checklist.ts`, `components/directory/directory-page-client.tsx`, `hooks/use-document-upload-queue.ts`, `components/pm/add-community-modal.tsx`, and `apps/admin/src/lib/server/onboarding.ts`. Web paths in this report are relative to `apps/web/src` unless fully qualified; the evidence index below links the principal files.

## Findings and smallest useful interventions

### F1 — Resident preview does not predict the import

**Confirmed; high priority; implementation/interaction.** In `api/v1/import-residents/route.ts`, `dryRun` returns immediately after `validateResidentCsv`. It does not check whether units exist, whether the community permits the requested owner/tenant type, whether the person already has membership, or whether attaching an existing account is authorized. All happen later during commit. The unit importer already performs live duplicate checks during preview.

The preview also drops source row numbers. `PreviewStep` reconstructs them as `i + 2` after invalid rows have been filtered. If source row 2 is invalid and row 3 is valid, the valid row is shown as row 2; the error-row merge can then suppress the separate invalid display row. This makes correction of a real spreadsheet harder.

**Do first:** use the same read-only eligibility evaluation for preview and commit, retain source row numbers, report counts by distinct row, and recheck at commit for races. Preserve tenant guards. Provide a downloadable rejected-row file including reason and original row. Reuse the existing unit-import pattern and CSV export helpers, without introducing a generic import framework.

**Acceptance:** mixed valid/invalid rows retain exact source numbers; nonexistent unit, apartment owner, existing member, and inaccessible existing account are identified before commit; commit still handles a change after preview.

### F2 — A request failure can leave a partially imported roster

**Confirmed control-flow risk; high priority before larger imports; implementation.** Resident import makes separate awaited user, membership, preferences, and audit writes. There is no enclosing transaction or per-row transaction covering these writes. Only selected business refusals become row errors. An unexpected failure can abort the request after earlier writes; audits occur after the entire resident loop. Unit import similarly writes each unit before its audit and only catches `ConflictError`.

The resident UI keeps file/result state in React memory, provides a spinner during commit and “Start Over” after failure. Neither importer exposes a durable import run identifier or recovery report. A retry can skip an existing membership rather than repair a missing preferences/audit step. This is not evidence that a timeout has occurred in production; it establishes why a timeout/failure would be costly.

**Do first:** make each roster row's related DB writes atomic and return durable success/failure evidence or a recoverable per-row outcome. The scoped client does not currently expose transactions, so this is a real implementation dependency: add the smallest tenant-preserving transaction helper, or a purpose-built DB operation following the documented unsafe authorization/allowlist/review contract. Do not call a nonexistent scoped transaction API or bypass isolation in the route. Bound resident rows and bytes, matching an explicitly tested operating limit. Reuse the current UI for progress and rejected rows. Until implemented, the founder uses small measured batches, records each result, and reconciles before retrying.

The unit validator's 2,000-row cap is a parser limit, not proof a 2,000-row deployment request completes. Resident CSV currently has no corresponding row cap. Only add background jobs and persisted batch orchestration when the first intended large migration exceeds a measured safe request budget or requires reliable resume after tab closure. Do not advertise unlimited scale meanwhile.

### F3 — Real rosters need an exception workflow

**Confirmed; high priority for intake; content/domain.** Resident CSV accepts `name,email,role,unit_number`, requires unique email per file, and writes one membership unit. It cannot import phone numbers, no-email households, board designations, managers, or multiple unit ownership links. These are not all absent product features: `unit_occupants` supports people without logins, and `units.ownerUserId` plus `listActorUnitIds` supports additional owned units. The importer does not fill those relationships.

Units are unique by case-insensitive number across the community, not by building plus number. Building A/101 and Building B/101 therefore need an agreed unique identifier such as A-101/B-101, used consistently in both CSVs. This limitation can matter in a 20-unit property as much as a 2,000-unit one.

**Do first:** document canonical templates and an explicit exception register; separate portal users, additional ownership, household-only records and privileged roles. Use existing screens for exceptions initially. Never invent emails or silently drop repeated-owner rows. Add only recurring missing columns/relationships after inspecting customer files. If co-ownership or a no-email owner of record cannot be represented faithfully, record it as a product-fit blocker rather than relabeling that person as a household member.

### F4 — Large invitation batches can hit the intentional budget

**Confirmed conditional behavior; medium priority; interaction.** Batch invitations exist and cap each request at 100 recipients. `sendInChunks` immediately proceeds to the next chunk; `consumeEmailBudget` permits 100 recipients per minute per manager across communities and document sends. If the next chunk arrives in the same budget window, it can fail with 429. The helper reports failures but does not schedule later delivery. Serial sends also leave request-duration exposure to measure.

**Do first:** run pilot invitations, then controlled waves respecting the actual retry interval. Expose “waiting for send limit” and retry only unsent recipients if this friction occurs. Keep the budget. Add a durable delivery queue only when unattended rollouts or observed request durations justify it. An email accepted for sending is not verified delivery or activation.

### F5 — Existing-account handoffs need an explicit path

**Confirmed; high priority for PM/multi-community cases; interaction/security.** Import intentionally refuses attaching an existing person the manager cannot already read. This is a privacy boundary, not a nuisance to disable. Invitation acceptance always calls `createAuthUserBoundTo`, which calls Supabase `createUser`; it has no existing-account sign-in branch. A valid invitation to an already activated account can therefore fail creation. A partially completed acceptance can also encounter “already registered” on retry.

Authenticated join requests and transactional approval already exist. However, the inspected `approveJoinRequest` membership insert does not assign `unitId`; a complete resident handoff must resolve the requested unit and verify access rather than assume approval alone finishes it. Public access-request approval is a different flow and also calls auth creation; do not assume the similarly named flows are interchangeable.

**Do first:** guide known existing users through sign-in and the existing authenticated join/approval path. Provide that route from relevant refusals, preserving the target community. For new invitees, add recovery that distinguishes account already created from invitation still pending. Never reset another existing account's password from an invite. Verify new user, existing same-PM user, unrelated-community user, expired link, consumed link, and interrupted acceptance before claiming frictionless handoff.

### F6 — Checklists measure actions, not migration readiness

**Confirmed; high priority for the founder's operating process; strategy.** One unit completes `add_units`; document list reads complete `access_document`, including a response with no document opened; any document creation attempts both upload checklist keys. Only `residents/invite` calls the invitation completion hook, while other add/import/invitation routes exist. Completion is per actor, so setup performed by another manager does not necessarily complete the customer's checklist. Role selection is designation-first: a resident board president can receive admin tasks without manager permissions.

The admin pipeline collapses checklist keys across people. Its active stage selects active subscriptions created within 30 days. It is useful funnel context, but neither the bar nor the stage reconciles roster counts, verifies delivery, or establishes launch readiness. Free-access-plan communities are not explicitly included by those trial/active queries. Directory portal status is another proxy: its activity query uses global `auth.users.last_sign_in_at`, so a person who signed in elsewhere can already appear active in a newly attached community. Invitation timestamps represent invitation issuance, not confirmed delivery.

**Do first:** keep personal exploration checklists, but use a separate founder worksheet for community readiness: agreed roster reconciled, exceptions assigned, real content reviewed, authorized customer admin verified, pilot users completed a useful task, and cutover agreed. If subsequently surfaced in admin, derive available facts from existing tables rather than duplicating them into another pipeline status column. Repair completion hooks at shared write points and select tasks using actual permissions/features.

### F7 — Setup paths have drifted; another wizard would compound it

**Confirmed; medium priority; implementation/content.** Normal provisioning completion navigates to the dashboard. The current dashboard has no wizard redirect; a source search found wizard page/API/hook references, not a normal signup-to-wizard navigation. The two-step wizards remain directly addressable. Their pages call `loadWizardState`, which returns null when missing; their profile component then initializes blank name/address fields. API GET can seed a profile via `buildProfileFromCommunity`, but the current wizard hooks only call PATCH and POST. Thus the prefill helper exists without being used by that first direct-page visit.

Self-service provisioning defaults timezone to Eastern. The PM modal also initializes Eastern without a timezone control in its form. The direct wizard offers Eastern/Central, but cannot be assumed to run in either primary journey.

**Do first:** establish the dashboard as the primary setup surface, link existing tasks in dependency order, and provide a reachable profile/timezone confirmation using saved community data. If keeping direct wizard routes, reuse the profile seed helper there. Do not reintroduce mandatory duplicate address entry. Observe the grouped signup form first; adding Next/Back screens alone does not remove required work.

### F8 — Document migration needs reconciliation and source context

**Confirmed boundary; medium priority; content/interaction.** The existing queue handles multiple files, duplicate-name choices, drafts, and row retry well. Queue state is browser memory, and upload metadata contains title/category/description but no dedicated original creation/event date field. Ordinary upload dates should not be treated as a faithful history of records from another system. Compliance linking and historical applicability require review beyond “files uploaded.”

The welcome page computes its own compliance percentage using only non-null document links and applicability. The main calculator also considers draft/deleted documents, lateness, and rolling windows. Those surfaces can disagree. The founding dashboard also prominently invites publishing public transparency; publishing is not a prerequisite for private migration work.

**Do first:** upload by reviewed category as drafts, retain a source-file/date manifest, reconcile expected versus uploaded files, explicitly review permissions and applicability, and publish deliberately. Reuse the canonical compliance calculation for the welcome snapshot. Choose historical metadata improvements from real records; do not promise historical compliance reconstruction from today's uploads.

### F9 — Demo conversion is not a clean-data migration

**Confirmed scope; high priority if this path is used; strategy/data.** `handleDemoConversion` changes the existing community, bans demo auth users on first conversion, and establishes the founding user. It does not perform a general purge of seeded units/documents/other rows. Announcement provenance filtering exists but is not a comprehensive cleanup mechanism.

**Do first:** prefer a fresh real community for initial customer migrations. Keep demos as demonstrations. If preserving a customized demo is important, inventory seeded versus customer-owned data and rehearse a supported conversion before loading real data. Do not use generic demo-reset scripts on a customer's converted community, and never delete append-only audit records.

### F10 — Small completion defects undermine confidence

**Confirmed; medium priority; interaction/content.** `OnboardingChecklist` renders the all-complete celebration before checking `dismissed`, clears stored dismissal in that branch, and therefore does not honor its close action while complete. Its celebration always links to compliance, including apartment members for whom that feature is unavailable. The profile footer says progress saves automatically although field edits persist only on submission.

**Do first:** honor dismissal, scope it to person/community, choose a permitted next task, and describe actual save behavior. Use accessible status text and field-error associations during import; inspect keyboard focus on file pickers and after transitions. Keep the existing semantic tokens and shared controls. The gradients and rounded surfaces found by the scan are lower priority than these behavior defects.

### F11 — First-run verification is incomplete

**Confirmed; pre-customer rehearsal requirement; implementation.** `e2e/onboarding-first-run.spec.ts` contains two `test.fixme` cases describing obsolete 4-/5-step flows. The CI inventory explicitly says neither is runnable. Signup tests are separately conditional on Stripe secrets. Unit/integration test files exist for provisioning, imports, invitations, and onboarding, but were not executed in this audit.

**Do first:** replace obsolete expectations with one complete fresh-community journey and targeted failure/relationship cases. Use `agent:live:web` and its isolated stack. Verify actual customer entry routes, a roster import, a document prepared/published, invitation acceptance, and a useful resident action. Add apartment and portfolio cases at their distinct branching points. Do not infer end-to-end health from a green form test.

## Sequence and investment boundaries

1. **Before customer one:** adopt the accompanying runbook; rehearse a fresh real-community path; fix preview truth/source rows and clear completion/recovery defects; verify the actual customer's role/ownership cases. Confirm a tested import batch size. If their roster needs unsupported relationships or finance/lease history, resolve that scope before promising migration.
2. **During the first three to five onboardings:** log customer effort separately from founder effort and system waits. Reuse current tools; capture rejected rows and every manual correction. Review each session within a day. Sample differing complexity when prospects permit, without delaying a ready customer just to fill a research quota.
3. **After repeated evidence:** add the smallest frequent improvement—header aliases or mapping, extra import fields, a rejected-row export, staged send pacing, or a derived readiness panel. Favor common source formats over vendor-specific connectors.
4. **Before the first genuinely large/complex migration:** validate the proposed row counts and file volume in the sandbox and deployment-equivalent request limits. If measured batches cannot finish with margin or resume requirements exceed in-memory state, add durable jobs then. Phase a portfolio community by community.

Do not build now: an AI mapping engine, a generic migration orchestration framework, a new CRM, another mandatory feature tour, speculative third-party connectors, or automated drip campaigns. “Regardless of size” should mean a supported phased process with truthful limits, not an untested unlimited upload promise.

## Evidence index

- [Resident import API](../../../apps/web/src/app/api/v1/import-residents/route.ts) · [validator](../../../apps/web/src/lib/utils/csv-validator.ts) · [preview/results UI](../../../apps/web/src/components/residents/import-residents-client.tsx)
- [Unit import API](../../../apps/web/src/app/api/v1/import-units/route.ts) · [units schema](../../../packages/db/src/schema/units.ts) · [household model](../../../packages/db/src/schema/unit-occupants.ts)
- [Batch invites](../../../apps/web/src/app/api/v1/invitations/batch/route.ts) · [chunk sender](../../../apps/web/src/lib/api/send-in-chunks.ts) · [email budget](../../../apps/web/src/lib/api/email-budget.ts)
- [Invitation acceptance](../../../apps/web/src/app/api/v1/invitations/route.ts) · [auth binding](../../../apps/web/src/lib/services/auth-user-binding.ts) · [existing-user guard](../../../apps/web/src/lib/services/user-linking.ts) · [join approval](../../../apps/web/src/lib/join-requests/approve-request.ts)
- [Checklist service](../../../apps/web/src/lib/services/onboarding-checklist-service.ts) · [checklist UI](../../../apps/web/src/components/onboarding/onboarding-checklist.tsx) · [operator pipeline](../../../apps/admin/src/lib/server/onboarding.ts)
- [Dashboard](../../../apps/web/src/app/(authenticated)/dashboard/page.tsx) · [wizard state loader](../../../apps/web/src/lib/queries/wizard-state.ts) · [profile step](../../../apps/web/src/components/onboarding/steps/profile-step.tsx)
- [Upload queue](../../../apps/web/src/hooks/use-document-upload-queue.ts) · [welcome calculation](../../../apps/web/src/app/(authenticated)/welcome/page.tsx) · [canonical calculator](../../../apps/web/src/lib/utils/compliance-calculator.ts)
- [Demo conversion](../../../apps/web/src/lib/services/demo-conversion.ts) · [first-run coverage gap](../../../apps/web/e2e/onboarding-first-run.spec.ts)
