# Positioning & Messaging Kit

**Date:** 2026-08-05
**Consumes:** `01-RECONCILIATION.md`
**Consumed by:** the marketing site, cold outreach, `docs/04` board playbook, `docs/07` turnarounds

---

## 1. ICP — who we sell to in the next 90 days

**Primary:** Self-managed condominium associations, **25–149 units**, in
Palm Beach / Broward / Miami-Dade, with **no property management company** or a
very small one, that are **still not compliant** with §718.111(12)(g) or are
"compliant" via a static page with no owner portal.

**Buyer:** Volunteer board president. Typically retired, 60–80, not technical,
personally absorbing the operational load, and — critically — **personally
exposed**. They are the one an owner sends a records request to.

**Disqualifiers** (say no fast, you have no time to waste):
- Under 25 units — no statutory push, and they will not pay.
- Already on AppFolio/Vantaca/CINC — that's a PM-driven enterprise stack; you
  will not displace it in one call.
- No board consensus and no upcoming meeting — nothing to attach a decision to.

**Ideal trigger events** (these are what make August prospecting work — see
`01-RECONCILIATION.md` §3):
- An owner has made a records request in the last 90 days
- Annual meeting or budget season within 60 days
- Recent board turnover — a new president inheriting a mess
- Milestone inspection / SIRS deadline or an insurance renewal in progress

---

## 2. The one-liner

> **PropertyPro is the Florida statute, turned into software.**
> Everything §718 requires you to post, notice, and track — done on time,
> automatically, with a record proving it.

Longer form, for a first call:

> "The state requires you to have an owner portal with specific documents posted
> within specific deadlines. Most boards solve that with a website that sits
> there. We built the deadlines *into* the software — it knows what §718 requires,
> tells you what's missing, and keeps the audit trail that protects you
> personally when an owner asks for records."

**What we deliberately do not say:** anything about a mobile app (does not
exist), anything promising legal advice (we don't give it), and anything leading
with the Jan 1 deadline (seven months stale — see §5.1).

---

## 3. Differentiation — the defensible claim

The February plan bet on a native mobile app. That is off the table. The real,
shipped, verifiable differentiator is **statutory depth**:

| Claim | Why it's defensible | Proof in product |
|---|---|---|
| **We encode Florida law, not generic "community management."** | Every national competitor — AppFolio, Buildium, Vantaca, CINC, Condo Control, TownSq — has **zero** Florida-specific compliance automation (per `docs/competitive-analysis-2026-03.md`). They cannot add it cheaply; it's a per-state product commitment. | Compliance engine scores against the 30-day posting rule, 14-day/48-hour notice windows, required document categories |
| **We tell you your compliance score, and what's missing.** | Template competitors sell you a container. Nobody grades you. | Compliance dashboard |
| **We keep the audit trail that defends the board personally.** | The statute's enforcement is owner-initiated with $50/day damages. A timestamped record is the defense. | `compliance_audit_log`, audit-trail UI |
| **Statutory governance is built in, not bolted on.** | E-voting per §718.128 (per-unit auth, secret ballot, quorum), ARC denials carrying HB 1203 written reasons. | Elections, polls, ARC surfaces |

### 3.1 Against the competitor that actually matters

You will lose deals to **CondoSites ($55–70/mo)**, to a **$0 static page**, and to
**inertia** — not to Vantaca. Position against those three:

**vs. CondoSites** — Do not compete on price; you will lose. Compete on scope.
> "CondoSites will give you a compliant website for $55, and it's a real
> product — they've been doing it twenty years. Here's the honest difference:
> when you're done, you have a website. You're still running the association out
> of your inbox. We're $199 because we replace the website *and* the inbox — the
> notices, the documents, the maintenance requests, the votes, the record that
> proves you did it on time."

**vs. a $0 static page** — Compete on exposure, and be specific rather than scary.
> "A page with PDFs on it satisfies the letter of it until an owner asks for
> something you can't produce a date for. The statute's teeth are owner-initiated
> — $50 a day. The question isn't whether the page exists, it's whether you can
> prove what was posted and when."

**vs. inertia** — Compete on effort, and this is where you actually win.
The board's real objection is never price; it's "this will be a project and I
don't have time." Neutralize it with the audit (§5.2), which does the work *for*
them before they've paid anything.

---

## 4. Pricing narrative

**Live and shipped:** Essentials **$199/mo**, Professional **$349/mo**,
Property Manager **"Let's talk"** (volume tiers: 10% at 3 communities, 15% at 6,
20% at 11).

### 4.1 How to frame $199 against a $55 incumbent

Never quote a monthly figure naked. Always convert to per-unit and to
alternatives the board already understands:

- **Per unit:** at 84 units, $199/mo is **$2.37 per unit per month.** That is the
  number to say out loud. It is smaller than any line item on their budget.
- **Against labor:** the board's own estimate of admin hours (capture it during
  discovery — `docs/08` YES #3) is almost always 10–20 hrs/month. $199 against
  15 hours is ~$13/hour for work a volunteer is doing free and resents.
- **Against a single bad outcome:** $50/day statutory damages reaches $199 in
  four days.

### 4.2 On the $1,500 setup fee

`docs/04` assumes $199/mo **+ $1,500 setup**. The live product has no setup fee
and no way to charge one. **Recommendation: do not reintroduce it in the first
90 days.** A setup fee is a second negotiation, requires board approval of a
capital-ish expense (harder than a recurring line item), and is the single
easiest thing for a hesitant president to stall on. Your constraint right now is
*reference customers and learning velocity*, not Year-1 revenue per deal. Trade
the $1,500 for the shorter cycle.

Revisit once you have 10 customers and a waiting list.

### 4.3 Discounting

Do not discount price. If you must concede, concede on **term** (month-to-month
instead of annual) or **scope** (Essentials instead of Professional). A founding
cohort discount is acceptable *only* if explicitly traded for a testimonial and
a reference call, in writing, at signature.

---

## 5. Messaging by moment

### 5.1 Cold open — the August version

The February scripts open on the Jan 1 deadline. **Retire that opening.** It
now signals you're working from a stale list, and the board's honest reaction is
"that was seven months ago and nothing happened."

Replace with the trigger-specific open:

> "Mr. Alvarez — I'll be quick. I work with self-managed condo boards in Palm
> Beach on the §718 records and portal requirements. I noticed [Association] has
> an annual meeting coming up in October. Most boards I talk to are heading into
> budget season still running documents out of a personal email account. Is that
> roughly where you're at, or have you got that sorted?"

Why it works: it names a *specific, current, verifiable* fact about them; it
describes the operational pain (`docs/07`'s correct instinct) rather than
leading with fear; and it ends on an easy either/or that is not a yes/no on a
meeting.

Keep `docs/07`'s Ledge → Disrupt → Ask structure for the objections that follow.
That framework is sound and channel-agnostic.

### 5.2 The audit — the core mechanic, and it should stay

`docs/04`'s **14-day compliance audit** (product live, on their real data, before
any money changes hands) is the strongest idea in the entire existing corpus.
Keep it exactly. It converts the biggest objection ("this will be a project")
into the proof of the opposite, and it manufactures the collected yeses that
`docs/08` depends on.

One August adjustment: the audit's headline output should be the **compliance
score movement** (e.g. 35% → 88%) — that is a number the president can carry
into a board meeting and defend without you in the room.

### 5.3 Objection quick-reference

| Objection | Core move |
|---|---|
| "We already have a website." | Isolate: *"Can an owner log in and pull the last three years of budgets themselves?"* Almost always no. That's the gap. |
| "CondoSites is cheaper." | §3.1. Scope, not price. Never disparage them. |
| "I have to take it to the board." | Correct and expected — don't fight it. Make the president the champion, arm them with the audit output. `docs/06` Scenario 1. |
| "We can't afford it." | Per-unit reframe (§4.1). Then isolate whether it's budget timing vs. value. |
| "We're too small to worry about this." | Verify unit count. If 25+, they're in scope; if under 25, disqualify honestly and move on. |
| "Send me some information." | `docs/07` — this is a reflex response, not a no. |

---

## 6. Proof assets we do not yet have

Stated so they're tracked, not assumed. All of these are currently **missing**:

- **Zero customer testimonials or logos.** The marketing site has a
  `testimonial-section.tsx` and a `logo-proof-section.tsx`. Whatever is in them
  is not from paying Florida customers. This must be honest — fabricated or
  placeholder social proof on a live site aimed at a compliance-sensitive buyer
  is an unacceptable risk. Verify before launch (see `03-LAUNCH-READINESS.md` B4).
- **No case study.** First one comes from the first audit, ~week 6.
- **No reference customer for calls.** Trade for it at signature (§4.3).
- **No content / SEO surface at all** — the marketing site has exactly four
  routes (home, transparency, two legal). No blog, no resources. This is the
  five-month-old deferred-SEO debt from `docs/09` and it compounds daily.
