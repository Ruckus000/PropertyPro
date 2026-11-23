# Emergency alert scheduling — design

Approved by the owner on 2026-11-23 ("Yes, build it"), including the Missed rule.

## Why

Alerts can only be sent immediately today (create, confirm, send, 10-second undo).
Managers know some things in advance: "water off tomorrow, 9 to noon". They want
to write the alert now, have it go out at a chosen time, and be able to cancel it
before it goes. They also want "warn now, remind the evening before".

## What a manager can do

1. **Send later.** The last step of the alert composer offers "Send now" (as
   today) or "Send later" with a date and time in the community's time zone.
2. **See it.** A scheduled alert is in the manager's list and on its own page as
   "Scheduled", with the time it will go. Residents see nothing until it sends.
3. **Cancel it.** Any time before sending starts, from the list row or the alert
   page. A cancelled scheduled alert is shown as "Canceled".
4. **Send again later.** A sent or scheduled alert has "Send again later", which
   opens the composer pre-filled with the same title, bodies, severity, audience
   and channels. This is the whole of "repeats": no recurrence rules.

No editing. To change a scheduled alert: cancel it and make a new one.

## Rules

- **When it sends.** A background job runs every 5 minutes and sends every
  scheduled alert whose time has arrived. So an alert goes out between 0 and 5
  minutes after its chosen time. The composer says so.
- **Earliest and latest.** The chosen time must be at least 5 minutes ahead and
  at most 365 days ahead (server-enforced; the composer shows the same message).
- **Missed.** If the job finds an alert more than 60 minutes past its time, it
  does not send it. It marks it missed. A notice that arrives after the event is
  worse than none. Missed alerts show as "Missed" with the reason.
- **Recipients are worked out at send time**, not when the alert was scheduled,
  from the same audience rule as an immediate alert. The count shown while
  scheduled is labelled as of now ("48 recipients as of now").
- **Channels at send time.** SMS goes only if SMS dispatch is enabled when the
  alert sends (both the global and the community flag), exactly as for an
  immediate alert. Today that means email only.
- **One send, never two.** The job claims an alert before sending it, in one
  atomic statement. A claimed alert cannot be cancelled and cannot be claimed
  again. If sending throws after the claim, the alert is marked failed with the
  error class and is NOT retried: a partial send must not be repeated. It shows
  as "Did not send"; the manager uses "Send again later" or sends a new one.
- **Deleted or lapsed communities.** A soft-deleted community's scheduled alerts
  are not sent (marked missed with reason `community_deleted`). A lapsed
  subscription does not block sending: alerts are the life-safety bypass, as
  `createBroadcast` already documents.
- **Who.** `emergency_broadcasts:write`, the same permission as sending now.
  Demo-grace communities are refused, as for sending now.
- **Audit.** Scheduling, cancelling, sending by the job, missing and failing each
  write a `compliance_audit_log` entry. The job's entries have no user (system
  actor) and name the scheduler in metadata.

## Data

One migration on `emergency_broadcasts`, all nullable, no backfill:

| Column | Meaning |
|---|---|
| `scheduled_for timestamptz` | Set means "send later at this time". Null for immediate alerts. |
| `send_claimed_at timestamptz` | Set by the job's atomic claim. Null until then. |
| `send_outcome text` | Null, or `missed`, or `failed` (CHECK constraint). |
| `send_outcome_reason text` | Short machine reason: `late`, `community_deleted`, `interrupted` (claimed, then no outcome for 15 minutes: the job died mid-send), or an error class name. Never a message body or address. |

A partial index on `scheduled_for` where `scheduled_for is not null and
send_claimed_at is null and canceled_at is null and send_outcome is null` serves
the job's cross-tenant scan.

Status shown, in order: Canceled (`canceled_at`), Sent (`completed_at`), Missed,
Did not send, Scheduled (`scheduled_for` set), otherwise Draft/Pending as today.

## Not in this design

- Editing a scheduled alert.
- Recurrence rules.
- Emailing the scheduler when an alert is missed or fails. Trigger to add it: a
  manager reports learning about a missed alert too late.
- Scheduling announcements.
