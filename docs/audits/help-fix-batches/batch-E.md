# Help-Fix Batch E — categories: esign, forum, elections

Articles directory scope: `apps/web/src/content/help/esign/`, `apps/web/src/content/help/forum/`, `apps/web/src/content/help/elections/`

Item counts: 6 Critical / 26 High / 10 Medium / 3 Low — 45 total.

Work article-by-article: apply every item that targets the same .mdx file in one editing pass, then tick its boxes here.


## Critical

- [x] **[Critical]** `esign/sending-an-esign-submission.mdx:53` — "One-off documents can bypass templates — upload the file directly and place fields on the fly" is impossible; templateId is required. → **Fix:** delete; every submission starts from a template. *Evidence:* `api/v1/esign/submissions/contract.ts:33` (templateId required); `new-submission-form.tsx:127-134`.
- [x] **[Critical]** `esign/sending-an-esign-submission.mdx:117` — No e-sign "Bulk send feature" exists. → **Fix:** delete the sentence or say "send one submission per owner manually (bulk e-sign is not yet available)." *Evidence:* grep "bulk" across esign components/API/service — zero hits.
- [x] **[Critical]** `elections/running-a-board-election.mdx:65-66` — "Open Elections and click **New election**" cannot be done — no election-creation UI or POST endpoint exists (elections route is GET-only). → **Fix:** rewrite Phase 1 around the real flow (elections appear once set up; admin actions are Snapshot Eligibility, Open, Close, Certify, Cancel). *Evidence:* `api/v1/elections/route.ts` (GET only); `board-elections-panel.tsx` (no create button).
- [x] **[Critical]** `elections/running-a-board-election.mdx:50-51` — "PropertyPro prompts for both notices automatically" is false — no notice generation/drafting/sending exists in elections code. → **Fix:** state first/second notices must be prepared outside PropertyPro (e.g. via Announcements/Documents) and notice deadlines aren't tracked. *Evidence:* grep "notice" in `elections-service.ts` + elections schema — zero hits.
- [x] **[Critical]** `elections/running-a-board-election.mdx:69-70` — Statutory timing wrong: candidate intent is due 40 days BEFORE the election (≈20 days after the 60-day first notice), not "40 days from the first-notice date"; no first-notice draft is generated. → **Fix:** "Candidates must submit written intent at least 40 days before the election — about 20 days after the first notice goes out"; remove the auto-draft claim. *Evidence:* §718.112(2)(d)4.a; `elections-service.ts` has no notice/candidacy functions. Attorney review recommended.
- [x] **[Critical]** `elections/running-a-board-election.mdx:81-82` — Same timing error inverted ("At the 40-day mark (20 days before election)") plus a nonexistent auto-close of candidate intake. → **Fix:** "Candidacy closes 40 days before the election per statute; maintain the slate manually." *Evidence:* `packages/db/src/schema/elections.ts:100-120` (no intake workflow).

## High

- [x] **[High]** `esign/creating-an-esign-template.mdx:61` — Button is "Create Template", not "New template". → **Fix:** correct. *Evidence:* `templates-list-client.tsx:96-101`.
- [x] **[High]** `esign/creating-an-esign-template.mdx:65` — Field types are Signature, Initials, Date, Text, Checkbox — no "Name"/"Custom text". → **Fix:** list the real five. *Evidence:* `field-palette.tsx:42-46`.
- [x] **[High]** `esign/creating-an-esign-template.mdx:72-73` — Signing order (parallel/sequential) is chosen when sending, not in the template builder. → **Fix:** move the step to the submission article. *Evidence:* `new-submission-form.tsx:339-372`.
- [x] **[High]** `esign/sending-an-esign-submission.mdx:48-49` — Navigation wrong: E-Sign page has a "Documents" tab and "Send Document" CTA; no "Submissions → New submission" path. → **Fix:** "From E-Sign, click **Send Document**." *Evidence:* `esign-page-shell.tsx:32-62`.
- [x] **[High]** `esign/sending-an-esign-submission.mdx:56-57` — No person search — signers are free-text role/name/email fields. → **Fix:** "type each signer's full name and email." *Evidence:* `new-submission-form.tsx:276-318`.
- [x] **[High]** `esign/sending-an-esign-submission.mdx:64-65` — Deadline is a hard required expiration (7–90 days, default 30) that kills the link; no approaching-deadline reminder emails. → **Fix:** state the real expiry behavior ("Request expired"). *Evidence:* `new-submission-form.tsx:76,391-411`; sign `page.tsx:367-376`.
- [x] **[High]** `esign/sending-an-esign-submission.mdx:75-80` — Status labels are Pending / Opened / Completed / Declined — "Not yet opened"/"Signed" don't exist. → **Fix:** rename bullets. *Evidence:* `esign-status-config.ts:27-35`.
- [x] **[High]** `esign/sending-an-esign-submission.mdx:82` — In sequential mode all signers are emailed at creation; sequencing blocks the signing page ("Waiting for another signer"), not the email. → **Fix:** correct. *Evidence:* `esign-service.ts:656-699`; sign `page.tsx:380-390`.
- [x] **[High]** `esign/sending-an-esign-submission.mdx:92` — Reminders capped at 3 per signer total; no automatic reminders. → **Fix:** "up to 3 manual reminders per signer; no automatic reminders." *Evidence:* `esign-constants.ts:139`; `esign-service.ts:994-996`.
- [x] **[High]** `esign/sending-an-esign-submission.mdx:111` — No completion email is sent (EsignCompletedEmail exists but is never used). → **Fix:** signers download from their signing page; admins from the submission record. *Evidence:* `esign-service.ts:11` (imports invitation + reminder only).
- [x] **[High]** `esign/sending-an-esign-submission.mdx:112` — Completed submissions are NOT archived to the Documents library. → **Fix:** "the signed PDF is stored on the submission record (Download Signed Document)." *Evidence:* `esign-service.ts` (no documents insert); `submission-detail.tsx:439`.
- [x] **[High]** `esign/signing-documents-electronically.mdx:48-49` — No view-whole-document gate; Finish is disabled until required fields + consent are done — scrolling is never tracked (also fix line 94). → **Fix:** describe the real gating. *Evidence:* sign `page.tsx:587-604`.
- [x] **[High]** `esign/signing-documents-electronically.mdx:60-62` — No "Sign here" button — tap the highlighted field; capture modal has Draw, Type, AND Upload tabs; consent checkbox is in the bottom bar. → **Fix:** correct. *Evidence:* sign `page.tsx:499-534,564-574`; `signature-capture.tsx:32-33`.
- [x] **[High]** `esign/signing-documents-electronically.mdx:64-65` — Button is "Finish" (not "Submit signature") and no countersigned PDF is emailed (also line 77). → **Fix:** "Click **Finish**; you'll see an on-screen confirmation." *Evidence:* sign `page.tsx:602`; EsignCompletedEmail unused.
- [x] **[High]** `esign/signing-documents-electronically.mdx:75-79` — Signed PDF is not emailed and does not appear under the resident's Documents. → **Fix:** "the association keeps the signed copy; ask the sender for the final PDF." *Evidence:* `esign-service.ts` (no email/documents insert).
- [x] **[High]** `forum/using-the-board-forum.mdx:51-56` — Access list wrong — owners and tenants HAVE forum access (read + post); only admins moderate; no attorney-invite mechanism. → **Fix:** rewrite "Who can see the forum"; delete the attorney bullet. *Evidence:* `board/forum/page.tsx:16-17`; `rbac-matrix.ts:354-363`; `polls/common.ts:34-38`.
- [x] **[High]** `forum/using-the-board-forum.mdx:67` — Thread categories (General/Maintenance/Vendors/Legal) don't exist — New Thread takes Title + Body only. → **Fix:** drop the category instruction. *Evidence:* `create-thread-dialog.tsx:32-90`.
- [x] **[High]** `forum/using-the-board-forum.mdx:71` — Attachments not supported in the opening post. → **Fix:** remove "Attach files if relevant." *Evidence:* `create-thread-dialog.tsx`.
- [x] **[High]** `forum/using-the-board-forum.mdx:81` — Replies are plain text — no formatting, attachments, or @mentions. → **Fix:** "Replies are plain text (8,000-character limit)." *Evidence:* `forum-thread-detail.tsx:229-236`.
- [x] **[High]** `forum/using-the-board-forum.mdx:119-121` — No forum search exists. → **Fix:** "scan pinned threads; forum search isn't available yet." *Evidence:* `board-forum-panel.tsx`; `api/v1/search/*` sub-routes exclude forum.
- [x] **[High]** `elections/running-a-board-election.mdx:73-74` — Candidates cannot upload bios; ordering is admin-set sortOrder, not submission order. → **Fix:** "add each candidate's name and a short description; control display order yourself." *Evidence:* `elections.ts:113-118`.
- [x] **[High]** `elections/running-a-board-election.mdx:103` — Paper-ballot logging doesn't exist (also line 114). → **Fix:** paper ballots are handled entirely offline; counts are not entered into PropertyPro. *Evidence:* grep "paper" across elections — zero hits.
- [x] **[High]** `elections/running-a-board-election.mdx:121-122` — Certification is one admin clicking Certify (single certifiedByUserId); no two-committee-member signing. → **Fix:** "an authorized admin certifies in PropertyPro; collect committee signatures separately (attach a results document)." *Evidence:* `elections-service.ts:1136-1183`.
- [x] **[High]** `elections/running-a-board-election.mdx:125-126` — Results do NOT post to meeting minutes; compliance dashboard doesn't reflect election filings. → **Fix:** "record results in minutes manually; optionally link a results document." *Evidence:* grep "election" in `compliance-calculator.ts` — zero.
- [x] **[High]** `elections/using-board-polls.mdx:57` — Button is "Create Poll"; polls allow 2–20 options, not "New poll"/2–5. → **Fix:** correct both. *Evidence:* `board-polls-panel.tsx:49`; `create-poll-dialog.tsx:46,70`.
- [x] **[High]** `elections/using-board-polls.mdx:81-82` — Neither "Export the raw results (CSV)" nor "Archive the poll" exists. → **Fix:** drop both bullets. *Evidence:* `api/v1/polls/*` (GET/vote/results/my-vote only).

## Medium

- [x] **[Medium]** `esign/creating-an-esign-template.mdx:85` — No "Today's date type" — the Date field auto-fills today's date on click. → **Fix:** correct. *Evidence:* sign `page.tsx:154-162`.
- [x] **[Medium]** `esign/creating-an-esign-template.mdx:86` — Templates hold exactly one PDF — no supporting-doc attachments. → **Fix:** "merge appendices into the base PDF before uploading." *Evidence:* `template-builder-client.tsx:120-124,422-461`.
- [x] **[Medium]** `esign/creating-an-esign-template.mdx:88-92` — "Updating a template" has no UI path — "Edit Fields" links to the blank new-template builder. → **Fix:** "templates can't be edited after creation — clone, adjust, archive the original." *Evidence:* `template-detail-client.tsx:219-225`.
- [x] **[Medium]** `esign/sending-an-esign-submission.mdx:100` — Signers are NOT notified on cancel. → **Fix:** "outstanding links stop working; signers see 'Request cancelled'." *Evidence:* `esign-service.ts:933-968` (no sendEmail).
- [x] **[Medium]** `esign/sending-an-esign-submission.mdx:110` — Final PDF embeds signatures/values only; timestamps/IPs/consent live in the audit log, not the PDF. → **Fix:** correct. *Evidence:* `esign-pdf-service.ts:1-40`.
- [x] **[Medium]** `esign/signing-documents-electronically.mdx:29-31` — contextPaths point at /esign (admin-only; residents redirected); signer surface is /sign/*. → **Fix:** contextPaths: ["/sign/*", "/dashboard"]. *Evidence:* `esign/page.tsx:50-52`.
- [x] **[Medium]** `forum/using-the-board-forum.mdx:6-13` — roles frontmatter excludes owner/tenant though they can use the forum — hides the article from its audience. → **Fix:** add owner + tenant (after fixing the access section). *Evidence:* `help-article-service.ts:217-228`.
- [x] **[Medium]** `forum/using-the-board-forum.mdx:75` — No notifications fire when a thread is published. → **Fix:** remove the sentence. *Evidence:* grep "notif" in `api/v1/forum` — zero.
- [x] **[Medium]** `elections/running-a-board-election.mdx:109-110` — Voting auto-blocks after closesAt, but an admin must still click "Close Election"; "locks at the meeting's start" only if closesAt was set so. → **Fix:** describe both steps. *Evidence:* `elections-service.ts` assertElectionOpenForVoting; `election-admin-actions.tsx`.
- [x] **[Medium]** `elections/using-board-polls.mdx:65` — Publishing a poll does not fan out notifications. → **Fix:** "the poll appears on Board → Polls; post an announcement to drive responses." *Evidence:* grep notif/email in polls service/routes — zero.

## Low

- [x] **[Low]** `esign/sending-an-esign-submission.mdx:99` — Button is "Cancel Request", not "Cancel". → **Fix:** correct. *Evidence:* `submission-detail.tsx:402-406`.
- [x] **[Low]** `esign/signing-documents-electronically.mdx:83` — Decline is always available on active signing pages, not "some requests". → **Fix:** correct. *Evidence:* sign `page.tsx:578-586`.
- [x] **[Low]** `elections/using-board-polls.mdx:61-65` — Field is an optional "End date"; raw `ends_at` column name leaks into user docs. → **Fix:** "optional End date — voting closes automatically; without one the poll stays open." *Evidence:* `create-poll-dialog.tsx:150-151`; `polls-service.ts:309-312`.

## Report
- Articles edited: creating-an-esign-template.mdx, sending-an-esign-submission.mdx, signing-documents-electronically.mdx, using-the-board-forum.mdx, running-a-board-election.mdx, using-board-polls.mdx
- Items fixed: 45 / Skipped: 0
- guard:help-content: PASS
