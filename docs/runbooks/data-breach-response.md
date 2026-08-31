# Data breach response — Fla. Stat. §501.171

**This is an operational runbook, not legal advice.** It exists so that the
first thirty minutes of a real incident are spent responding rather than
reading the statute. The statutory deadlines below are short enough that
figuring out the process during the incident is how they get missed.

Source: `docs/audits/2026-08-09-legal-risk-audit.md` (F-17).

> **Get a lawyer involved on day one if you possibly can.** Everything here is
> designed to work with zero legal budget, which is the current constraint — not
> because counsel is optional. Breach notification is one of the few areas where
> a wrong call is expensive and irreversible.

---

## 0. The clock

Two deadlines, and they run from **determination**, not from discovery of the
underlying bug:

| Obligation | Deadline | Trigger |
|---|---|---|
| Notify affected individuals | **30 days** | A breach of *personal information* affecting Florida residents |
| Notify the Florida Department of Legal Affairs (AG) | **30 days** | The same breach affecting **500 or more** Florida residents |
| Notify consumer reporting agencies | Without unreasonable delay | 1,000+ individuals in a single event |

"Determination" is when you conclude a breach occurred. **You cannot stop the
clock by declining to investigate**, and a slow investigation is not an
extension. Log the moment of determination in writing — the timestamp is what a
later dispute turns on.

There is a **law-enforcement delay**: if a federal, state or local agency
determines that notice would interfere with an investigation, notice may be
delayed — but that determination has to come from them, in writing.

---

## 1. Who decides what

| Role | Person | Owns |
|---|---|---|
| Incident lead | The owner (sole operator today) | Declaring an incident, the determination timestamp, the go/no-go on notification |
| Technical investigation | Same | Scope, blast radius, containment |
| Drafting notices | Same, with counsel if reachable | Individual + AG notice text |
| Association liaison | Same | Telling affected associations, who have their own members to inform |

**This table is honest about being one person.** That is the current reality and
the runbook is built for it. The one thing that must not happen is the
determination being made implicitly, by nobody, while investigation drifts.

---

## 2. First hour — contain and preserve

1. **Do not delete anything.** Not logs, not the compromised credential, not the
   suspicious row. Revoke and rotate rather than remove; evidence matters more
   than tidiness, and Supabase point-in-time state is finite.
2. **Rotate what is exposed.** Supabase service-role key, `CRON_SECRET` and the
   per-feature secrets, Stripe keys, Resend key — whichever the incident touches.
   See `docs/audits/` for the current secret inventory.
3. **Capture the timeline** in a single file as you go: what you saw, when, what
   you did. Reconstructing this later is impossible and it is the backbone of
   both notices.
4. **Snapshot the audit trail.** `compliance_audit_log` is append-only and
   tenant-scoped; export the relevant window before anything else churns.

---

## 3. Determine scope — what counts as "personal information"

Under §501.171 this is, broadly, a Florida resident's first name or initial plus
last name, **in combination with** any of:

- Social security number
- Driver licence / ID card / passport / military ID number
- Financial account, credit or debit card number **with** any required security
  code or password
- Medical history, condition, treatment or diagnosis; health-insurance policy or
  subscriber number
- A **username or email address in combination with a password or
  security-question answer** that would permit account access

Also covered on its own: an email address plus password/security answer.

**Encryption safe harbour.** Data that is encrypted, secured or modified so as
to be unusable is generally outside the notification duty — but only if the
decryption key was not also taken.

### Where this data actually lives in PropertyPro

Check every one of these when scoping. This list is the point of the runbook:

| Data | Where |
|---|---|
| Names, emails, phone numbers | `users`, `notification_preferences` |
| Unit / ownership linkage | `user_roles`, `units`, `leases` |
| Payment identifiers | Stripe (we store **no** PANs; `stripe_*` tables hold ids) |
| Uploaded documents — the big one | Supabase Storage `documents` bucket. Scanned minutes, ledgers and delinquency reports routinely contain SSNs and driver-licence numbers despite §718.111(12)(c). Assume the worst case until proven otherwise. |
| **Full-association export archives** | Supabase Storage `community-exports`. Each object is a copy of an entire association including resident PII. A compromise here is categorically larger than one document. |
| Audit trail | `compliance_audit_log` — board-readable via `/api/v1/audit-trail` |

---

## 4. Notify

### Individuals (30 days)

Written notice must include, at minimum: the date/estimated date of the breach,
a description of the personal information involved, and contact information for
the entity. Send by mail or email to the address on file.

### The Attorney General (30 days, 500+ Floridians)

Filed with the Florida Department of Legal Affairs. The submission asks for a
synopsis of events, the number of Florida individuals affected, any services
being offered (e.g. credit monitoring), a copy of the individual notice, and a
contact for the incident.

### The affected associations

Not a statutory obligation to them specifically, but a contractual and practical
one: they are fiduciaries to their own members and will have their own
notification decisions to make. Tell them what you know, when you know it, in
writing.

### Third-party / vendor breaches

If the breach is at a processor rather than at PropertyPro (Supabase, Vercel,
Stripe, Resend), the duty may run through them — but **do not assume it does**.
Confirm in writing who is notifying whom.

---

## 5. After

- Write the post-mortem into `docs/audits/` with a date-stamped filename, the
  same as every other audit here.
- Add a regression test or guard for the specific failure. "We will be more
  careful" is not a control.
- Revisit tech E&O / cyber coverage. Breach-notification cost is one of the
  things it exists to cover, and the ToS liability cap does not protect against
  a statutory duty owed to third parties.

---

## Standing gaps

Recorded so they are not rediscovered mid-incident:

- **No 24/7 monitoring or alerting on anomalous data access.** Detection today
  is Sentry errors plus manual review, so "time to determination" could be long.
- **No retainer with counsel.** Deliberate — zero legal budget for 90 days
  (audit §2a). This is the single largest weakness in this runbook.
- **No cyber insurance.** Listed as owner-only item #3 in the remediation plan.
