# Phase 5 Support Guide

Internal reference for support and success teams covering the Phase 5 frontend changes.

## Maintenance -> Operations redirect

### What changed

- Operations is now the canonical home for:
  - resident maintenance requests
  - admin work orders
  - reservations
- The legacy resident maintenance route now redirects to:
  - `/communities/{communityId}/operations?tab=requests&from=maintenance`
- The new Operations page shows a temporary in-app notice when the user lands with `from=maintenance`.
- Legacy maintenance pages still exist in limited form:
  - `/maintenance`
  - `/maintenance/submit`
  - `/maintenance/inbox`

### What users see

- Users coming from the old maintenance entrypoint see:
  - an Operations page
  - the Requests tab selected
  - a notice explaining that maintenance moved into Operations
- Users who still open the old submit or inbox pages see a temporary banner telling them that Operations is the new home.

### Why the notice appears

- It is there to reduce confusion for bookmarked legacy links and older internal documentation.
- It is temporary and intended to smooth the move from maintenance-only flows to the unified Operations hub.

### When legacy pages will be removed

- There is no hard-coded removal date in the app today.
- Support should treat the legacy pages as temporary compatibility paths during Phase 5 rollout.
- Expect a follow-up cleanup release to remove them after redirect traffic and support issues have settled.

### Support response guidance

- If a user says "maintenance is gone," explain that maintenance work now lives under Operations.
- If a user shares an old bookmark, direct them to the Operations page for that community.
- If the user only needs requests, tell them to open the Requests tab inside Operations.

## Elections attorney-review gate

### How it works

- Elections require two conditions before tenant-facing users can access them:
  - the community type must support voting
  - `electionsAttorneyReviewed` must be `true`
- This setting is controlled by platform admins in the admin app.
- The admin UI describes it as a legal readiness gate, not a normal feature toggle.

### What users see when the gate is off

- The elections tab is hidden from the board navigation.
- Tenant-facing elections pages stay unavailable.
- Elections API routes also reject access, so this is enforced server-side as well as in the UI.

### How support should enable it

- Open the admin app community settings editor.
- Find **Elections Attorney Review**.
- Toggle it on for the specific community once legal review is complete.
- If the community should not have elections yet, leave it off.

### Common support questions

- "The community has voting enabled but no Elections tab."
  - Check whether `electionsAttorneyReviewed` is still off.
- "Why can only admins change this?"
  - Because the setting represents legal readiness, not resident preference.

## Vote receipt troubleshooting

### What the receipt shows

- `submissionFingerprint`
- `submittedAt`
- whether the ballot was recorded for the current user/unit context

### What the receipt does not show

- candidate selections
- ranked choices
- any full ballot contents

This is expected for secret-ballot handling.

### How to explain this to users

- The receipt confirms that a ballot submission was recorded.
- It does not reveal selections back to the voter in the receipt view.
- This is by design and protects ballot secrecy.

### How to verify a vote was recorded

- Ask the user for the receipt fingerprint and submission timestamp shown in the UI.
- Confirm that the election receipt view reports `hasVoted=true`.
- If needed, have an admin confirm that aggregate ballot counts changed as expected for the election.
- Do not promise candidate-level confirmation from the receipt flow.

### Common issues

- "I voted but do not see candidate names in the receipt."
  - Expected behavior for secret ballots.
- "I refreshed and only see a receipt ID."
  - Expected; the fingerprint is the proof of submission.
- "I think my vote did not count."
  - Check the recorded receipt state first before escalating.

## Proxy troubleshooting

### How proxy delegation works

- A resident designates a proxy holder for a specific election.
- The proxy starts in `pending`.
- An admin can approve or reject it.
- An approved proxy can later be revoked.

### Who can take each action

- Create:
  - the grantor resident for their own unit
- Approve or reject:
  - admin roles
- Revoke:
  - the grantor
  - admins

### Common issues

- "Proxy already used" or similar conflict
  - The election may already have a designation for that unit.
- "I cannot cast a proxy ballot"
  - Confirm the proxy is approved, not just pending.
- "The proxy option disappeared"
  - Check whether the election is no longer in a status that allows proxy activity.
- "I cannot revoke this proxy"
  - Confirm the actor is the original grantor or an admin.
- "The election is closed"
  - Proxy designation and proxy voting are blocked once the election status no longer allows them.

### Support escalation notes

- Ask for:
  - election name or ID
  - community
  - grantor name
  - proxy holder name
  - current visible status (`pending`, `approved`, `rejected`, `revoked`)
- If the issue involves vote secrecy or disputed ballot contents, escalate rather than improvising an answer.
