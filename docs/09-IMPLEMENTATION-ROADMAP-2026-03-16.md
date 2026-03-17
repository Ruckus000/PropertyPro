# PropertyPro Florida — Implementation Roadmap & Checklist

**Date:** March 16, 2026
**Status:** Phase 3 Kickoff
**Approach:** Sequential sub-phases within each phase. Ship → validate → iterate.

---

## Pre-Flight: What Already Exists (Audit Results)

Before planning, here's what the codebase already has at the schema + API level. This dramatically changes the effort estimates.

| Feature | Schema | API Routes | Service Layer | UI/Frontend | Ship-Ready? |
|---|---|---|---|---|---|
| Payments (Stripe Connect) | Yes (stripe_connected_accounts, assessments, ledger_entries) | Yes (create-intent, history) | Yes (finance-service.ts) | Unknown | Needs UI + Stripe Connect onboarding flow |
| Voting/Polls | Yes (polls, poll_votes) | Likely partial | Unknown | Unknown | Needs UI + e-voting compliance (§718.128) |
| Violations | Yes (violations, violation_fines) | Yes (CRUD + fine/resolve/dismiss) | Yes (violations-service.ts) | Unknown | Needs UI + notice generation |
| ARC/ACC | Yes (arc_submissions) | Yes (review/decide/withdraw) | Unknown | Unknown | Needs UI + HB 1203 denial-reason requirements |
| E-Sign | Yes (esign_templates, submissions, signers, events, consent) | Unknown | Unknown | Unknown | Needs UI + PDF rendering + signing flow |
| Calendar Sync | Yes (calendar_sync_tokens) | Unknown | Unknown | Unknown | Needs iCal export + Google Calendar OAuth |
| Amenity Reservations | Yes (amenities, amenity_reservations) | Unknown | Unknown | Unknown | Needs UI |
| Emergency Notifications | No dedicated schema | No | No | No | Build from scratch (but lightweight — SMS broadcast) |

**Key insight:** Most Phase 1 features need **frontend UI, integration testing, and polish** — not greenfield backend work. Estimated effort per feature drops from 6-8 weeks to 2-4 weeks.

---

## Dissenting Notes (For the Record)

The plan below reflects the user's decisions. These objections are logged for future reference:

1. **SEO deferred to Phase 3.** Content marketing takes 3-6 months to compound. Every week of delay pushes organic traffic results further out. Competitors (TenantEvaluation, CONDUU, HOACloud) are actively publishing. Recommendation was to run SEO in parallel with Phase 1 at zero engineering cost.

2. **Customer validation skipped.** No discovery calls with target buyers before building. Risk: building features based on competitive analysis rather than confirmed buyer demand. The existing Phase 1 validation plan (doc 02) was never executed.

3. **Phase 4 is missing.** The phase numbering jumps from 3 to 5. This document assumes Phase 4 = native mobile app, which was identified as the primary differentiator but hasn't been addressed.

---

## Phase 1: Self-Managed Board Features (Sequential Sub-Phases)

**Target buyer:** Self-managed Florida condo boards, 25-149 units, no PM company.
**Goal:** Ship features that convert spreadsheet-using boards into paying customers.
**Total estimated timeline:** 12-16 weeks (sub-phases overlap slightly).

---

### Phase 1A: Payments & Dues Collection (Weeks 1-4)

**Why first:** #1 purchase driver. Boards on spreadsheets switch to software because they're tired of chasing paper checks, not because of compliance dashboards.

**Existing infrastructure:** stripe_connected_accounts, assessments, assessment_line_items, ledger_entries, finance-service.ts, payment API routes.

**What needs to be built/finished:**

#### Stripe Connect Onboarding
- [ ] **1A.1** Implement Stripe Connect Standard onboarding flow for associations
  - Each association gets its own Stripe Connected Account (NOT pooled — Florida trust fund law §718.111(14) requires segregated funds)
  - Board treasurer or CAM initiates onboarding from Settings → Payments
  - Store Stripe account ID in stripe_connected_accounts table
  - Handle OAuth redirect and account verification states
  - **Legal gate:** Confirm with attorney that Stripe Connect Standard (not Custom) satisfies Florida trust fund segregation requirements

#### Owner Payment Portal
- [ ] **1A.2** Build "Pay Assessment" page in owner portal
  - Display current balance, upcoming assessments, past payment history
  - Pull from assessments + assessment_line_items + ledger_entries
  - Stripe Checkout or Payment Element for card/ACH payment
  - ACH preferred (lower fees for recurring payments — 0.8% vs 2.9% for cards)
  - Payment confirmation email via Resend

#### Assessment Management (Admin)
- [ ] **1A.3** Build assessment creation UI for board/CAM
  - Create recurring assessment schedules (monthly, quarterly, annual)
  - Bulk-generate assessment_line_items for all units
  - Support one-time special assessments
  - Auto-calculate late fees per association rules

#### Payment Dashboard (Admin)
- [ ] **1A.4** Build payment tracking dashboard
  - Who's paid, who hasn't, who's late
  - Aging report (30/60/90 day delinquencies)
  - Export to CSV for accountant
  - Payment reminder emails (leverage existing payment-alert-scheduler.ts)

#### Webhook & Reconciliation
- [ ] **1A.5** Complete Stripe webhook handling
  - payment_intent.succeeded → update ledger_entries
  - payment_intent.payment_failed → flag delinquent, send reminder
  - Idempotency handling (finance_stripe_webhook_events table already exists)
  - Reconciliation report: Stripe payouts vs. ledger entries

#### Integration Testing
- [ ] **1A.6** End-to-end payment flow testing
  - Stripe test mode: full cycle from assessment creation → owner payment → ledger update → admin dashboard reflects payment
  - Edge cases: partial payments, failed payments, refunds, late fees
  - Multi-association: verify tenant isolation (Association A's payments never visible to Association B)

#### Pricing Decision
- [ ] **1A.7** Decide payment processing fee model
  - **Option A:** Association absorbs Stripe fees (simpler, but associations may resist)
  - **Option B:** Pass fees to owners (common in HOA payments — "convenience fee")
  - **Option C:** PropertyPro absorbs fees and builds into subscription price (expensive)
  - Research what PayHOA and Condo Control charge

#### Ship Gate
- [ ] **1A.8** Phase 1A ship criteria
  - [ ] Stripe Connect onboarding works for new association signup
  - [ ] Owner can pay assessment via card or ACH
  - [ ] Admin can create assessments and view payment status
  - [ ] Webhooks correctly update ledger
  - [ ] Payment reminders send on schedule
  - [ ] Zero trust fund commingling (verified via Stripe dashboard — each association's funds go to their own bank account)
  - [ ] **Drop $500 setup fee from pricing page** — replace with free 60-day trial

---

### Phase 1B: Emergency Notifications (Weeks 3-5)

**Why second:** Low engineering effort, high perceived value, literally saves lives during hurricane season (June-November). Florida boards need this.

**Existing infrastructure:** Announcement system, notification_preferences, Resend email integration. No SMS infrastructure.

**What needs to be built:**

#### SMS Provider Integration
- [ ] **1B.1** Integrate Twilio (or alternatives: Vonage, MessageBird) for SMS
  - Evaluate cost per message (Twilio: ~$0.0079/SMS)
  - Set up dedicated phone number for each association OR shared short code
  - Opt-in/opt-out compliance (TCPA — this is federal law, not optional)
  - Store phone numbers + SMS consent in notification_preferences

#### Emergency Broadcast UI
- [ ] **1B.2** Build emergency notification composer
  - Prominent "Emergency Alert" button in admin dashboard (red, can't miss)
  - Multi-channel: SMS + email + push (when mobile app exists) simultaneously
  - Pre-built templates: hurricane prep, water shutoff, gas leak, evacuation, elevator outage
  - Character count for SMS (160 char limit, or handle multi-part)
  - Confirmation step: "You are about to send an emergency alert to X residents. Confirm?"

#### Recipient Management
- [ ] **1B.3** Emergency contact list
  - Pull from existing users + allow non-registered emergency contacts (e.g., tenant's emergency contact)
  - Group targeting: all residents, owners only, specific building/floor
  - Delivery status tracking (sent, delivered, failed)
  - Bounce/undeliverable handling

#### Ship Gate
- [ ] **1B.4** Phase 1B ship criteria
  - [ ] SMS sends to all opted-in residents within 60 seconds of broadcast
  - [ ] Email sends simultaneously
  - [ ] TCPA opt-in/opt-out flow works
  - [ ] Delivery report visible to admin
  - [ ] Pre-built templates functional
  - [ ] Cost per message documented and reflected in pricing (pass-through or included)

---

### Phase 1C: Violations Management (Weeks 5-8)

**Why third:** Daily operational need for every board. Complete backend exists — this is primarily a UI build.

**Existing infrastructure:** violations table (full status workflow), violation_fines (linked to ledger), violations-service.ts, API routes for CRUD + fine/resolve/dismiss.

**What needs to be built:**

#### Violation Tracking UI (Admin)
- [ ] **1C.1** Build violations inbox/dashboard
  - List view with filters: status, severity, unit, date range
  - Status workflow buttons: Report → Notice → Hearing → Fine/Resolve/Dismiss
  - Each status transition requires notes (audit trail)
  - Severity indicators: minor (yellow), moderate (orange), major (red)

#### Violation Reporting (Owner/Resident)
- [ ] **1C.2** Build violation report form
  - Category selection (noise, parking, unauthorized modification, pet, trash, common area misuse, etc.)
  - Description field + photo upload (reuse maintenance request image infrastructure)
  - Anonymous reporting option (contentious — decide policy)
  - Location: unit number or common area description

#### Notice Generation
- [ ] **1C.3** Automated violation notice generation
  - Generate PDF notice from violation record
  - Include: violation description, statute/rule reference, cure period, hearing date (if applicable), fine schedule
  - Send via email + make available in owner portal
  - Track notice delivery for due process compliance

#### Fine Management
- [ ] **1C.4** Connect violation fines to payment system
  - violation_fines → ledger_entries integration (schema exists)
  - Display outstanding fines in owner payment portal alongside assessments
  - Fine payment follows same Stripe flow as assessment payments
  - Late fee escalation rules per association bylaws

#### Hearing Scheduler
- [ ] **1C.5** Violation hearing workflow
  - Schedule hearing date
  - Send hearing notice to owner (14-day notice requirement per most bylaws)
  - Record hearing outcome (fine imposed, warning issued, dismissed)
  - Generate hearing minutes/decision letter

#### Ship Gate
- [ ] **1C.6** Phase 1C ship criteria
  - [ ] Admin can create, track, and resolve violations through full lifecycle
  - [ ] Residents can report violations with photos
  - [ ] PDF notice generation works
  - [ ] Fines appear in owner payment portal
  - [ ] Hearing workflow functional
  - [ ] All transitions logged in compliance_audit_log

---

### Phase 1D: E-Voting (Weeks 7-10)

**Why fourth:** Annual elections happen Q1-Q2. Missing this window means waiting a year. Existing polls schema needs to be extended for statutory e-voting compliance.

**Existing infrastructure:** polls + poll_votes tables. Current implementation supports basic single/multiple choice polls.

**What needs to be extended for §718.128 compliance:**

#### Statutory E-Voting Requirements
- [ ] **1D.1** Audit §718.128 and §720.317 requirements and implement gaps
  - Voter authentication: each vote must be traceable to a verified unit owner (current poll_votes has user constraint — good)
  - One vote per unit (not per user — if unit has multiple owners, only one vote)
  - Secret ballot option for board elections (vote recorded but not attributable)
  - Proxy voting support (owner designates another person to vote on their behalf)
  - Quorum tracking (minimum participation threshold before vote is valid)
  - Vote period with defined open/close dates (polls.ends_at exists — good)

#### Election Management UI (Admin)
- [ ] **1D.2** Build election/vote creation wizard
  - Election types: board election, budget approval, rule amendment, special assessment approval
  - Candidate/option management for board elections
  - Set eligibility (owners only, good standing only)
  - Set quorum requirement (percentage or count)
  - Preview ballot before publishing

#### Voting UI (Owner)
- [ ] **1D.3** Build voting interface
  - Clear ballot presentation with all options
  - Confirmation screen before submission ("You are voting for X. This cannot be changed.")
  - Receipt/confirmation after vote (email + in-portal)
  - "I abstain" option
  - Mobile-responsive (critical — many will vote on phones)

#### Results & Certification
- [ ] **1D.4** Build results tabulation and reporting
  - Real-time vote count (admin only during voting period)
  - Automatic quorum check
  - Results page (published after voting closes)
  - Certified results PDF with vote counts, quorum verification, and timestamp
  - Archive in documents system under appropriate category

#### Proxy Management
- [ ] **1D.5** Proxy voting workflow
  - Owner submits proxy designation (name of proxy holder, scope of proxy)
  - Admin verifies and approves proxy
  - Proxy holder can vote on behalf of designating owner
  - Proxy recorded in vote audit trail

#### Ship Gate
- [ ] **1D.6** Phase 1D ship criteria
  - [ ] Board election can be created, conducted, and certified entirely in-platform
  - [ ] One vote per unit enforced
  - [ ] Quorum tracking and automatic validation
  - [ ] Secret ballot functional for elections
  - [ ] Proxy voting workflow complete
  - [ ] Certified results PDF generates correctly
  - [ ] All votes logged with immutable audit trail
  - [ ] Attorney review of §718.128 compliance (BLOCKING — get sign-off before shipping)

---

### Phase 1E: ARC/ACC Workflows (Weeks 9-12)

**Why fifth:** HB 1203 requires documented denial reasons. Backend exists, needs UI and statutory compliance layer.

**Existing infrastructure:** arc_submissions table (full status workflow), API routes for review/decide/withdraw.

**What needs to be built:**

#### Submission Portal (Owner)
- [ ] **1E.1** Build ARC submission form
  - Project type: exterior modification, landscaping, window/door replacement, screen enclosure, paint color, satellite dish, etc.
  - Description + photo uploads (before photos, design plans, contractor quotes)
  - Estimated start/completion dates
  - Contractor information (if applicable)
  - Acknowledgment of association rules/restrictions
  - Status tracker visible to submitter

#### Review Dashboard (Admin/ARC Committee)
- [ ] **1E.2** Build ARC review interface
  - Submission queue with status filters
  - Reviewer assignment (which board/committee member reviews)
  - Internal notes (not visible to submitter)
  - Side-by-side view: submission details + relevant rules/restrictions
  - Approval/denial with required fields per HB 1203

#### HB 1203 Denial Compliance
- [ ] **1E.3** Implement statutory denial requirements
  - **REQUIRED:** Specific written reasons for any denial (HB 1203 mandate)
  - Denial must reference specific rule/covenant violated
  - Auto-generate denial letter with statutory language
  - Track appeal window (if association bylaws allow appeals)
  - Denial letter delivered via email + owner portal + optional physical mail

#### Decision Audit Trail
- [ ] **1E.4** Full decision documentation
  - Every status change logged with who, when, and why
  - Approval conditions (if conditional approval — "approved with the following modifications")
  - Photo evidence at each stage (submission, during work, completion)
  - Final inspection sign-off (if required by association rules)

#### Ship Gate
- [ ] **1E.5** Phase 1E ship criteria
  - [ ] Owner can submit ARC request with attachments
  - [ ] Committee can review, approve, or deny with documented reasons
  - [ ] Denial letters auto-generated with HB 1203 compliance
  - [ ] Full audit trail of all decisions
  - [ ] Status notifications to submitter at each stage

---

### Phase 1 Completion Milestone

**Target:** 12-16 weeks from start
**Success criteria:**
- [ ] All 5 sub-phases shipped and functional
- [ ] At least 3 paying customers using payments feature
- [ ] At least 1 board election conducted through platform
- [ ] Zero critical bugs in production for 2 consecutive weeks
- [ ] Customer feedback collected from all active users

---

## Phase 2: PM Company Features + Apartment Tools (Weeks 13-24)

**Target buyer:** Property management companies managing 5-50+ Florida communities.
**Goal:** Feature parity sufficient to pitch PM companies, plus apartment-specific tools.
**Dependency:** Phase 1 complete. Real customer feedback incorporated.

---

### Phase 2A: Calendar View + iCal/Google Calendar Sync (Weeks 13-15)

**Existing infrastructure:** calendar_sync_tokens table, meetings table with full date/time data.

- [ ] **2A.1** Build visual calendar component
  - Monthly/weekly/daily views
  - Color-coded by event type (board meeting, owner meeting, committee, maintenance, etc.)
  - Click event → detail panel with agenda, documents, location
  - Filter by event type

- [ ] **2A.2** iCal feed export
  - Generate .ics feed URL per association (read-only)
  - Include all meetings, deadlines, assessment due dates
  - Auto-update when events change
  - Subscribe URL works in Apple Calendar, Google Calendar, Outlook

- [ ] **2A.3** Google Calendar OAuth sync (stretch)
  - Two-way sync for board members (meetings created in PropertyPro appear in their Google Calendar)
  - Use existing calendar_sync_tokens table
  - OAuth consent flow
  - Conflict detection

- [ ] **2A.4** Ship gate
  - [ ] Calendar renders all meeting types correctly
  - [ ] iCal subscription works in 3 major calendar apps
  - [ ] Google Calendar sync functional (or deferred to Phase 3 if OAuth complexity is high)

---

### Phase 2B: Native E-Sign Tool (Weeks 15-20)

**Existing infrastructure:** esign_templates, esign_submissions, esign_signers, esign_events, esign_consent tables. Significant schema already built.

- [ ] **2B.1** Template builder
  - Upload PDF → place signature/initial/date fields via drag-and-drop
  - Define signer roles (owner, board president, CAM, witness)
  - Save as reusable template
  - Pre-built templates: proxy form, ARC approval letter, violation notice acknowledgment, lease agreement, estoppel request

- [ ] **2B.2** Signing flow
  - Email invitation to signers with secure link
  - In-browser signing (draw signature, type signature, or upload image)
  - UETA/ESIGN Act compliance (consent to electronic signature, ability to withdraw consent, record retention)
  - Signing order enforcement (if sequential signatures required)
  - Completed document with signature certificates embedded in PDF

- [ ] **2B.3** Audit trail
  - Every action logged in esign_events (view, sign, decline, void)
  - IP address + timestamp + user agent for each signature
  - Tamper-evident: hash of signed document stored
  - Certificate of completion PDF

- [ ] **2B.4** Integration with existing features
  - ARC approvals → auto-generate approval letter for e-sign
  - Violation notices → send for owner acknowledgment
  - Proxy forms → e-sign and auto-register proxy for voting
  - Lease agreements (apartment vertical)

- [ ] **2B.5** Ship gate
  - [ ] Full sign cycle: upload template → place fields → send → sign → complete
  - [ ] UETA/ESIGN compliance verified
  - [ ] Audit trail complete and exportable
  - [ ] At least 3 pre-built templates functional
  - [ ] Signed PDFs stored in document management system

---

### Phase 2C: PM Portfolio Dashboard Enhancements (Weeks 18-22)

**Existing infrastructure:** PM dashboard exists with basic portfolio view and compliance status.

- [ ] **2C.1** Cross-community reporting
  - Aggregate compliance scores across all managed communities
  - Delinquency summary (total outstanding across portfolio)
  - Maintenance request volume and resolution time by community
  - Violation trends across portfolio

- [ ] **2C.2** Bulk operations
  - Send announcement to multiple communities simultaneously
  - Upload document to multiple communities (e.g., PM company insurance certificate)
  - Bulk assessment schedule creation

- [ ] **2C.3** PM-specific branding controls
  - Company logo + colors on all community portals
  - Custom email templates with PM branding
  - PM contact info on public-facing community sites
  - Co-branded mobile experience (when mobile app ships)

- [ ] **2C.4** Apartment-specific features
  - Lease management integration (leases table exists)
  - Move-in/move-out workflows
  - Package logging (package_log table exists)
  - Visitor logging (visitor_log table exists)
  - Site manager role (already in user_roles)

- [ ] **2C.5** Ship gate
  - [ ] PM can view aggregate reporting across 3+ communities
  - [ ] Bulk announcement + document upload functional
  - [ ] Apartment lease/package/visitor workflows complete
  - [ ] At least 1 PM company piloting the dashboard

---

## Phase 3: SEO & Content Marketing (Weeks 20-32)

**Goal:** Build organic acquisition channel. Content marketing takes 3-6 months to compound — results from this phase will start appearing around weeks 32-40.

**Note from earlier analysis:** This was recommended to start in Week 1. It is being deferred per the user's decision. Every week of delay pushes organic traffic results further out.

---

### Phase 3A: Foundation (Weeks 20-23)

- [ ] **3A.1** Technical SEO setup
  - Sitemap.xml generation for marketing pages
  - Meta tags, Open Graph tags, structured data (LocalBusiness, SoftwareApplication schemas)
  - Page speed optimization (Core Web Vitals — you already have perf budgets)
  - Blog infrastructure (either in Next.js app or separate CMS)

- [ ] **3A.2** Pillar content: Florida Condo Compliance Checklist for 2026
  - The single most comprehensive, statute-linked, plain-English compliance checklist on the internet
  - Standalone landing page (not a blog post)
  - "Check your compliance free" CTA → lightweight self-assessment form (5 questions, email capture)
  - This is your lead-gen funnel — equivalent of HOACloud's free compliance audit

- [ ] **3A.3** Blog post batch #1 (long-tail keywords, high-intent)
  - "Florida condo website requirement 25 units 2026"
  - "DBPR fine for no condo website Florida"
  - "Cheapest way to comply Florida condo website law"
  - "Do I need a website for my HOA Florida 2026"
  - Each post links back to pillar page and includes CTA

- [ ] **3A.4** Attorney white paper
  - "Technology Solutions for §718.111(12)(g) Compliance: A Guide for Community Association Counsel"
  - PDF format, professional design
  - Send to 50 Florida community association attorneys (Becker & Poliakoff, Siegfried Rivera, Kaye Bender, etc.)
  - This is the highest-leverage referral channel — one attorney recommends you to dozens of boards

### Phase 3B: Ongoing Content (Weeks 24-32)

- [ ] **3B.1** Blog post batch #2 (problem-aware keywords)
  - "Florida condo special assessment 2026 what to expect"
  - "SIRS deadline Florida condo when is it due"
  - "How to run a condo board election in Florida"
  - "Florida condo violation notice template"
  - "How to collect HOA dues online Florida"

- [ ] **3B.2** Comparison pages
  - "PropertyPro vs CondoSites" (target boards comparing options)
  - "PropertyPro vs HOACloud" (target PM companies)
  - "Best Florida condo compliance software 2026" (target generic searches)
  - Honest comparison — acknowledge where competitors win on specific features

- [ ] **3B.3** Case studies (requires Phase 1 customers)
  - Before/after compliance scores
  - Time saved per month
  - Payment collection improvement
  - Customer quotes with permission

- [ ] **3B.4** Email nurture sequence
  - Capture from pillar page CTA → 5-email sequence:
    1. Compliance checklist download
    2. "3 things your condo website is probably missing"
    3. Case study
    4. Free trial offer
    5. "Your DBPR deadline is approaching" (urgency)

### Phase 3C: Ship Gate

- [ ] **3C.1** Phase 3 success criteria
  - [ ] Pillar page indexed and ranking for target keywords
  - [ ] 8+ blog posts published
  - [ ] Attorney white paper distributed to 50+ attorneys
  - [ ] Email capture converting at >3% on pillar page
  - [ ] At least 1 inbound lead attributed to organic search

---

## Phase 4: Native Mobile App (Weeks 24-36)

**Note:** This phase was not in the user's original plan. It is included because the mobile app was identified as the primary differentiator over competitors in the market entry plan, and the $99/mo price premium requires justification. Without a mobile app, the pricing argument against CondoSites ($55/mo, no setup) is weak.

---

- [ ] **4.1** Technology decision
  - React Native + Expo (original spec) vs. Progressive Web App
  - PWA is faster to ship but no App Store presence and limited push notification support on iOS
  - React Native is 8-12 weeks but gives App Store listing, native push, camera access

- [ ] **4.2** Core mobile screens
  - Login (association-branded)
  - Dashboard (announcements feed, upcoming meetings, quick actions)
  - Documents (browse by category, search, PDF viewer)
  - Payments (view balance, pay assessment, payment history)
  - Maintenance (submit request with camera, view status)
  - Notifications (push notification history)
  - Profile/settings

- [ ] **4.3** Push notification infrastructure
  - Expo Notifications → APNs (iOS) / FCM (Android)
  - Triggers: new announcement, meeting notice, maintenance status update, payment due, emergency alert
  - Respect notification_preferences settings
  - Deep linking: push notification taps open the relevant screen

- [ ] **4.4** App Store submission
  - Apple App Store review (allow 2-4 weeks for review + potential rejections)
  - Google Play Store submission
  - App Store Optimization: screenshots, description, keywords targeting Florida condo owners

- [ ] **4.5** Ship gate
  - [ ] App available in both stores
  - [ ] Push notifications working for all trigger types
  - [ ] Payment flow works end-to-end in mobile
  - [ ] Camera integration for maintenance requests
  - [ ] Offline document caching for recent documents (stretch)

---

## Phase 5: Research & Advanced Features (Weeks 32-44)

**Goal:** Build moat features that no competitor has. These are differentiators, not table stakes.

---

### Phase 5A: SIRS & Milestone Inspection Lifecycle Manager (Weeks 32-38)

- [ ] **5A.1** Research phase
  - Interview 5 structural engineering firms that conduct SIRS inspections
  - Interview 3 Florida condo attorneys about how boards interact with SIRS requirements
  - Map the full SIRS lifecycle: initial study → reserve funding plan → annual updates → milestone inspections
  - Identify data points that can be tracked vs. require external verification

- [ ] **5A.2** SIRS status dashboard
  - Current SIRS status: have it / don't have it / expired / due for update
  - Due date tracking with advance warnings (12 months, 6 months, 90 days)
  - Reserve funding percentage vs. SIRS recommendation (input by board, not calculated)
  - Milestone inspection tracking for buildings 3+ stories / 30+ years old
  - Document storage for SIRS reports, engineering reports, remediation plans

- [ ] **5A.3** Owner-facing SIRS transparency page
  - Plain-language explanation of building's structural status
  - Links to stored SIRS reports
  - Reserve funding status (funded/underfunded/critically underfunded)
  - **NO** PropertyPro assessment of adequacy — factual data only (legal constraint)

- [ ] **5A.4** Attorney referral integration (stretch)
  - If SIRS reveals issues, recommend consultation with structural engineer and attorney
  - Partner directory of Florida structural engineering firms
  - Does NOT provide engineering or legal advice

- [ ] **5A.5** Ship gate
  - [ ] SIRS status visible on compliance dashboard
  - [ ] Deadline tracking and advance notifications working
  - [ ] Owner-facing transparency page displays factual data
  - [ ] Attorney review of any language that could imply engineering assessment

---

### Phase 5B: AI Meeting Minutes Generator (Weeks 36-44)

- [ ] **5B.1** Research phase
  - Evaluate existing meeting transcription services:
    - **Otter.ai** (API available, $30/mo pro plan)
    - **Fireflies.ai** (API available, meeting bot integration)
    - **AssemblyAI** (transcription API, $0.65/hr)
    - **Whisper** (open source, self-hosted, free but requires GPU)
    - **Minute-Mate** (purpose-built for meeting minutes — potential partner or competitor)
  - Key evaluation criteria: accuracy, speaker diarization, cost, Florida-specific legal terminology
  - Determine if integration (API) or build (Whisper) is more appropriate

- [ ] **5B.2** Audio upload + transcription pipeline
  - Board member uploads meeting audio/video recording
  - Transcription service processes recording
  - Speaker diarization (who said what)
  - Raw transcript stored and editable

- [ ] **5B.3** AI minutes generation
  - LLM processes transcript → generates structured meeting minutes
  - Template: call to order, roll call, agenda items discussed, motions made, votes taken, action items, adjournment
  - Florida-specific: flag any motions that require statutory notice periods or documentation
  - Human review step: board secretary reviews and edits AI-generated minutes before publishing
  - **CRITICAL:** AI minutes are a draft. A human must approve before they become official. This is both a quality and legal requirement.

- [ ] **5B.4** Minutes approval workflow
  - Secretary edits draft → submits for board approval
  - Board approves at next meeting (can be done via e-voting)
  - Approved minutes auto-published to owner portal
  - Archived in documents system with proper retention tagging (rolling 12 months)

- [ ] **5B.5** Ship gate
  - [ ] Audio upload → transcription → draft minutes pipeline works end-to-end
  - [ ] AI-generated minutes are accurate for 80%+ of content (verified against 5 real meeting recordings)
  - [ ] Secretary review/edit flow functional
  - [ ] Board approval workflow connected to e-voting
  - [ ] Approved minutes auto-published and properly archived
  - [ ] Cost per meeting transcription documented and reflected in pricing

---

## Cross-Phase: Pricing Adjustments

These pricing changes should be made as features ship, not held until all phases complete:

- [ ] **P.1** Immediately: Drop $500 setup fee, replace with 60-day free trial
- [ ] **P.2** Phase 1A complete: Introduce "Essentials" tier at $79/mo (compliance + payments only)
- [ ] **P.3** Phase 1D complete: Current $99/mo becomes "Standard" tier (compliance + payments + voting + violations)
- [ ] **P.4** Phase 2B complete: Introduce "Professional" tier at $149/mo (Standard + e-sign + amenity reservations)
- [ ] **P.5** Phase 2C complete: Introduce PM tier at $49/mo per community (volume discount for 5+ communities)
- [ ] **P.6** Phase 5 complete: SIRS tracker and AI minutes as add-ons or included in Professional tier

---

## Cross-Phase: Technical Debt & Infrastructure

These items should be addressed continuously, not deferred to a "tech debt sprint":

- [ ] **T.1** Automated test coverage: maintain >80% for all new features
- [ ] **T.2** Performance budget monitoring: run perf:check in CI for every PR
- [ ] **T.3** Security audit before Phase 1A ships (payment data handling)
- [ ] **T.4** Database migration versioning: every schema change via Drizzle migrations
- [ ] **T.5** Error monitoring: set up Sentry or equivalent before Phase 1A ships
- [ ] **T.6** Uptime monitoring: set up health checks for payment webhooks and critical paths
- [ ] **T.7** Backup verification: test database restore procedure monthly

---

## Timeline Summary

| Phase | Duration | Key Deliverable | Revenue Impact |
|---|---|---|---|
| **1A: Payments** | Weeks 1-4 | Owners can pay dues online | Unlocks sales to spreadsheet boards |
| **1B: Emergency Notifications** | Weeks 3-5 | SMS/email broadcast | High perceived value, low effort |
| **1C: Violations** | Weeks 5-8 | Full violation lifecycle | Table stakes for board operations |
| **1D: E-Voting** | Weeks 7-10 | Statutory e-voting | Retention mechanism (annual elections) |
| **1E: ARC/ACC** | Weeks 9-12 | Architectural review + HB 1203 compliance | Operational pain point resolved |
| **2A: Calendar** | Weeks 13-15 | Visual calendar + iCal sync | Quality of life, low effort |
| **2B: E-Sign** | Weeks 15-20 | Full signing workflow | Enables PM workflows |
| **2C: PM Dashboard** | Weeks 18-22 | Portfolio reporting + apartment tools | Unlocks PM channel sales |
| **3: SEO/Content** | Weeks 20-32 | Organic acquisition channel | Results appear ~weeks 32-40 |
| **4: Mobile App** | Weeks 24-36 | App Store presence + push notifications | Justifies price premium |
| **5A: SIRS Tracker** | Weeks 32-38 | Structural inspection lifecycle | Moat feature, attorney referrals |
| **5B: AI Minutes** | Weeks 36-44 | Audio → draft minutes | Time savings, retention |

**Total timeline to full feature parity + differentiation: ~44 weeks (~10 months)**

---

## Intentionally Excluded (And Why)

| Feature | Why Excluded | Recommendation |
|---|---|---|
| **Full Accounting/GL** | Multi-year engineering effort. QuickBooks and AppFolio own this space. Building a GL is a distraction from your compliance + operations positioning. | Build a QuickBooks Online integration (API export of assessments, payments, ledger entries) in Phase 2 or 3. Let accountants use the tool they already know. |
| **Amenity Reservations UI** | Schema exists (amenities + amenity_reservations tables). Not prioritized for self-managed board segment — they care about compliance + payments first. | Ship as part of Phase 2C apartment features where amenity reservations (pool, gym, clubhouse) are a daily operational need. Low effort given existing schema. |
| **Package/Visitor Logging UI** | Schema exists (package_log, visitor_log). Primarily an apartment/doorman building feature, not relevant to 25-149 unit self-managed condos. | Ship as part of Phase 2C apartment features. |
| **Forum/Community Board** | Schema exists (forum_threads, forum_replies). Nice-to-have but not a purchase driver. Risk of becoming a complaint board that increases board liability. | Defer indefinitely. If customers request it, reconsider. |
| **Digital Signage Integration** | Listed in original spec as out of scope. Niche feature for large communities with lobby screens. | Not recommended for next 12 months. |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Stripe Connect rejected for HOA use case | Low | Critical | Pre-apply and confirm HOA payments are eligible before building |
| §718.128 e-voting compliance gap | Medium | High | Attorney review BEFORE shipping (blocking gate) |
| No customers after Phase 1A | Medium | Critical | If zero paying customers by week 8, pause Phase 1C and run 2-week validation sprint |
| Competitor ships SIRS tracker first | Low | Medium | Phase 5A can be accelerated if competitive pressure requires |
| Mobile app rejected from App Store | Medium | Medium | Budget 4 weeks for review cycle; have PWA fallback |
| Engineer burnout from 44-week sprint | High | High | Plan breaks between sub-phases; prioritize ruthlessly |
| SEO delayed to Phase 3 means no organic traffic until month 8+ | High | Medium | Monitor competitor SEO monthly; accelerate if losing ground |

---

*Document Version: 1.0*
*Last Updated: March 16, 2026*
*Next Review: After Phase 1A ship gate*
