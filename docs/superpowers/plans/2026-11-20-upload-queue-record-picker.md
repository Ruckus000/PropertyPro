# Upload queue: "Which record is this?" per file (D13)

*2026-11-20. Status: awaiting approval. Branch `claude/brave-allen-fbe306`.*

When a condo or HOA manager uploads several files at once on Documents, each file can be
filed into one statutory record (a `compliance_checklist_items` row). Today the queue
(`components/documents/document-upload-queue.tsx`) has no idea records exist, and the
server's auto-link files a document only on one unambiguous match.

## What the manager sees

Each file row in the queue gains a third field beside Title and Category:

- **Record (optional)** — a Select listing the records still to fill. It opens on
  **Match automatically** unless the file name points at exactly one record, in which
  case that record is pre-chosen, with "Suggested from the file name" under it.
- A record another file in the batch has chosen is disabled, "(chosen for another file)".
- Choosing a record sets the row's Category to the one that record files under. The
  manager can still change the category.
- Not shown: on apartments, on a row that **replaces** an existing document's file (the
  document keeps its id, so it keeps its record), and when no record is left to fill.
- After Post: "3 documents posted. 2 filed as records." If the upload went through but the
  link failed, the row stays: "Posted, but we couldn't file it as *Annual budget*:
  <server message>. Post again to retry." Pressing Post again links it; it is **not**
  uploaded a second time.

## Decisions

| # | Question | Decision | Why |
|---|---|---|---|
| R1 | How a chosen record is written | Upload with `skipAutoLink: true`, then `PATCH /api/v1/compliance` `link_document` with `replace: true`. **No API, contract or migration change.** | Rung 2: the two-call pattern `add-records-drawer.tsx:233-252` and the Compliance page already use. `replace` because an offered record may hold a draft, deleted or out-of-date file (same as the drawer). |
| R2 | Which records are offered | Applicable items that are not up to date: no file, a draft, a deleted file, or a rolling-window record gone stale (`itemStatus !== 'up_to_date'` in `lib/site-editor/records-status.ts`). Conditional items included. One new export there, `recordsToFill(items)`, beside `missingRecordItems`. | `missingRecordItems` returns `[]` below the website size threshold, which would hide the picker from small associations that still keep these records. The new export reuses the same private `itemStatus`, so both lists agree on what "filled" means. |
| R3 | What "Match automatically" does | Exactly today's behaviour: the upload goes without `skipAutoLink`, and the server links it only on one unambiguous match. | No regression for a manager who ignores the picker. The server reads title + category + the rest of the library, which a file-name guess cannot. |
| R4 | The pre-fill | `proposeTemplateKeyForFile(fileName, openKeys)` at the moment files are added, skipping records another row already claimed — the drawer's rule, moved into a pure function in `lib/documents/upload-queue.ts` so it can be tested. | Rung 2. Insurance and other "any title" records are never guessed from a file name, by design of that function. |
| R5 | Link fails after the upload | The row keeps the new `documentId`; the next Post only links. The batch counts it as failed (panel stays open, error toast), but `onChanged` still fires so the library shows the new document. A retry needs no redaction tick (nothing more is published). | Data-loss/duplication handling: never cut. Same rule the drawer follows (`add-records-drawer.tsx:157, 236-251`). |
| R6 | Toasts and cache | Call `patchChecklistItem` directly (export it from `use-compliance-mutations.ts`; today it is file-private) and invalidate `[COMPLIANCE_QUERY_KEY, communityId]` once after the send. | `linkDocument.mutateAsync` toasts "Document linked." per file (ten files, ten toasts) and optimistically marks a **draft** link `satisfied`. One word of export avoids both. Side effect: the library's statutory view now refreshes after any upload, which auto-linked uploads never did. |
| R7 | Drafts | **Revised after review:** a draft is never filed. "Save as draft" uploads it without a link and says "Drafts aren’t filed as records." When the draft is posted later, the server's auto-link runs on it. | The server refuses to link a draft (`assertDocumentInCommunity`: "Post this document before linking it"), so every draft link would have failed. The rest of the system keeps drafts unlinked too: auto-link skips them, and taking a document back to draft clears its links. The first version of this plan got this wrong. |
| R8 | How the queue learns the records | New optional prop `records?: readonly ChecklistItemData[]` on `DocumentUploadQueue`. Absent or empty → no picker. | The queue has no community type, role or feature flags, and there is no client context that carries them. Fetching the checklist inside the queue would 403 on every apartment. **This needs one line in `document-library.tsx` — see "Needs your OK".** |

## Needs your OK: one line in a sibling's file

`document-library.tsx` is in the empty-states P2 file set. Without a caller passing
`records`, the picker ships dark and cannot be checked in the browser. The change is one
prop at the existing mount (around line 423):

```tsx
<DocumentUploadQueue … records={showStatutory ? checklistQuery.data : undefined} />
```

The P2 "Upload several" button (in the new `documents-setup.tsx`) then needs the same
prop. I would leave a note in the shared notes folder for that session. Whichever PR lands
second rebases over a one-line difference. Their plan's D13 `ponytail:` marker becomes
stale once this lands; the note says so.

Also a heads-up: their **P8** edits the queue's own empty state ("Create a category before
uploading"). That will conflict with this PR textually, but trivially.

## Reach list (every file this touches)

| File | Change |
|---|---|
| `apps/web/src/lib/documents/upload-queue.ts` | `QueueRow` gains `recordId`, `recordSuggested`, `documentId`. New pure `proposeRecords(rows, records, claimed)`. `rowNeedsAttestation` returns false for an already-uploaded row. `sendableRows` unchanged. |
| `apps/web/src/hooks/use-document-upload-queue.ts` | Takes `records`; proposes on `addFiles`; `sendOne` uploads only if `documentId == null`, passes `skipAutoLink` when a record is chosen, then links; outcome gains `linked`; invalidates the checklist once. |
| `apps/web/src/components/documents/document-upload-queue.tsx` | `records` prop; the Record Select per row; category follows the chosen record (`getTemplateDocumentCategory` + `resolveCategoryId`, as the drawer does); success toast names the filed count; failed-link row copy; an uploaded row's fields lock. |
| `apps/web/src/hooks/use-compliance-mutations.ts` | `export` on `patchChecklistItem`. |
| `apps/web/src/lib/site-editor/records-status.ts` | New `recordsToFill(items)`. |
| `apps/web/src/components/documents/document-library.tsx` | **One prop (needs your OK).** |
| `apps/web/src/content/help/manager/documents/upload-document.mdx` | Line 86 says "A file uploaded here does not satisfy a compliance requirement on its own". That becomes false; rewrite it inside the existing condo/HOA `<OnlyFor>` callout. |
| Tests | `__tests__/documents/upload-queue-rules.test.ts` (proposal, attestation on retry), `hooks/__tests__/use-document-upload-queue.test.ts` (skipAutoLink only with a record; link with `replace`; retry does not re-upload), `__tests__/documents/document-upload-queue.test.tsx` (picker hidden without records / on a replacing row; category follows record; one axe case). Its `use-document-categories` mock gains `resolveCategoryId`. `site-editor/records-status` test for `recordsToFill`. |

Checked and **not** touched: the documents POST route, contract and `autoLinkDocument`
(unchanged); `add-records-drawer.tsx` (prior art only); RBAC — only `manager` has
`documents:write`, and `manager` has `compliance:write` on condo/HOA, so everyone who can
see the queue can link (`rbac-matrix.ts:175-185`); existing test fixtures build rows with
`makeRows`, so the new fields default and nothing else breaks. E2E `onboarding-first-run`
and `esign-and-documents-flow` post `sample.pdf` through the queue; that name matches no
record, so they keep their path, but I will run both.

## Ladder, piece by piece

- The two-call link, the file-name guess, the category-for-record lookup, the concurrency
  pool, the retry-without-reupload rule: all already in the codebase (rung 2).
- The Select: the house `Select` the Category field beside it already uses (rung 2), not
  the drawer's native `<select>`, so one row has one kind of control.
- New code: one pure proposal function, one filter export, a branch in `sendOne`, one
  field of JSX. No new dependency, endpoint, table, hook or component file.

## Deliberately skipped (each named, two marked in code)

- **Replacing a record that is already up to date** from the queue. Compliance does that.
  `ponytail: an up-to-date record is not offered; replace it from Compliance. Trigger: a manager asks to replace a current record from Upload.`
- **A "Not a record" choice** that stops auto-link. Today's behaviour stays for unchosen
  files. `ponytail: an unchosen file still auto-links on an unambiguous match. Trigger: a manager unlinks an auto-linked multi-upload file (compliance audit log: link then unlink).`
- Re-guessing the record when the title or category is edited after adding. The guess runs
  once, at add time, as in the drawer.
- Grouping the record list by section (`<optgroup>`); the drawer lists flat.
- "Doesn't apply" from inside the queue (the drawer has it; P2 brings it to Documents).
- Bulk auto-link of the existing library (O-2 in the audit).

## Verification

1. Unit: the tests above, run per file with `pnpm test <path>`.
2. **Revert-checks** (recorded in the commit): delete `skipAutoLink: row.recordId != null`
   in `sendOne` → the "a chosen record skips auto-link" test goes red, its siblings stay
   green; delete the `documentId == null` guard → the "retry does not upload again" test
   goes red. Axe case: drop the Select's accessible name → that case reddens, the others stay.
3. `pnpm typecheck`, `pnpm lint` (all guards), `pnpm guard:class-resolution`.
4. Sandbox (`pnpm agent:live:web`, after checking Docker VM memory pressure): fresh
   `agent-*` condo and HOA fixtures, three files (one name that guesses, one that doesn't,
   one a duplicate set to Replace), at 1440 px and 375 px; then an apartment fixture to
   confirm no picker; then confirm on Compliance that the chosen records are filled.
5. E2E: `onboarding-first-run` and `esign-and-documents-flow` locally.
6. An independent ponytail-review-style review of the diff (a fresh agent, given the code,
   not my conclusions), each finding with a concrete case, before the PR.
7. One PR to `main`; green on the seven required checks.

## Risks

- **A wrong guess gets filed** if the manager does not look. Mitigated: it is visible and
  labelled as a guess before Post, and only unambiguous name matches are guessed.
- **`replace: true` races**: a record filled by someone else after the panel opened is
  overwritten by the person's choice. Same accepted behaviour as the drawer.
- **Merge order with empty-states P2/P8**: textual conflicts, one line each.
- The picker is reachable only where a caller passes `records`; any future mount that
  forgets the prop silently gets today's behaviour, never an error.

Not checked yet: the 375 px layout of a three-field row (Title / Category / Record) — the
grid is `sm:grid-cols-2` today, so Record wraps to its own line on phones; I'll confirm it
in the sandbox.
