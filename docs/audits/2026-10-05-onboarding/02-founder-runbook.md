# Founder-led onboarding runbook

October 5, 2026 · Proposed operating process for the first three to five customers

This is a starting hypothesis to refine from actual sessions. Timing and batch sizes below are planning choices, not measured product performance. The associated [audit](./01-evidence-brief.md) records current code limitations.

## The promise

“Send us the records you already have. We will help prepare them, review what came across with you, and invite a small group before the full launch.”

Avoid asking a customer to understand your database, recreate an entire history, choose branding before seeing value, or become a CSV expert. You handle translation; they validate identity, accuracy, permissions, and operating decisions.

## One process, adapted to complexity

| Situation | Starting approach | Increase assistance when |
|---|---|---|
| Small, clean roster | One working session; manual entry or CSV, whichever is less work | Shared/missing email, multiple owners, incomplete source records |
| Many units or buildings | Reconciled files per community/building, measured import batches, representative pilot, staged invitations | Batches approach request limits or duplicate unit numbering creates ambiguity |
| PM portfolio | One shared intake format, one accountable lead, one pilot community, repeat per community | Roles, source formats, billing responsibility or cutover schedules differ |
| Spreadsheet/paper operation | Assisted cleanup; digitize the documents needed for the first useful workflow | The source itself lacks reliable identity/ownership information |
| Existing property platform | Export and map a representative sample first; define which workflows move and which stay | Lease/financial/history requirements exceed supported imports |

Unit count alone should not determine the onboarding path. Ten unusual records can require more assistance than a thousand clean ones.

## 1. Agree on the first useful outcome

At a short kickoff, record:

- Community type, actual unit count, buildings, timezone, and the customer who owns operational decisions.
- Who should be root manager, which staff need management access, which people have board designations, and who may approve go-live.
- Current source systems/files; who can export them; whether the old system will remain available during transition.
- One first useful task: for example, an owner opens a needed document; a resident submits a request and staff handle it; a manager reviews real records and identifies missing ones.
- What moves now, later, and stays elsewhere. Do not equate portal launch with replacement of every property-management function.
- Intended launch date, invitation audience, exceptions, and a fallback contact.

For a customer's first login, observe an attempt before guiding it. For routine data preparation, do the work for them. Record where you intervene so a smooth founder-assisted experience is not mistaken for a smooth self-service experience.

## 2. Collect an export once, then prepare it

Use a customer-approved restricted transfer channel. Keep raw source files and personal records out of the code repository and out of general support notes. Do not request passwords or raw payment credentials.

Prepare these practical records using an ordinary worksheet; no new onboarding software is required:

| Record | Minimum useful contents |
|---|---|
| Community | Source name/ID, type, confirmed unit count/address/timezone, responsible admin, target community ID |
| Units | Source ID, source label/building, agreed unique PropertyPro number; optional supported attributes |
| Portal users | Name, unique email, owner/tenant, matched unit; phone held separately until entered through supported controls |
| Exceptions | Source row/person, issue, proposed resolution, customer approver, status |
| Documents | Source filename, title/category, original date if known, intended audience, draft/post decision, uploaded ID/status |
| Cutover | Workflow, old system, new system, last old-system change, final delta owner, switch date, rollback/fallback |

Normalize headers to the current templates yourself. Agree on building-prefixed numbers where necessary. Separate additional ownership links, household-only records and management/board permissions from the basic resident CSV. Never resolve unsupported relationships by dropping them, creating fake email addresses, or changing their meaning.

Retain a protected source-to-target mapping so the customer can reconcile what moved. Record only counts and non-sensitive issue summaries in the onboarding progress worksheet.

## 3. Create the customer's real community

For initial customers, favor a fresh community through the supported signup or PM creation path. Let the customer establish credentials and payment details. Verify the intended customer holds root authority; creating everything under the founder's own PM login makes the creator root and introduces a later transfer dependency.

Use the existing consented support-access mechanism where appropriate. Platform-admin access and community management access are different boundaries; do not bypass tenant checks with ad hoc SQL to make an onboarding appear successful.

Confirm community type, plan, unit count and timezone before importing. Self-service/PM defaults do not establish that Eastern time is correct. If using a free access plan, record its actual terms in your worksheet rather than assuming the admin onboarding board includes it.

If converting a demo, stop and review demo-origin data first. A successful checkout is not evidence that sample records have been removed.

## 4. Import and reconcile before inviting

1. Rehearse representative data in the isolated agent sandbox first. Include a bad row, a repeated unit label across buildings, a returning user, multiple ownership, and a no-email household record when relevant.
2. Import units before residents. Preview; confirm intended counts and identifiers; save results.
3. Import resident accounts in a batch size demonstrated to complete safely. The existing resident preview needs the audit's repairs before it can be treated as a full eligibility check.
4. Add supported exception relationships through their existing screens. Resolve board/manager access through Roles & Access.
5. Compare agreed source counts, successful target counts, and unresolved exceptions. Check relationships, not just totals. Two wrong unit assignments can leave every count looking correct.
6. If a request fails, inspect what was committed before retrying. Reconcile the previous batch and retain the failure details.
7. Prepare documents in category groups as drafts, resolve duplicates deliberately, and verify content/access before posting. Capture source dates in the manifest; uploading today is not proof of historical posting.

No mass invitations during data cleanup. Resident CSV import currently does not send emails, which supports this separation.

## 5. Run a representative resident pilot

Start with roughly three to five willing people, adjusted to the actual community: customer admin, a typical resident/owner, a less confident user, and an existing-account or multi-unit case if present. This sample is for finding problems, not estimating an activation rate.

Observe email arrival, link opening on the person's usual device, account creation or existing-user sign-in, correct community/unit access, and completion of the selected useful task. Test an expired/resend path in the sandbox. A green import and a sent email do not prove these steps.

Have the manager independently perform their recurring task too: answer the request, publish/update the document, or manage membership. A resident portal is not operationally ready if staff still need you for every action.

## 6. Approve the transition and expand

Launch evidence:

- Customer confirms units/people/ownership and all material exceptions have an owner.
- Customer admin has the intended authority; resident visibility is verified.
- Required launch content and chosen workflow work for pilot users.
- Historical data, leases, balances, deposits, and payments have an explicit scope decision.
- Final source-system changes are reconciled; there is one agreed system of record per workflow after cutover.
- Customer agrees to the invitation and publishing plan and knows the support contact.

No bulk lease/history/opening-balance/payment-credential migration path was established in this audit. If those are required on day one, treat them as a separate migration acceptance problem before promising replacement. Retain the existing operational system for that work until the replacement has been validated. The customer should not unknowingly operate two independent payment or notice workflows.

Send invites in waves using Directory selection, respecting the current 100-recipient/minute manager budget and actual returned wait time. Keep failed and unsent people visible. Do not resend to everyone merely because a later chunk failed. At larger scale, use a paced/durable sender once justified by the audit's triggers.

Public transparency publication is its own approved action, not a mandatory resident activation step. Draft upload, private resident access, and public publication should stay distinct.

## 7. Learn after each onboarding

Use one row per session or milestone:

`Community | source format | units/people/files | complexity | start/end | customer minutes | founder minutes | system wait | rework | outcome | blocker | next owner/date`

Track:

- Time from receiving usable data to a reconciled pilot, and from invitation to the first useful task.
- Units/people/documents expected, imported, rejected, corrected, and deliberately deferred.
- Invitations attempted/sent/failed; confirmed first successful community task. Portal “active” is a proxy based on sign-in, not proof of task completion or retention.
- Questions asked, places the customer hesitates, founder interventions, and repeated corrections.
- At approximately day 2 and day 7: can the customer repeat the task without you, and what work still happens outside PropertyPro?

Keep direct observations separate from customer opinions and your hypotheses. Review after each onboarding; after three to five, rank recurring friction by customer effort, founder effort, consequence, and cheapest adequate remedy. Automate a repeated problem, not an imagined future operating model.

## Suggested first engineering slice

Make roster preview trustworthy, preserve row numbers, and provide a safe correction/retry result. Pair this with one fresh-community rehearsal through pilot resident success. Fix the existing checklist dismissal/feature-target defects alongside that flow. Keep a simple worksheet as the readiness authority until real customer sessions justify a productized version.
