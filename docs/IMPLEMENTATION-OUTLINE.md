# PropertyPro Florida — Implementation Planning Outline

**Version:** 1.2 (Gap Review Update)
**Date:** February 2026
**Status:** Active Development (Schema Drift Remediation Verified 2026-02-14)
**Classification:** Internal / Confidential

---

## 1. Executive Summary

This document outlines the implementation plan for PropertyPro Florida, a compliance and community management platform for Florida condominium associations, HOAs, and apartment communities. It captures all architectural decisions made during the planning phase, identifies the features to be built, specifies the tools and technologies required, and flags common development pitfalls to avoid.

This started as a planning document and now includes in-flight execution progress updates. The design system (58 TSX component files, design tokens, and CSS) has been fully specified and is being ported into the production codebase.

### 1.1 Progress Update (2026-02-14): Schema Drift Eliminated

Schema drift between Drizzle schema/migrations and the shared demo Supabase database has been remediated via reset + migration replay. Verification completed in-session:

| Check | Result |
|----------|--------|
| Migrations applied | `5/5` |
| `user_role` enum | `7` canonical values, `0` legacy |
| `unit_id` on `user_roles` | Present |
| Migration `0004` tables (`announcement_delivery_log`, `demo_seed_registry`) | Both present |
| Legacy role rows (`admin`, `manager`, `resident`, `auditor`) | `0` |
| `pnpm seed:verify` | PASS |
| `pnpm --filter @propertypro/db test:integration` | PASS (`28/28`) |
| `pnpm exec vitest run --config apps/web/vitest.integration.config.ts` | PASS (`46/46`) |

Operational guardrails now in effect for shared environments:
- Run `pnpm --filter @propertypro/db db:migrate` before shared-env integration runs.
- Do not patch schema directly via ad-hoc SQL; use Drizzle migrations.
- If emergency SQL is unavoidable, perform same-day migration reconciliation.

### Key Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Build goal | Functional platform for live sales demos AND self-service signup | Sales strategy requires a real, interactive product to pitch with |
| Onboarding model | Both manual AND self-service from day one | Support inbound marketing leads while also doing hands-on pilot onboarding |
| Design system | Port custom design system (not shadcn/ui) | Brand consistency matters for demo credibility; tokens and components already designed |
| Mobile strategy | Interactive phone-frame preview in web app | Demonstrates mobile experience without native app development overhead |
| Project structure | Monorepo (Turborepo + pnpm workspaces) | Clean separation for future mobile app; shared types from the start |
| Database / Auth | Supabase (DB + Auth + Storage) + Drizzle ORM | Managed infrastructure with type-safe queries; avoid competing abstractions |
| Tenant isolation | Application-level first, RLS later | Simpler to debug; add RLS as security hardening once the app is stable |
| Community types | Condo (§718), HOA (§720), AND Apartment from day one | Platform must serve property managers who manage mixed portfolios |
| Team | Solo developer + AI assistance | Constrains scope and timeline expectations |
| Timeline | No hard deadline; build it right | Quality over speed; create internal milestones to prevent drift |
| Credential delivery | Email invitation → user sets own password | Supabase Auth inviteUserByEmail; no pre-generated passwords |
| File security | Magic-bytes validation on upload (no virus scanning) | Validates real file type regardless of extension; keeps complexity manageable |
| Announcements editor | Markdown textarea with toolbar buttons | Not a full rich-text editor; keeps bundle small and avoids contentEditable bugs |
| Document search | Full-content search from day one (PDF text extraction) | Users expect to search inside documents; half-measures frustrate users |

> **Critical Risk: Scope vs. Resources**
>
> A solo developer building a monorepo with self-service Stripe onboarding, multi-tenant architecture, a custom design system, four separate portals (public, owner, admin, PM), a compliance engine, document management, meeting tracking, announcements, maintenance requests, CSV import, email notifications, an interactive phone-frame mobile preview, full-content document search, AND full apartment community support is realistically a 3-4 month build. Internal milestones must be set and adhered to in order to prevent indefinite drift.

---

## 2. Technical Architecture

### 2.1 Tech Stack

| Layer | Technology | Why This Choice |
|-------|-----------|-----------------|
| Framework | Next.js 14+ (App Router) + TypeScript | Server components for data fetching, API routes for backend, mature ecosystem |
| Styling | Tailwind CSS + custom design tokens | Utility-first CSS mapped to the existing token system (spacing, colors, typography) |
| UI Components | Custom design system (ported from TSX) | 58 files already designed; Button, Card, Badge, Nav, Metrics, Progress, etc. |
| State (server) | TanStack Query (React Query) | Cache management, optimistic updates, request deduplication for API calls |
| State (client) | Zustand | Lightweight client state for UI concerns (modals, sidebar state, form drafts) |
| Database | PostgreSQL via Supabase | Managed hosting, automatic backups, connection pooling, no DevOps overhead |
| ORM | Drizzle ORM | Type-safe SQL, lighter than Prisma, no cold-start penalty on serverless, edge-compatible |
| Authentication | Supabase Auth | Email/password + magic links, session management, role metadata, built-in UI helpers |
| File Storage | Supabase Storage | Signed URLs for secure document access, integrated with Supabase Auth policies |
| Email | Resend | Transactional emails (meeting notices, welcome emails, compliance alerts), React Email templates |
| Payments | Stripe | Subscription billing for self-service signup; Checkout Sessions for the onboarding flow |
| Monorepo | Turborepo + pnpm workspaces | Build orchestration, shared packages, task caching |
| Deployment | Vercel | Zero-config Next.js hosting, preview deploys, edge functions, custom domains |
| Monitoring | Sentry | Error tracking, performance monitoring, release tracking |
| Search | PostgreSQL full-text search (`tsvector`) | No external search service needed; scales fine for this use case |
| Date handling | date-fns | Compliance deadline calculations, timezone conversions, date arithmetic |

### 2.2 Monorepo Structure

The project uses a monorepo managed by Turborepo and pnpm workspaces. Even though the native mobile app is deferred, the monorepo structure provides clean separation between the web application, shared packages, and future mobile app.

| Package | Path | Contents |
|---------|------|----------|
| Web Application | `apps/web/` | Next.js app with all four portals (public, owner, admin, PM), API routes, middleware |
| Design System | `packages/ui/` | Ported design tokens (CSS + TS), primitives (Box, Stack, Text), and all 12+ components |
| Shared Logic | `packages/shared/` | TypeScript types, Florida compliance constants, community type configs, validation schemas (Zod), utility functions |
| Database | `packages/db/` | Drizzle schema definitions, migration files, seed scripts, scoped query builder, search index helpers |
| Email Templates | `packages/email/` | React Email templates for all transactional emails |

> **Pitfall Warning: Monorepo Tooling Overhead**
>
> Turborepo configuration, pnpm workspace resolution, and cross-package TypeScript references add real setup time. Budget 1-2 days just for getting the monorepo scaffold working correctly with proper tsconfig paths, build ordering, and development hot-reload across packages. Do not underestimate this.

### 2.3 Multi-Tenancy Architecture

Every community is a tenant. All data is stored in a single PostgreSQL database with tenant isolation enforced at the application layer.

- Every database table includes a `community_id` foreign key (renamed from `association_id` to be community-type-agnostic)
- A `getTenantContext()` utility extracts the current community from the request (subdomain, session, or explicit parameter)
- A **scoped query builder** wraps every Drizzle query with `.where(eq(table.communityId, ctx.communityId))` automatically, also auto-appending `.where(isNull(table.deletedAt))` for soft-deleted tables
- Middleware validates tenant context on every API request before any data access
- Row-Level Security (RLS) policies will be added as a second layer of defense after the application logic is proven stable

> **Pitfall Warning: Silent Data Leaks**
>
> Application-level tenant isolation depends on developer discipline. Every single query must include the community_id filter. Missing it on even one endpoint means one tenant can see another tenant's data. Mitigation: the scoped Drizzle query builder automatically injects both the tenant filter and the soft-delete filter, making it impossible to forget either. Write integration tests that specifically verify cross-tenant data isolation on every endpoint.

### 2.4 Community Types

The platform supports three community types. Features are conditionally enabled based on community type.

| Community Type | Governing Law | Residents | Compliance Engine | Key Differentiators |
|---------------|--------------|-----------|-------------------|---------------------|
| `condo_718` | Florida Statute §718 | Owners + Renters (limited access) | Full statutory compliance | Document posting deadlines, meeting notice tracking, compliance checklist, public Notices page |
| `hoa_720` | Florida Statute §720 | Owners + Renters (limited access) | Full statutory compliance | Similar to condo but governed by Chapter 720; parcel-based instead of unit-based |
| `apartment` | Lease agreements (no statutory website mandate) | Tenants only (all residents are renters) | Not applicable | Lease document management, rent-focused communications, operational tooling only |

#### Feature Availability by Community Type

| Feature | Condo (§718) | HOA (§720) | Apartment |
|---------|:---:|:---:|:---:|
| **Compliance dashboard** | ✅ | ✅ | ❌ |
| **Statutory document categories** | ✅ | ✅ | ❌ |
| **Custom document categories** | ✅ | ✅ | ✅ |
| **Meeting management + notice tracking** | ✅ | ✅ | ❌ |
| **Public website with "Notices" page** | ✅ (required) | ✅ (required) | Optional |
| **Document library** | ✅ | ✅ | ✅ |
| **Full-content document search** | ✅ | ✅ | ✅ |
| **Announcements** | ✅ | ✅ | ✅ |
| **Maintenance requests** | ✅ | ✅ | ✅ |
| **Owner management** | ✅ | ✅ | ❌ |
| **Tenant/renter management** | ✅ (limited) | ✅ (limited) | ✅ (primary) |
| **Lease document tracking** | ❌ | ❌ | ✅ |
| **Unit/lease association** | ❌ | ❌ | ✅ |
| **CSV resident import** | ✅ | ✅ | ✅ |
| **Credential generation** | ✅ (statutory) | ✅ (statutory) | ✅ (operational) |
| **Phone-frame mobile preview** | ✅ | ✅ | ✅ |
| **PM portfolio dashboard** | ✅ | ✅ | ✅ |
| **White-label branding** | ✅ | ✅ | ✅ |
| **Email notifications** | ✅ | ✅ | ✅ |
| **Self-service signup** | ✅ | ✅ | ✅ |

> **Architectural Decision: Conditional Feature Rendering**
>
> The admin dashboard must adapt its layout based on community type. For condos/HOAs, the compliance dashboard is the hero screen with the traffic-light checklist. For apartments, the dashboard should emphasize operational metrics (open maintenance requests, occupancy, recent announcements). This is implemented via a feature flags system tied to `community_type`, not separate codepaths. Components check `community.type` and conditionally render relevant sections.

> **Devil's Advocate Note: Two-Front War**
>
> Adding apartment support puts the platform in direct competition with AppFolio, Buildium, Yardi Breeze, and RentManager for the apartment segment. These are established players with years of customers. The compliance engine is the differentiator for condos/HOAs — apartments don't have that advantage. The strategic justification is that PM customers who manage mixed portfolios (condos + apartments) prefer one platform. But if the apartment experience is mediocre compared to dedicated apartment tools, it weakens rather than strengthens the PM pitch.

### 2.5 Authentication & Authorization

Supabase Auth handles user authentication. Authorization (role-based access control) is enforced at the API layer.

| Role | Access Level | Available In | Portals |
|------|-------------|-------------|---------|
| `owner` | View all documents, submit maintenance requests, receive announcements, vote in elections | Condo, HOA | Owner Portal, Mobile Preview |
| `tenant` | View restricted documents (declaration, rules, inspection reports in condos; lease docs and rules in apartments), submit maintenance requests, receive announcements. **Cannot vote.** | Condo, HOA, Apartment | Resident Portal, Mobile Preview |
| `board_member` | Everything owner can do + admin dashboard, document uploads, meeting management | Condo, HOA | Owner Portal, Admin Dashboard |
| `board_president` | Everything board_member can do + user management, settings | Condo, HOA | Owner Portal, Admin Dashboard |
| `cam` | Full admin access to assigned community(s) | Condo, HOA | Owner Portal, Admin Dashboard |
| `property_manager_admin` | Portfolio view across multiple communities, white-label settings, full admin for all managed communities | Condo, HOA, Apartment | PM Dashboard, Admin Dashboard |
| `site_manager` | On-site admin for a single apartment community. Equivalent to `cam` for apartments. | Apartment | Resident Portal, Admin Dashboard |
| `platform_admin` | System-wide access (internal use only) | All | All Portals |

#### Tenant/Renter Access Rules by Community Type

| Document Type | Owner (Condo/HOA) | Tenant (Condo/HOA) | Tenant (Apartment) |
|--------------|:---:|:---:|:---:|
| Declaration / Governing docs | ✅ | ✅ | N/A |
| Bylaws | ✅ | ❌ | N/A |
| Rules & regulations | ✅ | ✅ | ✅ |
| Meeting minutes | ✅ | ❌ | N/A |
| Financial reports / budgets | ✅ | ❌ | N/A |
| Insurance policies | ✅ | ❌ | N/A |
| Inspection reports (SIRS) | ✅ | ✅ | N/A |
| Contracts / bids | ✅ | ❌ | N/A |
| Lease agreement | N/A | N/A | ✅ (own lease only) |
| Community rules / handbook | N/A | N/A | ✅ |
| Move-in/move-out docs | N/A | N/A | ✅ |
| Maintenance requests | ✅ (own) | ✅ (own) | ✅ (own) |
| Announcements | ✅ | ✅ | ✅ |

> **Pitfall Warning: Supabase Auth + Custom Roles**
>
> Supabase Auth stores user metadata (including role) in the auth.users table, but your application roles are more complex (role per community, not per user globally). A user could be an owner in one condo and a tenant in an apartment building managed by the same PM. Store role mappings in a separate `user_roles` table with `(user_id, community_id, role)` and query it in middleware. Do not rely solely on Supabase Auth metadata for authorization.

### 2.6 Auth Flows

The following auth flows must be implemented. Each one touches Supabase Auth, the database, email delivery, and the UI.

#### 2.6.1 Invitation-Based Credential Delivery

This is the primary way residents get accounts. Admins do not pre-generate passwords.

1. Admin adds a resident (manually or via CSV import) with name, email, unit number, and role
2. API calls `supabase.auth.admin.inviteUserByEmail(email)` which sends a Supabase-managed invitation email
3. The email contains a magic link pointing to a `/auth/accept-invite` route
4. When the user clicks the link, Supabase Auth creates a session. The UI presents a "Set Your Password" form
5. The user sets a password via `supabase.auth.updateUser({ password })`. The account is now active
6. The `user_roles` record (created in step 1) links the user to their community with the correct role

> **Pitfall Warning: Supabase Invite Email Customization**
>
> Supabase's default invitation email is generic and doesn't mention the community name. Customize the email template in Supabase Dashboard → Auth → Email Templates. Reference the community name via the `user_metadata` field (set it when calling `inviteUserByEmail`). If Supabase's email customization is too limited, send the invite via Resend instead and use `supabase.auth.admin.generateLink({ type: 'invite' })` to get the magic link URL to embed in your custom email.

#### 2.6.2 Password Reset

1. User clicks "Forgot Password" on the login page
2. UI calls `supabase.auth.resetPasswordForEmail(email, { redirectTo })`. Supabase sends a reset email.
3. User clicks the link, arrives at `/auth/reset-password` with a valid session token
4. UI presents a "New Password" form. Calls `supabase.auth.updateUser({ password })`
5. User is redirected to the portal dashboard

#### 2.6.3 Email Verification

Supabase Auth handles email verification automatically when `emailConfirmation` is enabled. When a user signs up (self-service) or is invited, Supabase sends a confirmation email. The `email_verified` flag in the Supabase auth.users table is set to `true` when the user clicks the link. Middleware should check `email_verified` and redirect unverified users to a "Check your email" page.

#### 2.6.4 Session Management

- Supabase Auth uses JWTs stored in httpOnly cookies (via `@supabase/ssr`)
- JWT refresh is handled automatically by the Supabase client. Default expiry is 1 hour, refresh token is 7 days.
- Server Components access the session via the `createServerClient` helper from `@supabase/ssr`
- Client Components access the session via the `createBrowserClient` helper
- Middleware checks for a valid session on every protected route and redirects to `/login` if absent
- **Multi-tab auth state**: Use `onAuthStateChange()` listener in the root client layout to sync auth state across browser tabs. When a user logs out in one tab, all tabs should redirect to login.

#### 2.6.5 Self-Service Signup Auth

For users who sign up via the self-service flow (Section 5):

1. User fills out the signup form (name, email, password, community details)
2. API creates the user via `supabase.auth.signUp({ email, password })`
3. Supabase sends a confirmation email
4. After email confirmation, the Stripe checkout session is initiated
5. On payment success, the provisioning pipeline creates the community and assigns the `board_president` or `site_manager` role

---

## 3. Features by Portal

The application has four distinct portals, each serving a different user type. All portals share the same codebase and design system but differ in layout, navigation, and available features.

### 3.1 Public-Facing Community Website (No Auth Required)

Each community gets a public website at their subdomain (e.g., `palmgardens.propertyprofl.com`). For condos/HOAs, this satisfies the statutory requirement for a website "accessible through the internet." For apartments, this is optional but available as a community landing page.

| Feature | Condo/HOA | Apartment | Implementation Notes |
|---------|:---------:|:---------:|---------------------|
| Home page | Required | Optional | Community name, logo, address, contact info, community photo |
| Notices page | Required (statutory) | N/A | Prominently linked from home page; auto-populated from meeting data |
| Login portal link | Required | Optional | Redirects to authenticated resident portal |
| Contact information | Best practice | Optional | Board contact / management company / leasing office contact |
| SEO metadata | Best practice | Best practice | Proper meta tags, Open Graph, structured data for discoverability |
| 404 / Error pages | Required | Required | Branded error pages; must not leak tenant context from other communities |
| Terms of Service page | Required | Required | Link from signup form and footer. See Section 12 for legal disclaimers. |
| Privacy Policy page | Required | Required | Required for compliance and app store submissions (future mobile app) |

> **Pitfall Warning: Subdomain Routing on Vercel**
>
> Vercel supports wildcard subdomains, but the configuration is non-trivial. You need middleware to extract the subdomain from the hostname, look up the community, and set the tenant context. Custom domains add another layer (DNS CNAME + SSL certificate provisioning). Build subdomain routing first, defer custom domains to a later phase.

### 3.2 Resident Portal (Authenticated — Owners + Tenants)

This portal serves both owners (condo/HOA) and tenants (all community types). The feature set adapts based on the user's role and community type.

| Feature | Priority | Community Types | Description |
|---------|----------|----------------|-------------|
| Dashboard | P0 — Must Have | All | Welcome message, recent announcements (pinned first), upcoming meetings with countdown (condo/HOA only), quick links to documents |
| Document library | P0 — Must Have | All | Browse by category, **full-content search**, in-browser PDF viewer, download option. **Content filtered by role** (tenants see restricted set in condos; full community docs in apartments) |
| Meeting list | P0 — Must Have | Condo, HOA | Upcoming and past meetings, each showing date, type, location, agenda, minutes, video recording link |
| Announcements feed | P0 — Must Have | All | Chronological feed of community announcements, pinned items at top. Rendered from markdown. |
| Maintenance requests | P1 — Should Have | All | Submit new request (title, description, category, photos), track status, comment thread |
| Lease documents | P1 — Should Have | Apartment | View own lease agreement, move-in/move-out documents, renewal notices |
| Profile / Settings | P1 — Should Have | All | Update email, phone, notification preferences (see Section 6.3), change password |
| Directory | P2 — Nice to Have | All | Board member names/roles (condo/HOA), management contacts, leasing office (apartment), emergency contacts (privacy-controlled) |

### 3.3 Admin Dashboard (Board Members + CAMs + Site Managers)

This is where the product's core value lives. For condos/HOAs, the compliance dashboard is the key screen. For apartments, the operational dashboard replaces it.

| Feature | Priority | Community Types | Description |
|---------|----------|----------------|-------------|
| **Compliance dashboard** | P0 — Must Have | Condo, HOA | Visual checklist organized by statute section. Traffic-light status (green/yellow/red). Overall compliance score percentage. Click any item to upload the required document. 30-day posting deadline tracking. Exportable PDF compliance report. |
| **Operational dashboard** | P0 — Must Have | Apartment | Open maintenance requests, occupancy metrics, recent announcements, upcoming lease expirations, quick actions. This is the apartment equivalent of the compliance dashboard. |
| Document management | P0 — Must Have | All | Drag-and-drop upload, multi-file, assign to category (statutory for condos, configurable for apartments), set effective/expiration dates, version control, bulk upload. 50MB file limit, PDF/DOC/XLS/image support. **File type validated via magic bytes on upload.** |
| Resident management | P0 — Must Have | All | Add/edit/remove residents (owners AND tenants). Assign unit numbers. **Send email invitation** (user sets own password). CSV bulk import. Track login activity. **For condos:** differentiate owners vs. renters and enforce access levels. **For apartments:** all residents are tenants, associate with unit + lease. |
| Meeting management | P0 — Must Have | Condo, HOA | Create meeting with type/date/location/virtual link, attach agenda, system auto-calculates notice deadline and warns if not met, upload approved minutes, track 12-month rolling window. |
| Announcement composer | P0 — Must Have | All | **Markdown textarea with toolbar buttons** (bold, italic, link, list). Option to send email blast, schedule for future publication, target audience selection (all, owners only, board only, tenants only). |
| Maintenance request mgmt | P1 — Should Have | All | Inbox of all requests, assign to staff/board member or vendor, update status, internal notes, resolution tracking. |
| Lease tracking | P1 — Should Have | Apartment | Track lease terms per unit (start date, end date, monthly rent, renewal status). Alert before lease expirations. Associate tenants with lease records. |
| Contract / vendor tracking | P1 — Should Have | Condo, HOA | List of executory contracts (statutory requirement), expiration alerts, bid tracking (visible only after bidding closes), conflict-of-interest flagging. |
| **Audit trail viewer** | P1 — Should Have | Condo, HOA | Read-only view of `compliance_audit_log` entries. Filterable by action type and date range. Exportable for board records. |
| Community settings | P1 — Should Have | All | Profile (name, address, logo, colors, **timezone**), subscription management, user role management, feature toggles, community type configuration. |
| **Data export** | P2 — Nice to Have | All | Export community data as CSV/ZIP (residents, documents list, maintenance requests). Required for communities that want to switch providers. |

> **Pitfall Warning: Compliance Deadline Calculations**
>
> The compliance engine is the most complex business logic in the application. The 30-day document posting rule, 14-day / 48-hour meeting notice rules, and rolling 12-month windows for minutes and recordings all require careful date arithmetic with timezone awareness (Florida is split between Eastern and Central time). Use `date-fns` for all date arithmetic. Store all dates as UTC in the database. Convert to the community's timezone (stored in `communities.timezone`) at the presentation layer only. Write comprehensive unit tests for every deadline calculation before building the UI. Edge cases: daylight saving transitions, documents received on weekends/holidays, leap years.

### 3.4 Property Manager Dashboard (Super-Admin)

This dashboard serves property management companies who manage mixed portfolios of condos, HOAs, and apartment buildings.

| Feature | Priority | Description |
|---------|----------|-------------|
| Portfolio overview | P0 — Must Have | Grid/list of all managed communities with compliance status (condo/HOA) or operational metrics (apartment), total units, open maintenance requests, alert badges. **Community type badge** on each card (Condo / HOA / Apartment). |
| Community switcher | P0 — Must Have | Switch between communities to access each one's full admin dashboard. Dashboard adapts to community type automatically. |
| Portfolio filters | P1 — Should Have | Filter communities by type (condo, HOA, apartment), compliance status, alert level. |
| White-label branding | P1 — Should Have | Upload PM company logo, set colors, custom email templates with company branding |
| Bulk operations | P2 — Nice to Have | Send announcement to all communities (or filtered subset), generate cross-portfolio compliance reports |
| Billing management | P2 — Nice to Have | Manage subscription billing for all managed communities from one view |

---

## 4. Interactive Phone-Frame Mobile Preview

Instead of building a native React Native app for the initial launch, the platform will include an interactive phone-frame preview embedded within the web application. This serves as both a sales demo tool and a feature showcase.

### 4.1 What It Is

A responsive web view rendered inside a realistic phone-shaped frame (iPhone or Android device bezel). The content inside the frame is a fully interactive, scrollable, clickable subset of the resident portal, styled with mobile-specific CSS to simulate a native app experience.

### 4.2 Technical Approach

| Component | Implementation | Notes |
|-----------|---------------|-------|
| Phone frame | CSS/SVG device mockup (iPhone 15 dimensions: 393x852 CSS pixels) | Use a device frame library or custom SVG. Frame is purely decorative. |
| Content viewport | An iframe or contained div with overflow:hidden, fixed dimensions matching the phone screen | The iframe approach provides true isolation; the div approach is simpler but shares styles. |
| Mobile layout | Separate Next.js layout for `/mobile/*` routes with mobile-specific navigation (bottom tab bar, no sidebar) | These routes render the same data/components but with a compact, touch-optimized layout. |
| Interactivity | User can scroll, tap buttons, navigate between screens inside the frame | Use real route transitions within the iframe for authentic feel. |
| Demo screens | Home/Dashboard, Documents, Meetings (condo/HOA), Announcements, Maintenance, Profile | Mirror the resident portal features with mobile-optimized UI. Adapts based on community type. |
| Placement | Embedded in the marketing/sales pages and optionally in the admin dashboard as a preview tool | Admin can see "what residents will see" in the phone frame while configuring settings. |

> **Pitfall Warning: iframe Sandboxing**
>
> If using an iframe for the phone frame, authentication tokens won't be shared across origins. Use same-origin iframe (e.g., `/mobile/*` routes within the same app) to avoid CORS and auth headaches. Also beware of iframe performance on lower-end devices — the embedded view adds a full rendering context.

> **Design Consideration**
>
> The phone frame preview is a marketing/demo tool first. Do not over-invest in making it pixel-perfect at launch. A clean, functional mobile-styled view inside a device frame is sufficient to demonstrate the concept. The actual native app (React Native + Expo) should be built later when paying customers validate demand for push notifications and App Store presence.

---

## 5. Self-Service Onboarding Flow

Despite the recommendation to defer this, self-service onboarding is included in the initial build. This is the most complex feature pipeline in the application and the highest risk for timeline overrun.

### 5.1 Marketing / Landing Page

The self-service flow requires a marketing landing page. This is the entry point for inbound leads who discover the product online.

- Route: `/` (root) or a separate marketing subdomain (`www.propertyprofl.com`)
- Content: Value proposition, feature highlights, pricing tiers (adapted by community type), screenshots/phone-frame demo, CTA button ("Get Started")
- Legal: Link to Terms of Service and Privacy Policy in the footer (see Section 12)
- SEO: Proper meta tags, Open Graph, structured data for Florida-specific keywords

### 5.2 Signup Pipeline

1. Prospect visits marketing landing page and clicks "Get Started"
2. Signup form collects: community name, address, county, unit count, **community type** (Condo §718 / HOA §720 / Apartment), primary contact name and email
3. **Plan selection adapts to community type:** condos/HOAs see compliance-focused tiers ($99/mo Compliance Basic, $199/mo Compliance + Mobile); apartments see operational tiers (pricing TBD — likely $49-99/mo based on unit count)
4. Stripe Checkout Session is created for the selected plan
5. On successful payment, a Stripe webhook fires and triggers automated provisioning
6. Provisioning creates: community record in database, admin user account (via `supabase.auth.admin.createUser`), subdomain, **compliance checklist auto-generated based on community type** (condo/HOA only; apartments skip this step)
7. Welcome email is sent via Resend with login credentials and onboarding instructions
8. Admin logs in and is presented with a guided onboarding wizard **tailored to community type:** condos/HOAs get a statutory document upload wizard; apartments get a community setup wizard (unit roster, rules document, lease template upload)
9. Public website (if applicable) and resident portal go live

> **Pitfall Warning: Stripe Webhook Reliability**
>
> Stripe webhooks can fail, be delayed, or arrive out of order. The provisioning pipeline must be idempotent (safe to run multiple times for the same event) and must handle webhook retries gracefully. Always verify webhook signatures. Build a manual "retry provisioning" button in the platform admin panel for when things go wrong.

> **Pitfall Warning: Subdomain Provisioning**
>
> Automated subdomain creation requires DNS wildcard configuration and Vercel project settings. The subdomain must be validated (no special characters, not already taken, not a reserved word like 'admin', 'api', 'www', 'mobile', 'pm'). Build a subdomain availability checker into the signup form.

---

## 6. Database Schema Overview

The database schema is defined using Drizzle ORM and deployed to Supabase's managed PostgreSQL. Every table includes `community_id` for tenant isolation, plus `created_at` and `updated_at` timestamps. Soft-delete via `deleted_at` is used where appropriate (filtered automatically by the scoped query builder).

### 6.1 Core Tables

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `communities` | Tenant root. Replaces `associations`. Name, address, **community_type** (condo_718, hoa_720, apartment), subdomain, subscription, branding, **timezone** (default `America/New_York`). | Has many: users, documents, meetings, announcements |
| `property_managers` | PM company. Sits above communities. | Has many: communities |
| `users` | All user accounts. Email, password hash, profile info. | Belongs to: community (via user_roles). Has many: documents (uploaded), maintenance_requests |
| `user_roles` | **Role per community.** A single user can have different roles in different communities (e.g., owner in a condo, tenant in an apartment managed by the same PM). Fields: `user_id`, `community_id`, `role`, **`unit_id`** (FK to units table), `is_primary`. | Belongs to: user, community, unit |
| `units` | Individual units/apartments within a community. Number, floor, bedrooms, bathrooms, square footage, status (occupied/vacant), **parking_spaces** (text, nullable), **storage_unit** (text, nullable), **voting_share** (decimal, condo/HOA only), **rent_amount** (decimal, apartment only), **availability_date** (date, apartment only). | Belongs to: community. Has many: user_roles (residents), leases (apartments) |
| `leases` | **Apartment-only.** Tracks lease terms per unit. Start date, end date, monthly rent, renewal status, security deposit. | Belongs to: community, unit. Links to: tenant (user_role) |
| `document_categories` | Document categories. **Statutory categories auto-created for condos/HOAs; custom categories for apartments.** Retention rules and access levels. | Belongs to: community. Has many: documents |
| `documents` | Uploaded files. Title, S3 URL, file_name, file_size, file_type, version, compliance status (condo/HOA), posting deadline, **search_text** (extracted text content for full-text search), **search_vector** (`tsvector`, PostgreSQL generated column). | Belongs to: community, category, uploaded_by user |
| `meetings` | **Condo/HOA only.** Board/owner/committee meetings with notice tracking. | Belongs to: community. Has: agenda document, minutes document |
| `meeting_documents` | Documents attached to meetings (for owner vote requirements). | Belongs to: meeting, document |
| `announcements` | Community announcements. Body stored as **markdown**. Publish/email/push options. | Belongs to: community, author user |
| `maintenance_requests` | Submitted by residents with category, priority, status tracking. | Belongs to: community, submitted_by user, assigned_to user |
| `maintenance_request_images` | Photos attached to maintenance requests. **Thumbnails auto-generated on upload** (see Section 7.2). | Belongs to: maintenance_request |
| `maintenance_request_comments` | Comment thread on maintenance requests. | Belongs to: maintenance_request, author user |
| `compliance_checklist_items` | **Condo/HOA only.** Per-community checklist tracking which statutory requirements are satisfied. | Belongs to: community. Links to: document (if satisfied by upload) |
| `compliance_audit_log` | Immutable log of all compliance-relevant actions. **Never soft-deleted.** | Belongs to: community |
| `contracts` | Executory contracts and vendor relationships. | Belongs to: community. Links to: document |
| `bids` | Bids received (only visible after bidding closes). | Belongs to: community. Links to: document |
| `notification_preferences` | Per-user notification settings. Columns: `user_id`, `community_id`, `email_announcements` (boolean), `email_maintenance_updates` (boolean), `email_meeting_notices` (boolean), `email_compliance_alerts` (boolean, admin only). All default to `true`. | Belongs to: user, community |

### 6.2 Key Schema Changes from Original Spec

| Change | Reason |
|--------|--------|
| `associations` → `communities` | Generic term that covers condos, HOAs, and apartments |
| `association_id` → `community_id` on all tables | Consistent with renamed tenant root |
| Added `community_type` enum: `condo_718`, `hoa_720`, `apartment` | Drives conditional feature rendering |
| Added `timezone` to `communities` | Compliance deadline calculations must use the community's local time, not UTC |
| Added `units` table with expanded fields | Apartments need unit tracking for lease association; condos benefit from unit-level data. Includes parking, storage, voting share (condo), rent amount and availability (apartment). |
| Added `leases` table | Apartment-specific: tracks lease terms, expiration, renewal |
| Added `user_roles` as separate table (not just a column on `users`) | A user can have different roles in different communities. Critical for PM customers whose staff interacts with multiple community types. |
| Changed `user_roles.unit_number` → `user_roles.unit_id` | FK to units table instead of free-text field. Prevents orphaned/mismatched unit references. |
| Added `site_manager` role | Apartment equivalent of `cam`. On-site property staff who manage a single apartment community. |
| Added `tenant` role | Distinct from `owner`. Restricted document access in condos (per statute), full resident access in apartments. |
| Added `search_text` and `search_vector` to `documents` | Full-content document search requires extracted text and a PostgreSQL `tsvector` index |
| Added `notification_preferences` table | Users need per-community control over which emails they receive. Required for CAN-SPAM compliance. |

### 6.3 Notification Preferences

Every user gets a `notification_preferences` record per community with these defaults:

| Preference | Default | Who Sees It |
|------------|---------|-------------|
| `email_announcements` | `true` | All residents |
| `email_maintenance_updates` | `true` | All residents |
| `email_meeting_notices` | `true` | Condo/HOA residents only |
| `email_compliance_alerts` | `true` | Admin roles only (board, CAM, site_manager) |

The notification preferences record is created automatically when a `user_role` is created (invitation accepted or admin adds a resident). The Profile/Settings page in the resident portal allows users to toggle these preferences. Email-sending logic must check the relevant preference before sending. The one exception: password reset and invitation emails are always sent regardless of preferences.

### 6.4 Audit Logging Strategy

The `compliance_audit_log` table serves as an immutable record of all actions relevant to compliance and security. It is a cross-cutting concern — events are logged from multiple parts of the application.

**What gets logged:**

| Action | Trigger | Metadata |
|--------|---------|----------|
| `document_uploaded` | Document created or new version uploaded | document_id, category, uploaded_by |
| `document_deleted` | Document soft-deleted | document_id, deleted_by |
| `document_expired` | Document expiration date passed (background job) | document_id, expiration_date |
| `meeting_notice_posted` | Meeting notice published to public site | meeting_id, posted_at, deadline, on_time (boolean) |
| `meeting_minutes_approved` | Minutes marked as approved | meeting_id, approved_by |
| `user_invited` | Resident invitation sent | user_email, role, invited_by |
| `user_role_changed` | Role modified (e.g., owner → board_member) | user_id, old_role, new_role, changed_by |
| `user_removed` | User removed from community | user_id, removed_by |
| `compliance_item_satisfied` | Checklist item marked as satisfied | checklist_item_id, document_id |
| `compliance_item_overdue` | Checklist item became overdue (background job) | checklist_item_id, due_date |
| `login_success` | User logged in | user_id, ip_address |
| `login_failure` | Failed login attempt | email, ip_address |
| `settings_changed` | Community settings modified | field_changed, old_value, new_value, changed_by |

**Implementation:** Create a `logAuditEvent(communityId, action, performedBy, metadata)` utility function in `packages/db`. Call it from API route handlers after successful mutations. The audit log is append-only — no updates, no deletes, no soft-delete. The `compliance_audit_log` table is excluded from the scoped query builder's soft-delete filter.

> **Pitfall Warning: Migration Strategy**
>
> Drizzle Kit handles schema migrations. Never modify the production database schema manually. Always generate migrations from schema changes and test them against a staging database before applying to production. Supabase's built-in migration tools conflict with Drizzle — use Drizzle's migration system exclusively and disable Supabase's migration UI.

---

## 7. Infrastructure & Cross-Cutting Concerns

These are the systems that aren't tied to a specific feature but affect the entire application. Missing any of them leads to the kind of debugging that wastes days.

### 7.1 File Upload & Validation Pipeline

All file uploads (documents, maintenance request photos, community logos) follow the same pipeline:

1. **Client-side validation**: Check file size (50MB max for documents, 10MB max for images) and extension against an allowlist
2. **Request a presigned upload URL** from the API (`POST /api/v1/upload/presign`). The API validates the user's permissions and returns a Supabase Storage presigned URL.
3. **Client uploads directly to Supabase Storage** using the presigned URL. This bypasses Vercel's 4.5MB request body limit.
4. **Client notifies the API** that the upload is complete (`POST /api/v1/documents` or similar) with the storage path
5. **Server-side validation**: The API reads the first bytes of the uploaded file from Supabase Storage and validates the file type using **magic bytes** (file signature). This catches users who rename `.exe` files to `.pdf`.

**Allowed file types:**

| Category | Extensions | Magic Bytes |
|----------|-----------|-------------|
| Documents | .pdf, .doc, .docx, .xls, .xlsx | `%PDF`, `PK` (ZIP-based Office), `D0 CF 11 E0` (old Office) |
| Images | .jpg, .jpeg, .png, .gif, .webp | `FF D8 FF` (JPEG), `89 50 4E 47` (PNG), `47 49 46` (GIF), `52 49 46 46` (WebP) |
| Video links | URL string only (YouTube, Vimeo, Zoom) | N/A — stored as text, not uploaded |

**If validation fails:** The file is deleted from Supabase Storage, and the API returns a 422 error with a clear message ("File type not allowed. Please upload a PDF, Word, Excel, or image file.").

> **Pitfall Warning: Magic Bytes Library**
>
> Use the `file-type` npm package to detect file types from buffers. It reads the file header bytes and returns the MIME type. Do not rely on the `Content-Type` header from the upload — browsers set it based on file extension, which can be spoofed.

### 7.2 Image Optimization

Community logos and maintenance request photos need optimization:

- **Logos**: Resized to max 400x400px, converted to WebP, stored alongside original. Used in public website header, email templates, mobile preview.
- **Maintenance photos**: Thumbnails generated at 300px width for list views, original preserved for detail views.
- **Implementation**: Use `sharp` (Node.js image processing library) in an API route or edge function. Process after upload, store optimized versions in a separate Supabase Storage folder (`/optimized/`).

### 7.3 Full-Content Document Search

Users can search across all documents in their community, including inside PDF content.

#### Text Extraction Pipeline

1. When a document is uploaded, a background process extracts text content
2. **For digital PDFs** (text-based): Use `pdf-parse` to extract all text content
3. **For scanned PDFs** (image-based): `pdf-parse` returns empty or near-empty text. Flag the document as `search_text = '[Scanned document — not searchable]'` and surface a note in the UI. Do NOT attempt OCR in v1 — it's a significant infrastructure addition.
4. **For Office documents** (.docx, .xlsx): Use `mammoth` (docx → text) and basic text extraction for spreadsheets. Or defer Office content extraction to v2 and only index the filename + title.
5. Extracted text is stored in the `documents.search_text` column
6. A PostgreSQL generated column `search_vector` converts `search_text` to a `tsvector` for efficient full-text search

#### Search Query

```sql
-- Drizzle equivalent of:
SELECT * FROM documents
WHERE community_id = :communityId
  AND search_vector @@ plainto_tsquery('english', :query)
ORDER BY ts_rank(search_vector, plainto_tsquery('english', :query)) DESC
LIMIT 20;
```

The search API endpoint also searches document titles and descriptions as a fallback, unioned with content search results.

> **Pitfall Warning: pdf-parse and Serverless**
>
> `pdf-parse` loads the entire PDF into memory to extract text. For a 50MB PDF, this means 50MB+ of memory usage. Vercel serverless functions have memory limits (default 1024MB, max 3008MB on Pro). For very large PDFs, text extraction should happen asynchronously (queue the job, process in background) rather than in the upload request handler. Consider using a separate Vercel function with higher memory allocation for the extraction worker.

### 7.4 Pagination Strategy

All list endpoints use **cursor-based pagination** (not offset-based). This is more efficient for large datasets and avoids the "missing/duplicate items" problem when new records are added between page loads.

- Default page size: 20 items
- Cursor: the `id` (UUID) of the last item on the current page
- API response includes: `items`, `nextCursor` (null if no more pages), `hasMore` (boolean)
- The UI uses TanStack Query's `useInfiniteQuery` hook for automatic "load more" behavior
- **Exception**: The compliance checklist is always loaded in full (no pagination) since it's a bounded list

### 7.5 Rate Limiting

Protect API endpoints from abuse:

- **Strategy**: Use Vercel's Edge Middleware with a simple in-memory rate limiter for development, and `@upstash/ratelimit` with Redis for production
- **Limits**: 100 requests/minute for authenticated endpoints, 20 requests/minute for unauthenticated (login, signup, password reset)
- **Response**: 429 Too Many Requests with `Retry-After` header
- **File uploads**: Separate limit of 10 uploads/minute per user

### 7.6 Structured Logging

Application logs must be queryable for debugging production issues.

- **Library**: Use Vercel's built-in logging (for serverless functions) + Sentry for errors
- **Format**: JSON structured logs with consistent fields: `timestamp`, `level`, `message`, `communityId`, `userId`, `requestId`, `action`
- **Sensitive data**: Never log passwords, tokens, file contents, or PII (emails are logged only in audit events, never in general logs)
- **Request ID**: Generate a UUID per request in middleware, include in all logs for that request, return in the `X-Request-ID` response header for support debugging

### 7.7 Error Handling Strategy

Consistent error handling across the entire application:

#### API Layer
- All API routes wrapped in a `withErrorHandler` utility that catches exceptions and returns consistent JSON error responses: `{ error: { code: string, message: string, details?: any } }`
- Known errors (validation failure, unauthorized, not found) return appropriate HTTP status codes with user-friendly messages
- Unknown errors return 500 with a generic message; the actual error is logged to Sentry with the request ID

#### UI Layer
- React Error Boundaries at the portal layout level (one per portal) catch rendering crashes and show a "Something went wrong" fallback with a "Try Again" button
- API errors surfaced via toast notifications (use a simple toast component from the design system or build a minimal one)
- Form validation errors shown inline next to the relevant field (Zod validation on both client and server)
- Network errors (offline, timeout) shown as a banner with a retry option

### 7.8 Email Deliverability Setup

Transactional emails (invitations, meeting notices, compliance alerts) are useless if they land in spam.

- **Sending domain**: Configure a dedicated sending domain (e.g., `mail.propertyprofl.com`) in Resend
- **DNS records**: Set up SPF, DKIM, and DMARC records in Cloudflare DNS. Resend provides the exact records to add.
- **From address**: Use a consistent, professional from address (e.g., `notifications@propertyprofl.com` or per-community addresses like `palmgardens@propertyprofl.com`)
- **Verify before launch**: Send test emails to Gmail, Outlook, and Yahoo and verify they don't land in spam
- **Unsubscribe header**: Include the `List-Unsubscribe` header in all non-critical emails (required by CAN-SPAM and Gmail's 2024 sender requirements). The unsubscribe link points to the notification preferences page.

### 7.9 Demo Reset Script

The demo instances (Palm Gardens condo, Sunset Ridge apartment) must reset to a known good state nightly so sales demos always work.

- **Implementation**: A Node.js script in `scripts/seed-demo.ts` that:
  1. Deletes all data in the demo communities (CASCADE or targeted deletes)
  2. Re-seeds with the predefined demo data (documents, meetings, announcements, maintenance requests, users)
  3. Resets demo user passwords to known values
- **Trigger**: Scheduled via Vercel Cron Jobs (`vercel.json` cron config) or GitHub Actions scheduled workflow, running at 3:00 AM ET daily
- **Demo credentials**: Board admin, unit owner, and property manager accounts with known passwords (documented in internal wiki, never in the codebase)

---

## 8. Recommended Build Order

The build order is designed to produce a demo-ready product as early as possible, then layer on self-service, apartment support, and polish. Each phase builds on the previous one and produces a usable artifact.

### Phase 0: Scaffold & Foundation (Days 1–5)

- Initialize monorepo with Turborepo + pnpm workspaces
- Set up Next.js app in `apps/web/` with TypeScript and Tailwind CSS
- Create `packages/ui/` and port design tokens (CSS variables + TypeScript constants)
- Port core primitives: Box, Stack, Text (3 components)
- Port highest-priority components: Button, Card, Badge, NavRail/Tabs (4 components)
- Set up Supabase project (database, auth, storage)
- Define Drizzle schema for core tables (`communities`, `users`, `user_roles`, `units`, `documents`, `document_categories`, `notification_preferences`)
- Include `community_type` enum from the start so the schema supports all three types
- Run initial migration, verify schema
- Configure Supabase Auth with email/password provider
- Build the scoped query builder with automatic `community_id` filtering and `deleted_at` handling
- Set up environment variables and local development workflow
- Create the `withErrorHandler` API wrapper and basic Error Boundary
- Set up Sentry (even in Phase 0 — catch errors from day one)

**Deliverable:** Empty app that builds, design system renders, database schema exists, auth login works, error handling in place.

### Phase 1: Compliance Core — The Demo Seller (Days 6–25)

- Build the compliance dashboard (THE key screen — this is what sells the product for condos/HOAs)
- Implement compliance checklist engine: auto-generate checklist from community type, calculate statuses
- Build document management: upload (with presigned URL flow), categorize, version control, in-browser PDF viewer, **magic bytes validation**, **text extraction for search**
- Implement full-content document search (PostgreSQL `tsvector` + search UI)
- Build meeting management: create meeting, attach agenda, auto-calculate notice deadlines
- Build announcement system: compose (markdown textarea + toolbar), publish, target audience
- Build resident management: CRUD for owners AND tenants, CSV import, **invitation-based credential delivery** (Supabase `inviteUserByEmail`), **role assignment per community**
- Build auth flows: login, **password reset**, **email verification redirect**, **set password on invite accept**
- Build the public-facing community website (home page + Notices page + login link + **404 page**)
- Build the resident portal dashboard (announcements, upcoming meetings, document links)
- Build the resident document library (browse by category, search, PDF viewer) **with role-based filtering** (tenants see restricted set)
- Build the resident profile/settings page with **notification preferences**
- Port remaining design system components as needed (Metrics, Progress, DataRow, Alert, etc.)
- Build the `logAuditEvent` utility and wire it into all mutation endpoints
- Set up Resend for email delivery + **configure SPF/DKIM/DMARC**
- Create seed script with Palm Gardens demo data (condo type)

**Deliverable:** Fully functional single-tenant condo demo with search, auth flows, and audit logging. You can walk a prospect through every screen with realistic data.

> **Critical Milestone**
>
> At the end of Phase 1, you should be able to sit down with a prospect and demo the entire compliance workflow: show them the public website, log in as an owner, browse documents, search for a specific document by content, then switch to the admin view and show the compliance dashboard with green/yellow/red statuses. If this doesn't impress them, nothing else you build will matter.

### Phase 2: Multi-Tenancy, Self-Service & Apartment Support (Days 26–45)

- Implement subdomain routing middleware (extract tenant from hostname)
- Build the marketing/landing page with **Terms of Service** and **Privacy Policy** pages
- Build the self-service signup flow: marketing page, signup form, **community type selection**, plan selection
- Integrate Stripe: Checkout Sessions, webhook handler (idempotent), subscription management
- Build automated provisioning pipeline (create community + admin user + subdomain + checklist on payment)
- **Build apartment community type support:**
  - Operational dashboard (replaces compliance dashboard for apartments)
  - Configurable document categories (non-statutory)
  - Lease tracking: unit-lease-tenant association, expiration alerts
  - Onboarding wizard adapted for apartments (community setup, unit roster, rules upload)
  - `site_manager` role with appropriate permissions
- Build the guided onboarding wizard (branched by community type)
- Implement email notifications via Resend: welcome email, meeting notices (condo/HOA), compliance alerts (condo/HOA), general notifications (all). **Check notification preferences before sending.**
- Build manual onboarding flow for admin: create new community from admin panel
- Implement rate limiting on all API endpoints
- Test multi-tenant isolation thoroughly (cross-tenant data access tests)
- Create seed script for apartment demo data (e.g., "Sunset Ridge Apartments")

**Deliverable:** A prospect can sign up, pay, and have their portal live — for either a condo or an apartment. You can also onboard clients manually. Two demo instances available: Palm Gardens (condo) and Sunset Ridge (apartment).

### Phase 3: PM Dashboard & Mobile Preview (Days 46–60)

- Build Property Manager dashboard: portfolio overview with **community type badges**, community switcher
- Ensure PM dashboard correctly shows compliance status for condos/HOAs and operational metrics for apartments
- Build white-label branding settings (logo, colors, email templates)
- Build the interactive phone-frame mobile preview (iframe-based, `/mobile/*` routes)
- Build mobile-optimized layouts: bottom tab navigation, compact cards, touch-sized targets
- **Mobile preview adapts to community type** (shows meetings for condos, lease info for apartments)
- Build maintenance request submission and tracking (owner-facing and tenant-facing)
- Build maintenance request management (admin-facing)
- Build contract and vendor tracking (condo/HOA)
- Build the audit trail viewer (admin dashboard, filterable, exportable)
- Performance optimization pass (Core Web Vitals)

**Deliverable:** Complete platform with PM dashboard showing mixed portfolio, mobile preview, and all core features operational across all community types.

### Phase 4: Hardening & Launch Prep (Days 61–75)

- Add Row-Level Security policies to PostgreSQL as defense-in-depth
- Security audit: CORS, CSRF, input validation, file upload sanitization, presigned URL expiry
- **Role-based access control audit:** verify tenants cannot see restricted documents in condos, owners cannot access other communities, PM admins can only see their managed communities
- Write integration tests for critical flows (signup, document upload, compliance calculation, tenant isolation, **role-based document filtering**, **search correctness**)
- Set up CI/CD pipeline in GitHub Actions (lint, test, build, deploy)
- Configure production environment on Vercel with custom domain
- Set up database backups (Supabase automated + manual verification)
- Create the demo instances with nightly reset scripts (Palm Gardens condo + Sunset Ridge apartment)
- Load testing (100+ concurrent users during simulated annual meeting)
- Accessibility audit (WCAG 2.1 AA minimum)
- Verify email deliverability (test against Gmail, Outlook, Yahoo)
- **Data export** functionality (CSV export of residents, document list, maintenance requests)

**Deliverable:** Production-ready platform. Secure, tested, monitored, and deployable.

---

## 9. Common Pitfalls & How to Avoid Them

These are the specific risks most likely to waste your time on this project, based on the technology choices, scope, and team size.

| Pitfall | Why It Happens | How to Avoid It |
|---------|---------------|-----------------|
| Supabase Auth session not available in Server Components | Next.js App Router Server Components don't have access to browser cookies by default. Supabase's `createServerClient` requires explicit cookie forwarding. | Use `@supabase/ssr` package. Create a dedicated supabase server client utility that reads cookies from the request headers. Test auth in Server Components on day 1 of setup. |
| Drizzle + Supabase connection pooling issues | Supabase uses PgBouncer for connection pooling. Drizzle's default PostgreSQL driver (node-postgres) can conflict with PgBouncer in transaction mode. | Use Supabase's direct connection string for migrations and the pooled connection string for application queries. Configure Drizzle with the `postgres-js` driver instead of `node-postgres`. |
| File upload size limits on Vercel | Vercel's serverless functions have a 4.5MB request body limit by default. Your spec allows 50MB document uploads. | Use client-side direct uploads to Supabase Storage (presigned URLs) instead of routing uploads through your API. The API only stores the metadata. |
| Tailwind CSS class conflicts with design tokens | Custom design tokens may clash with Tailwind's default scale. Custom spacing values (e.g., your 8pt grid) may not map cleanly to Tailwind's default spacing scale. | Extend Tailwind's theme in `tailwind.config.ts` to use your token values. Map your spacing scale (space-1 = 4px, space-2 = 8px, etc.) to Tailwind classes. Disable Tailwind defaults you don't use. |
| Subdomain routing breaks in local development | `localhost` doesn't support subdomains. `palmgardens.localhost:3000` may not resolve correctly depending on the OS. | Use `localhost:3000` with a query parameter (`?tenant=palmgardens`) in development. Use middleware that checks for the query param in dev mode and subdomain in production. |
| Compliance date calculations off by one day | JavaScript Date objects and PostgreSQL timestamps handle timezones differently. A "30-day" deadline calculated in UTC may be a day off in Eastern time. | Use `date-fns` for all date arithmetic. Store all dates as UTC in the database. Convert to the community's timezone (from `communities.timezone` column) only at the presentation layer. |
| Stripe webhook events processed out of order | Stripe may send `checkout.session.completed` before `customer.subscription.created`, or retry events that already succeeded. | Make webhook handlers idempotent. Use Stripe event IDs to deduplicate. Always fetch the latest state from Stripe's API inside the handler instead of relying solely on webhook payload data. |
| Design system port takes longer than expected | 58 TSX files with inline token references, custom hooks, and complex component APIs need to be adapted to work with Tailwind + Next.js conventions. | Port components in priority order. Start with primitives (Box, Stack, Text), then the 4 most-used components (Button, Card, Badge, Nav). Defer lower-priority components until they're actually needed by a feature. |
| Over-building the PM dashboard before having PM customers | The PM dashboard is a separate product surface with its own routing, auth context, and data aggregation patterns. Building it "just in case" is a time sink. | Build the PM dashboard as a thin portfolio view in Phase 3. It should list communities and link to each one's existing admin dashboard. Do not build bulk operations or cross-portfolio analytics until a PM customer requests them. |
| Monorepo TypeScript path resolution breaks in production | Turborepo + pnpm workspaces require careful tsconfig paths and Next.js `transpilePackages` configuration. Works locally, breaks on Vercel. | Configure `transpilePackages` in `next.config.ts` for every internal package. Use tsconfig paths that match pnpm workspace resolution. Deploy to Vercel preview after every package change to catch build issues early. |
| Community type conditionals become spaghetti code | With three community types, every feature starts accumulating `if (type === 'condo') ... else if (type === 'apartment')` branches throughout the codebase. | Create a `CommunityFeatures` config object that maps community_type → enabled features. Components check `features.hasCompliance`, `features.hasLeaseTracking`, etc. instead of checking types directly. Centralizes all conditional logic in one place. |
| Role-based document filtering has security gaps | Complex access rules (owners see everything, tenants see restricted set, and the restricted set differs by community type) are easy to get wrong. | Define document access rules as a declarative policy (matrix of role × community_type × document_category → allow/deny). Enforce at the query level (Drizzle where clause), not the UI level. A document hidden from the UI but accessible via API is a data leak. |
| PDF text extraction blocks the request | `pdf-parse` loads the entire PDF into memory. A 50MB PDF can use 50MB+ RAM and take seconds to parse. If this runs in the upload request handler, the user sees a spinner for 30+ seconds or the function times out. | Extract text asynchronously. The upload endpoint returns success immediately. A background job (Vercel cron, or a separate function triggered via database change) handles text extraction. The document appears in search results once extraction completes. |
| Invite emails land in spam | Supabase's default email sender has poor reputation. Custom domain emails without SPF/DKIM will be flagged by Gmail and Outlook. | Set up SPF, DKIM, and DMARC records immediately when configuring Resend. Send custom invite emails through Resend (not Supabase's built-in email) for better deliverability control. Test with real inboxes before launching. |

---

## 10. Tools & Services Required

Complete list of external services and development tools needed before starting implementation.

### 10.1 Accounts to Create

| Service | Purpose | Pricing | Setup Priority |
|---------|---------|---------|----------------|
| Supabase | Database, Auth, File Storage | Free tier sufficient for development; Pro plan ($25/mo) for production | Day 1 |
| Vercel | Web hosting, preview deploys, edge functions | Free tier for development; Pro plan ($20/mo) for production custom domains | Day 1 |
| Stripe | Subscription billing, self-service signup | No monthly fee; 2.9% + 30¢ per transaction | Phase 2 (Day 26+) |
| Resend | Transactional email delivery | Free tier (100 emails/day); Pro plan ($20/mo) for production volume | Phase 1 (Day 6+) |
| Sentry | Error monitoring, performance tracking | Free tier (5K events/mo); Team plan ($26/mo) for production | Day 1 |
| GitHub | Source code, CI/CD via Actions | Free for private repos | Day 1 |
| Cloudflare | DNS, CDN, DDoS protection, wildcard SSL | Free tier sufficient; may need Pro ($20/mo) for advanced features | Phase 2 (subdomain routing) |

### 10.2 Development Dependencies (Key Packages)

| Package | Purpose | Category |
|---------|---------|----------|
| `next` (14+) | Web framework | Core |
| `typescript` | Type safety | Core |
| `tailwindcss` | Utility-first CSS | Core |
| `turbo` | Monorepo build orchestration | Core |
| `drizzle-orm` + `drizzle-kit` | Type-safe ORM and migration tool | Database |
| `postgres` (postgres-js driver) | PostgreSQL client compatible with Supabase pooling | Database |
| `@supabase/supabase-js` + `@supabase/ssr` | Supabase client SDK for auth and storage | Auth / Storage |
| `@tanstack/react-query` | Server state management, caching, optimistic updates | State |
| `zustand` | Lightweight client state management | State |
| `zod` | Schema validation for forms and API inputs | Validation |
| `react-email` + `@react-email/components` | Email template authoring in React | Email |
| `stripe` + `@stripe/stripe-js` | Payment processing SDK | Payments |
| `date-fns` | Date arithmetic (compliance deadline calculations) | Utility |
| `react-dropzone` | Drag-and-drop file upload UI | UI |
| `@react-pdf-viewer/core` | In-browser PDF viewing | UI |
| `lucide-react` | Icon library | UI |
| `recharts` | Charts for compliance dashboard metrics | UI |
| `file-type` | Magic bytes file type detection (server-side) | Security |
| `sharp` | Image resizing and optimization (logos, maintenance photos) | Media |
| `pdf-parse` | PDF text extraction for full-content search | Search |
| `mammoth` | DOCX text extraction for search (optional, can defer) | Search |
| `@uiw/react-md-editor` or `react-textarea-markdown` | Markdown textarea with toolbar for announcements | UI |
| `@upstash/ratelimit` + `@upstash/redis` | Production rate limiting (or use Vercel KV) | Security |

---

## 11. Risk Register

Honest assessment of what could go wrong, ranked by likelihood and impact.

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Scope creep extends timeline beyond 3-4 months | **HIGH** | **HIGH** | Strict phase gates. Do not start Phase N+1 until Phase N is complete and demo-tested. Cut features, not quality. |
| Self-service onboarding pipeline has edge cases that take weeks to resolve | **HIGH** | **MEDIUM** | Build manual onboarding FIRST so you can onboard customers even if self-service breaks. Self-service is an optimization, not a prerequisite for revenue. |
| Apartment support dilutes focus and extends every feature by 30-50% | **HIGH** | **HIGH** | Build condo/HOA features first within each phase, then add apartment conditionals. If timeline slips, apartment features are the first to defer. The compliance angle is the differentiator — protect it. |
| Community type conditionals create unmaintainable code | **MEDIUM** | **HIGH** | Centralize all conditional logic in a `CommunityFeatures` config. Use feature flags, not type-checking throughout the codebase. |
| Design system port reveals components that don't work well in a real app context | **MEDIUM** | **MEDIUM** | Port in priority order. If a component doesn't translate well, simplify it. The design system is a starting point, not a contract. |
| Supabase hits a limitation that requires migration to another provider | **LOW** | **HIGH** | Using Drizzle ORM (not Supabase client SDK) for queries means the database layer is portable. Only Supabase Auth and Storage would need replacement. |
| Compliance rules change (new Florida legislation) | **MEDIUM** | **MEDIUM** | All statutory rules are stored as configuration constants (`packages/shared/constants/florida-compliance.ts`), not hardcoded in business logic. Updates require config changes, not code rewrites. |
| No customers after launch | **MEDIUM** | **HIGH** | This is a business risk, not a technical one. Validate with real prospects in parallel with development. Do not build for 4 months in isolation. |
| Solo developer burnout | **HIGH** | **HIGH** | Set sustainable pace. Work in focused sprints with clear deliverables. Take breaks between phases. The "no hard deadline" is an advantage — use it. |
| Apartment product can't compete with established players | **MEDIUM** | **MEDIUM** | Position apartment support as a PM convenience feature ("manage everything in one place"), not as a standalone apartment product. Don't try to out-feature AppFolio. |
| Full-content search adds unexpected complexity | **MEDIUM** | **MEDIUM** | Start with PDF text extraction only (via `pdf-parse`). Defer Office document extraction and OCR. Flag scanned PDFs as not searchable rather than building OCR infrastructure. If search proves too slow, add a GIN index on the `tsvector` column. |
| Email deliverability issues delay customer onboarding | **MEDIUM** | **HIGH** | Set up SPF/DKIM/DMARC in Phase 1, not Phase 4. Test with real inboxes early. Use Resend's deliverability monitoring. Have a manual "resend invitation" button for when emails bounce. |

---

## 12. Legal & Operational Pages

These pages are easy to forget but required before accepting payments or processing user data.

### 12.1 Terms of Service

- Route: `/legal/terms`
- Must cover: service description, user obligations, data handling, limitation of liability for compliance failures, subscription terms and cancellation policy, acceptable use
- Include the disclaimer: "PropertyPro helps you organize and publish documents required by Florida Statutes §718 and §720. This platform does not constitute legal advice. Consult with your association's attorney to confirm your specific compliance obligations."
- **Implementation**: Static markdown file rendered as a page. Update manually when terms change. Track the effective date.

### 12.2 Privacy Policy

- Route: `/legal/privacy`
- Must cover: what data is collected, how it's stored (Supabase, AWS infrastructure), who can access it, data retention and deletion policies, cookie usage, third-party services (Stripe, Resend, Sentry)
- Must comply with Florida privacy laws. No selling of owner/tenant data.
- Required for Apple App Store and Google Play if a native app is ever submitted
- **Implementation**: Same as Terms — static markdown rendered as a page.

### 12.3 Compliance Disclaimer on Dashboard

On every compliance dashboard screen (condo/HOA), display a persistent footer or tooltip:

> "This checklist is based on our interpretation of Florida Statutes as of [date]. Laws change. Always verify requirements with legal counsel."

---

## 13. Honest Assessment & Devil's Advocate Notes

Per your request for critical thinking and skeptical evaluation, here are the things that concern me most about this project as currently scoped.

### 13.1 You're now building three products, not one

A compliance platform for condos, a compliance platform for HOAs (slightly different rules), and an operational platform for apartments. Each community type has different features, different admin dashboards, different onboarding flows, different document structures, and different value propositions. The shared infrastructure (auth, tenancy, file storage, announcements, maintenance) helps, but every feature now needs to be tested across three community types. Your test matrix just tripled.

### 13.2 The apartment market has no regulatory urgency

The condo/HOA pitch is: "You're legally required to have this. The deadline is January 1, 2026. You could be fined $50/day." That's an urgent, fear-driven sale. The apartment pitch is: "Here's a nice portal for your residents." That's a convenience sale with no urgency. Property managers will evaluate you against AppFolio and Buildium on features, and you'll lose that comparison on day one. The apartment support only makes strategic sense as a retention play for PM customers you've already captured on the compliance side.

### 13.3 Self-service for apartments requires separate pricing and positioning

Your current pricing ($99/mo Compliance Basic, $199/mo Compliance + Mobile) is built around the compliance value proposition. Apartments don't get compliance. What are you charging them for? Maintenance requests and announcements? That's a hard sell at $99/mo when free or cheaper alternatives exist. You need a separate pricing tier for apartments with a different value proposition, which means more marketing pages, more Stripe products, more onboarding branching.

### 13.4 The monorepo is now more justified (silver lining)

With three community types and increasingly complex shared logic (role-based access, community-type-aware features, configurable document categories), the monorepo's `packages/shared` becomes genuinely valuable. The community type configuration, feature flags, and access control policies live in one place and are consumed by the web app. If the mobile app is ever built, it inherits all of this logic. This is one decision that aged well with the expanded scope.

### 13.5 What this plan still gets right

The regulatory mandate is real. The phased build order ensures condo compliance (the differentiator) ships first. The architecture is flexible enough to support all three community types without separate codebases. The feature availability matrix provides a clear contract for what exists where. And the `CommunityFeatures` config pattern prevents the conditional logic from becoming unmaintainable. If you execute the phases in order and resist the temptation to perfect apartment features before the condo product is proven, this can work.

---

*— End of Document —*
