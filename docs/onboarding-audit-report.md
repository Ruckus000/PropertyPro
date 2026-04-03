# PropertyPro Onboarding: Comprehensive Audit Report

**Date:** 2026-04-02
**Purpose:** Fact-finding for onboarding rebuild — launching this week
**Scope:** (1) Modern SaaS onboarding philosophy, (2) Current system analysis

---

## Part 1: The Philosophy of Modern SaaS Onboarding

### The Three-Phase Model

Modern onboarding is not a product tour. It is a systematic process of moving a user from signup to an established habit around the product's core value. The Reforge framework defines three phases:

1. **Setup Moment** — The user configures the product so they are ready to use it
2. **Aha Moment** — The user experiences the core value proposition for the first time
3. **Habit Moment** — The user has repeated the core action multiple times, forming a behavioral loop

The biggest mistake: stopping activation efforts at the setup moment. PropertyPro currently does exactly this.

### The Speed Imperative

- Every extra minute of onboarding friction lowers conversion by ~3%
- 90% of users churn if they don't understand value within the first week
- 70% of customers abandon setup if it takes 20+ minutes
- Buyers evaluate 3-5 competing tools simultaneously — friction in yours while a competitor flows smoothly means the decision is made by hour 48

### Core Principles

**Progressive Disclosure:** Show users only what they need right now. 3-7 core steps max (anything over 20 steps drops completion by 30-50%).

**Personalization:** A single routing question during signup that reshapes the downstream experience lifts 7-day retention by 35%. But each additional question beyond 2-3 reduces completion by 10-15%.

**Action Over Education:** Interactive walkthroughs where users perform real actions cut time-to-value by 40% compared to passive feature tours.

---

### What Great Onboarding Looks Like

| Product | What They Do | Why It Works |
|---------|-------------|--------------|
| **Figma** | Drops users into a canvas immediately. First action: draw a shape. | Users produce real output during onboarding itself. 65% activation rate. |
| **Slack** | First action: create a channel. Value delivered in under 2 minutes. | The aha moment IS the first action. Signup-to-activation +25%. |
| **Notion** | Routes users to different template sets based on one question. Checklist: "Add a page, Invite teammate, Try template." | 55% onboarding completion vs industry avg of 20-30%. Checklist achieves 60% completion with 40% retention bump at 30 days. |
| **Loom** | Users recording and sharing in under 60 seconds. | 70% day-one activation. Users experience value before signup (receiving a Loom link). |
| **Linear** | No welcome tour. Features introduced gently as users interact. | The product's design itself IS the onboarding. |
| **Canva** | Asks "What will you design?" immediately. Template-forward. | Empty state ("Start with a template") converts 75% of first sessions into creations. |

**What these all share:**
1. Users do something real within the first 2 minutes
2. Onboarding IS the product experience, not a layer on top of it
3. Personalization happens through action, not long questionnaires
4. Empty states are conversion opportunities, not dead ends
5. Progress indicators leverage the Zeigarnik effect (psychological drive to complete unfinished tasks)

### What Bad Onboarding Looks Like

| Anti-Pattern | Why It Fails |
|-------------|-------------|
| **The Feature Tour Slideshow** | Passive multi-screen tours users click through without doing anything. Near-zero retention. |
| **One-Size-Fits-All** | A board president, a CAM, and a unit owner have entirely different needs. Forcing them through identical flows means none reach their aha moment. |
| **The Information Dump** | Showing every feature upfront. Tooltips covering the entire screen. Explaining what buttons do instead of why they matter. |
| **The Gate of Doom** | Mandatory email verification, profile completion, and feature tours before delivering any value. Every gate before value is a gate users walk away from. |
| **Time-to-Value Inflation** | Complex setup that takes 20+ minutes before the user sees any value. |
| **The Abandoned Empty State** | Leaving screens completely blank with no guidance or path forward. |
| **Stopping at Setup** | Graduating customers from onboarding before they see value. Setup completion is NOT activation. |

### B2B-Specific: The Two-Layer Model

B2B onboarding has two fundamentally different audiences:

**Admin/Buyer Onboarding (the first user):**
- Goals are infrastructure: access control, data migration, team setup
- They need confidence the product is ready before inviting others
- Self-serve admin configuration is the new baseline

**End-User Onboarding (invited users):**
- Different roles need different activation milestones
- Often arrive skeptical — they didn't choose this product
- Must prove personal value, not just organizational value

Key stat: Organizations with multiple activated users churn at 1/3 the rate of single-user accounts. B2B products with account-based activation report 40-70% higher net revenue retention.

### Compliance Industry Considerations

Compliance platforms face unique challenges:

1. **Data migration is mandatory** — The product has zero value until existing documents and records are in the system
2. **Setup is inherently complex** — Community structure, unit mapping, role assignments. This IS the product, not optional config.
3. **Trust is the prerequisite** — Users need confidence before they engage
4. **The buyer is rarely the end user** — PMs select it; residents must adopt it
5. **Compliance itself is the value proposition** — The aha moment is seeing your compliance status, not learning a feature

Property management competitors (Buildium, AppFolio) use high-touch onboarding: dedicated specialists, kickoff calls, assisted data import. Their conclusion: you cannot self-serve your way through initial property management setup without guidance.

### The Aha Moment

The aha moment is when a user realizes why the product exists for them — experientially, not intellectually. Users who hit the activation milestone retain at 2x the rate of those who don't.

**PropertyPro's likely aha moments:**
- **For the admin/PM:** Seeing the compliance dashboard populated with real community data and understanding what needs attention
- **For the board member:** Receiving an action item notification and completing it within the platform
- **For the resident/owner:** Accessing a community document that previously required calling the management office

The admin aha moment is the critical one — it gates whether anyone else ever gets invited.

### Key UX Patterns That Work

**Onboarding Checklists:** Users who complete a checklist are 3x more likely to become paying customers. 5-7 items, lead with a quick win (< 30 seconds to complete), visual progress indicator (+30-50% completion rates). Three-step product tours have 72% completion — highest of any length.

**Empty States as Conversion:** Two parts instruction, one part personality. "No documents yet" becomes "Upload your first document to start tracking compliance." Some products preload sample data so users never see empty states at all.

**Contextual Tooltips:** Triggered on behavior, not page load. One per screen max. 25 words per step. Permanently dismiss after interaction. Reduces per-step drop-off by 28%.

**Celebration Moments:** Confetti, badges, congratulatory messages at key milestones. One fintech platform maintains 80% signup completion (vs 15% industry average) using progress bars + celebrations.

### Metrics That Matter

| Metric | Target | Why |
|--------|--------|-----|
| Activation rate | 40-60% | Users hitting activation milestone / users completing signup. SaaS median is 25%. |
| Time-to-first-value | < 5 minutes | Time from first login to seeing populated, valuable data |
| Onboarding completion | 65-85% | % of users who complete the setup checklist |
| 7-day retention | 75-85% | Activated users should retain at 2x non-activated |
| Setup dropoff by step | N/A | Which step loses the most users — optimize that one first |

**ROI:** A 25% increase in user activation produces a 34% rise in MRR over 12 months. Every 1% activation increase correlates with ~2% lower churn. Strong onboarding reduces 30-day churn from 15-20% to 7-10%.

---

## Part 2: Current PropertyPro Onboarding System

### Architecture Overview

The system covers four arcs:

| Arc | Path | Who |
|-----|------|-----|
| **Self-service signup** | `/signup` → verify → checkout → provisioning → auto-login | New PM/board president creating a community |
| **Post-signup wizard** | `/onboarding/condo` or `/onboarding/apartment` | First admin configuring a provisioned community |
| **Invitation flow** | Email invite → `/auth/accept-invite` → set password | Residents/owners/tenants joining an existing community |
| **Admin-activated** | `apps/admin` → demo creation or free access grant | Platform admin creating communities for prospects |

### Arc 1: Self-Service Signup (7 steps)

**Step 1 — Signup Form** (`/signup`)
Single-screen form collecting: contact name, email, password, community name, address, county, unit count, community type (3 toggle buttons), plan selection, subdomain, ToS checkbox. PM type shows "Contact Sales" instead of a form.

**Step 2 — API Processing**
Validates, re-checks subdomain, creates `pending_signups` row with `status = 'pending_verification'`, creates Supabase auth user via admin API (controls branding by sending email via Resend, not Supabase default), stores auth user ID.

**Step 3 — Email Verification Waiting** (`/signup/verify`)
"Check your email" screen with masked email, resend button (2-minute cooldown). Polls `POST /api/v1/auth/confirm-verification` every 5 seconds. Auto-redirects to checkout when verified.

**Step 4 — Email Link Click**
Supabase processes verify token, redirects back to `/signup?verified=1`. Form detects param and calls confirm-verification API. Transitions status to `email_verified`. Shows "Proceed to Checkout" button.

**Step 5 — Stripe Checkout** (`/signup/checkout`)
Embedded Stripe checkout UI. Creates session with 14-day trial. Metadata includes signupRequestId, communityType, selectedPlan, candidateSlug. Status transitions to `checkout_started`.

**Step 6 — Stripe Webhook → Provisioning**
On `checkout.session.completed`: updates status to `payment_completed`, creates `provisioning_jobs` stub, runs 7-step provisioning state machine:

| Step | Action |
|------|--------|
| `community_created` | Creates community row (slug, type, timezone hardcoded to `America/New_York`) |
| `user_linked` | Creates users row, assigns `pm_admin` role |
| `checklist_generated` | Inserts compliance checklist from template (condo/HOA only) |
| `categories_created` | Inserts default document categories (5 categories, differs by type) |
| `preferences_set` | Inserts notification preferences for founding user |
| `email_sent` | Sends WelcomeEmail via Resend |
| `completed` | Marks pending_signups as completed |

**Step 7 — Provisioning Progress + Auto-Login** (`/signup/checkout/return`)
Polls provisioning status every 2 seconds (max 15 polls = 30 seconds). Shows 3 animated stages. On completion, auto-logs in via cached magic link token + `verifyOtp()`. Redirects to `/dashboard?communityId=<id>`.

### Arc 2: Post-Signup Onboarding Wizards

Dashboard enforces wizard redirect if `wizardState` is `in_progress` or absent. Wizards use a minimal layout (no sidebar/topbar). Both wizards are skippable (sets `status = 'skipped'`, irreversible from UI).

**Condo/HOA Wizard** (4 steps):

| Step | What | Data Collected |
|------|------|---------------|
| 0 — Statutory Documents | Upload/link required compliance docs | Document mappings to checklist items |
| 1 — Community Profile | Name, full address, timezone, logo | Community row updates |
| 2 — Branding | Primary/secondary/accent colors, heading/body fonts | Branding settings |
| 3 — Unit Roster | Bulk unit entry (number, floor, beds, baths, sqft, rent) | Units table inserts |

**Apartment Wizard** (5 steps):

| Step | What | Data Collected |
|------|------|---------------|
| 0 — Profile | Same as condo step 1 | Community row updates |
| 1 — Branding | Same as condo step 2 | Branding settings |
| 2 — Units | Same as condo step 3 | Units table inserts |
| 3 — Rules | Upload house rules / lease addendum (skippable) | Document upload |
| 4 — Invite | Invite first tenant: email, name, unit (skippable) | Resident creation + invitation email |

State persists step-by-step via PATCH. Multiple admins share the same wizard state. `completionMarkers` in the JSONB payload prevent re-running side effects on revisits.

### Arc 3: Invitation Flow (Resident Onboarding)

**Creating:** `POST /api/v1/residents/invite` — creates user + role + notification preferences + invitation row with 64-char hex token. Sends branded `InvitationEmail`.

**Accepting:** `/auth/accept-invite?token=<hex>&communityId=<id>` — shows branded "Set your password" form. On submit, creates Supabase auth user with `email_confirm: true` (invite IS the verification), marks invitation consumed.

**No post-acceptance onboarding.** After setting a password and logging in, the invited user hits the dashboard with no guidance, no tour, no checklist. They see the same "Welcome back" greeting as a returning user.

### Arc 4: Admin-Activated Paths

**Demo Creation** (`apps/admin/demo/new`): 3-step wizard (Basics, Public Site template, Review). Creates a `demo_instances` row and provisions a community marked `is_demo: true`. Admin gets a shareable URL for the prospect.

**Free Access Grants** (`/api/v1/admin/access-plans`): Creates an access plan with `durationMonths`, `gracePeriodDays`. When the community later completes Stripe checkout, marks `convertedAt`.

### Email Touchpoints During Onboarding

| When | Template | Content |
|------|----------|---------|
| Signup submitted | `SignupVerificationEmail` | Verify your email |
| Resend verification | Same | Same |
| Provisioning complete | `WelcomeEmail` | "Welcome to PropertyPro — [name] is ready" + login link |
| Resident invited | `InvitationEmail` | "[blank] has invited you to join [community]" |
| Payment failed | `PaymentFailedEmail` | Payment issue notification |
| Subscription canceled | `SubscriptionCanceledEmail` | Cancellation confirmation |

---

## Part 3: Gap Analysis — Current State vs. Best Practices

### Critical Gaps

#### 1. No Post-Wizard Activation
**Current:** Onboarding ends when the wizard completes (or is skipped). The user hits the dashboard and is on their own.
**Best practice:** Onboarding continues with an in-dashboard checklist driving users to their aha moment (populated compliance dashboard, first meeting notice, first resident invited).
**Impact:** High. This is the #1 anti-pattern (stopping at setup). The wizard handles setup but never delivers the aha moment.

#### 2. Invited Users Get Zero Onboarding
**Current:** Residents/owners accept an invite, set a password, and land on the dashboard with "Welcome back, [name]." No tour, no guidance, no contextual help.
**Best practice:** Role-based onboarding for invited users showing them why the platform matters to *them* specifically. A board member needs to see pending approvals. An owner needs to see their documents.
**Impact:** Critical. These are the end users whose adoption determines whether the community sticks with PropertyPro. They didn't choose this product — you need to win them over.

#### 3. No Role-Based Personalization
**Current:** The onboarding wizard is identical for all admin roles. The dashboard greeting is identical for all users. No differentiation between a board president, CAM, site manager, or property manager admin.
**Best practice:** A single routing question reshaping the downstream experience (+35% 7-day retention).
**Impact:** High. Different roles have fundamentally different aha moments.

#### 4. Empty States Are Not Leveraged
**Current:** Not audited in detail, but the dashboard has no first-use detection. "Welcome back" appears on first visit.
**Best practice:** Empty states should be the most carefully designed screens in the product. Each one is a conversion opportunity with specific guidance.
**Impact:** Medium-high. Empty dashboards with no data and no guidance are where users decide the product isn't for them.

#### 5. The Wizard Is Skippable With No Recovery
**Current:** Users can "Skip entire setup and go to dashboard." Skipping sets `status = 'skipped'` permanently (no UI to re-enter). The community has no units, no branding, no documents.
**Best practice:** If you allow skipping, provide an in-dashboard path to complete setup later. Better: make the first step so quick and rewarding that skipping feels worse than completing.
**Impact:** Medium. Users who skip the wizard and hit an empty, unbranded dashboard will churn.

### Specific Bugs/Issues Found

| Issue | Severity | Location |
|-------|----------|----------|
| Blank inviter name in invitation emails — renders as "[blank] has invited you to join..." | Medium | `invitations/route.ts` and `onboarding-service.ts` — `inviterName: ''` |
| Dashboard always says "Welcome back" — no first-visit detection | Low | `DashboardWelcome` component |
| Hardcoded timezone `America/New_York` during provisioning — wrong for non-EST Florida communities or future expansion | Low | `provisioning-service.ts` |
| Provisioning timeout at 30 seconds shows failure even if provisioning succeeds shortly after | Medium | `provisioning-progress.tsx` — 15 polls at 2 seconds |
| No resume path for timed-out provisioning — user has no way to check if their community came online | Medium | No recovery UI |
| "Wrong email? Go back" link from verify page doesn't carry `signupRequestId` — form starts fresh | Low | `verify-email-content.tsx` |
| HOA uses condo wizard with no differentiation — compliance template differs but UI/flow is identical | Low | Intentional but suboptimal |

### Strengths of Current Implementation

The system isn't all gaps. Several things are well-built:

1. **Robust provisioning state machine** — 7-step process with per-step persistence, retry recovery, idempotency guards. This is production-grade infrastructure.
2. **Anti-abuse measures** — Timing attack mitigation, subdomain squatting prevention, 2-minute cooldown on resends, TOCTOU race guards on status transitions.
3. **Auto-login after provisioning** — Users don't have to hunt for a login page after paying. Cached magic link token + `verifyOtp()` is seamless.
4. **Stripe embedded checkout** — Clean UX, 14-day trial, session recovery on page refresh.
5. **Step-by-step wizard persistence** — Each step saves independently, multiple admins can collaborate on the same wizard, completionMarkers prevent duplicate side effects.
6. **Branded invitation pages** — Invitation acceptance pages load community logo, colors, and fonts. This builds trust and recognition for invited users.

---

## Part 4: PropertyPro's Aha Moment Strategy

### Defining the Aha Moment by Role

| Role | Likely Aha Moment | Why |
|------|------------------|-----|
| **PM Admin / CAM** | Seeing the compliance dashboard populated with real documents, showing a compliance score, and highlighting what's overdue | This is the core value prop — compliance visibility without manual tracking |
| **Board President** | Receiving a notification about a compliance deadline or meeting, and acting on it within the platform | Proves the platform replaces email chains and physical binders |
| **Board Member** | Reviewing and approving a document or ARC submission through the platform | Demonstrates that board governance happens digitally |
| **Owner/Resident** | Accessing a community document, announcement, or maintenance request without calling the office | Personal value — convenience and transparency |

### Time-to-Aha-Moment Analysis (Current State)

**For the admin (self-service path):**
1. Signup form: ~3-5 minutes
2. Email verification: ~1-5 minutes (waiting for email)
3. Checkout: ~2-3 minutes
4. Provisioning: ~10-30 seconds
5. Wizard (if not skipped): ~10-20 minutes (4-5 steps of data entry)
6. **Aha moment (populated compliance dashboard):** Only reachable after uploading documents in Step 0 of the wizard

**Total time to aha: 15-30+ minutes** — well above the 5-minute target. The compliance dashboard (the aha) requires document uploads, which require the wizard, which requires provisioning, which requires payment.

### How to Accelerate

1. **Pre-populate with sample/demo data** so the compliance dashboard has something to show immediately after provisioning — before the wizard, before document uploads. "Here's what your dashboard will look like when you're set up."
2. **Move the aha moment before the setup moment** — show the compliance score (even estimated or simulated) during the signup flow itself.
3. **Make the first wizard step the quickest possible win** — community profile (pre-populated from signup data) should auto-save with a celebration, not require manual review.
4. **Defer non-essential setup** — Branding, unit roster, and rules upload can happen later. Get to the compliance dashboard FAST.

---

## Part 5: Recommended Onboarding Checklist (Post-Wizard)

Based on research findings, PropertyPro should implement a persistent in-dashboard checklist that survives beyond the wizard:

### Admin Checklist (PM/CAM/Board President)

1. **Complete your community profile** (quick win — much of this is pre-filled)
2. **Upload your first compliance document** (drives toward aha)
3. **Invite your first board member or resident** (multi-user activation)
4. **Review your compliance score** (THE aha moment)
5. **Post your first announcement** (establishes the communication loop)
6. **Set up your first meeting notice** (compliance action)

### Invited User Checklist (Owner/Tenant)

1. **Review your community's latest announcement** (immediate value)
2. **Check your unit details** (personalization)
3. **Access a community document** (core value)
4. **Update your notification preferences** (ownership)

---

## Part 6: Self-Service vs. Admin-Activated Comparison

| Dimension | Self-Service | Admin-Activated |
|-----------|-------------|----------------|
| **Entry point** | `/signup` public page | `apps/admin/demo/new` or `admin/access-plans` |
| **Payment** | Required (Stripe checkout before provisioning) | None (free access plan or demo mode) |
| **Community creation** | Automated via provisioning state machine | Manual by platform admin |
| **Wizard** | Enforced on first dashboard visit | Same wizard applies |
| **Onboarding guidance** | None beyond the wizard | None beyond the wizard |
| **Data seeding** | Empty community (only default categories + checklist template) | Demo communities get seed data via `pnpm seed:demo` |
| **User role** | Always `pm_admin` initially | Admin can assign any role |
| **Time to value** | 15-30+ minutes (signup + verify + pay + wizard) | Faster (no signup/payment gates) but still requires wizard |

**Key insight:** Admin-activated communities (demos) actually get a better onboarding experience because they can be pre-seeded with data. The compliance dashboard has something to show. Self-service communities start completely empty, making the aha moment unreachable until significant data entry is complete.

---

## Summary: What Must Change for Launch

### Non-Negotiable for Awe-Inspiring Onboarding

1. **Post-wizard in-dashboard checklist** with progress tracking and role-based tasks
2. **First-visit experience** for invited users — guided, role-appropriate, welcoming (not "Welcome back")
3. **Empty state strategy** — every empty dashboard section needs guidance and a direct action path
4. **Sample/demo data option** for self-service signups so the compliance dashboard has value before manual data entry
5. **Fix the blank inviter name** in invitation emails

### High-Impact, Low-Effort Wins

- Change "Welcome back" to "Welcome" with first-visit detection
- Pre-populate wizard step 1 (community profile) and auto-advance if all fields are filled from signup
- Add a "What to do next" card on the dashboard after wizard completion
- Add the inviter's name to invitation emails (it's already available in the session)
- Add a celebration moment when the compliance score first appears

### Architectural Decisions Needed

- Should the wizard be rebuilt as an in-dashboard checklist instead of a separate flow?
- Should we offer a "quick start with sample data" option for self-service signups?
- Should invited users get a mini-tour or checklist specific to their role?
- Should the wizard skip button be removed or converted to "I'll do this later" with dashboard reminders?
