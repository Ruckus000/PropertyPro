# PropertyPro Complete Spec Summary

**Total Specs:** 65 specifications across 5 phases
**Last Updated:** 2026-02-09

---

## PHASE 0: FOUNDATION (9 specs)

Foundation layer establishes the core infrastructure, design system, and database connectivity.

### P0-00: Monorepo Scaffold
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-0-foundation/00-monorepo-scaffold.md`
- **Feature:** Initialize Turborepo monorepo with pnpm workspaces
- **Dependencies:** None
- **Tech Stack:** Turborepo, pnpm, Next.js 14+, TypeScript, Tailwind
- **Key Requirements:** 
  - Set up Turborepo config with build/dev/lint/test/typecheck pipelines
  - Create pnpm-workspace.yaml with workspace declarations
  - Initialize apps/web (Next.js 14+), packages/ui, packages/shared, packages/db, packages/email
  - Configure TypeScript path aliases and transpilePackages
- **Acceptance Criteria:** 7 items
  - pnpm install succeeds
  - pnpm build completes for all packages
  - pnpm dev starts on port 3000
  - TypeScript path aliases resolve
  - pnpm typecheck passes
- **Files Affected:** turbo.json, pnpm-workspace.yaml, next.config.ts, tsconfig.json files

### P0-01: Design Tokens
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-0-foundation/01-design-tokens.md`
- **Feature:** Create design token system (colors, spacing, typography)
- **Dependencies:** P0-00
- **Tech Stack:** Tailwind, CSS Variables, TypeScript
- **Key Requirements:**
  - Create CSS custom properties for design tokens
  - Create TypeScript constants mirroring CSS tokens
  - Define color palette (primary, secondary, success, warning, danger, neutral)
  - Define typography scale (heading-1 through body-small)
  - Define spacing scale on 8pt grid
  - Map to Tailwind config
- **Acceptance Criteria:** 6 items
  - Tailwind config uses custom token values
  - TypeScript constants match CSS variables
  - No hardcoded color/spacing values
- **Files Affected:** packages/ui/src/tokens/* (colors.ts, spacing.ts, typography.ts, shadows.ts, radius.ts, breakpoints.ts)

### P0-02: Core Primitives
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-0-foundation/02-core-primitives.md`
- **Feature:** Build foundational UI primitives (Box, Stack, Text)
- **Dependencies:** P0-01
- **Tech Stack:** React, TypeScript, Tailwind
- **Key Requirements:**
  - Box component: polymorphic container with flex/padding/margin
  - Stack component: vertical/horizontal layout with gap
  - Text component: typography with variants
  - Support polymorphic 'as' prop
  - Token-based styles exclusively
- **Acceptance Criteria:** 8 items
  - All props map to tokens
  - Polymorphic rendering works
  - TypeScript types correct (no any)
  - Unit tests pass
- **Files Affected:** packages/ui/src/primitives/* (Box.tsx, Stack.tsx, Text.tsx), test files

### P0-03: Priority Components
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-0-foundation/03-priority-components.md`
- **Feature:** Build priority UI components (Button, Card, Badge, NavRail)
- **Dependencies:** P0-02
- **Tech Stack:** React, TypeScript, Tailwind
- **Key Requirements:**
  - Button: variants (primary/secondary/ghost/danger), sizes (sm/md/lg), states (loading/disabled), icons
  - Card: header/body/footer slots, elevation variants
  - Badge: status colors (green/yellow/red/info/neutral), sizes (sm/md)
  - NavRail: vertical navigation with active state, keyboard support
  - Dark mode support via Tailwind dark: prefix
- **Acceptance Criteria:** 8 items
  - All variant+size combos render
  - Loading state shows spinner
  - NavRail keyboard navigation works
- **Files Affected:** packages/ui/src/components/* (Button.tsx, Card.tsx, Badge.tsx, NavRail.tsx, Icon.tsx)

### P0-04: Supabase Setup
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-0-foundation/04-supabase-setup.md`
- **Feature:** Initialize Supabase auth and storage infrastructure
- **Dependencies:** P0-00
- **Tech Stack:** Supabase, Next.js, TypeScript
- **Key Requirements:**
  - createServerClient (Server Components with request cookies)
  - createBrowserClient (Client Components)
  - createAdminClient (API routes with service role)
  - Storage buckets: documents (50MB), images (10MB), public
  - Middleware to refresh session on every request
  - Presigned URLs for secure file access
  - Email/password auth provider
- **Acceptance Criteria:** 8 items
  - Server-side queries work
  - Browser auth works
  - Storage upload/download work
  - Session persists across refreshes
  - Middleware refreshes without blocking
- **Files Affected:** packages/db/src/supabase/* (server.ts, client.ts, admin.ts, middleware.ts, storage.ts), middleware.ts

### P0-05: Drizzle Schema Core
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-0-foundation/05-drizzle-schema-core.md`
- **Feature:** Define core database schema with Drizzle ORM
- **Dependencies:** P0-04
- **Tech Stack:** Drizzle ORM, PostgreSQL, TypeScript
- **Key Requirements:**
  - communities table: community_type (condo_718/hoa_720/apartment), timezone, subdomain, branding (logo/colors)
  - users table: email, first_name, last_name, avatar_url, timestamps
  - user_roles table: user_id FK, community_id FK, role (admin/manager/auditor/resident), unit_id FK
  - units table: unit_number, property_address, condo-specific (parking_spots, storage_units, voting_share), apartment-specific (rent_amount, availability_date)
  - document_categories table: name, icon, display_order
  - documents table: title, description, file_url, search_text, search_vector, uploaded_by
  - notification_preferences table: email_frequency, in_app_enabled
  - All tables: BIGINT IDs, community_id FK, created_at/updated_at (UTC), soft-delete support
- **Acceptance Criteria:** 10 items
  - Migration creates all tables correctly
  - Enums enforce valid values
  - Timestamps are UTC
  - Foreign keys have proper ON DELETE behavior
  - TypeScript types generated and exported
- **Files Affected:** packages/db/src/schema/* (communities.ts, users.ts, user-roles.ts, units.ts, documents.ts, notification-preferences.ts, enums.ts)

### P0-06: Scoped Query Builder
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-0-foundation/06-scoped-query-builder.md`
- **Feature:** Build multi-tenant query builder with automatic community scoping
- **Dependencies:** P0-05
- **Tech Stack:** Drizzle ORM, TypeScript
- **Key Requirements:**
  - createScopedClient(communityId) wraps Drizzle
  - Auto-append .where(eq(table.communityId, ctx.communityId)) to all queries
  - Auto-exclude soft-deleted rows (WHERE deleted_at IS NULL)
  - Escape hatch for compliance_audit_log (append-only, no soft-delete filter)
  - getTenantContext() extracts communityId from subdomain/session/parameter
  - Throw TenantContextMissing error if no community context
- **Acceptance Criteria:** 9 items
  - All queries include community_id filter
  - Soft-deletable tables exclude deleted_at rows
  - Cross-tenant isolation verified
  - Soft-deleted rows not returned
  - compliance_audit_log returns all rows
- **Files Affected:** packages/db/src/scoped-client.ts, tenant-context.ts, errors/TenantContextMissing.ts, types/scoped-client.ts, integration tests

### P0-07: Error Handling
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-0-foundation/07-error-handling.md`
- **Feature:** Implement structured error handling and monitoring
- **Dependencies:** P0-00
- **Tech Stack:** Zod, React, TypeScript
- **Key Requirements:**
  - withErrorHandler HOF for API routes
  - Structured JSON responses: { error: { code, message, details? } }
  - HTTP status mapping: 400 (validation), 401 (unauthorized), 403 (forbidden), 404 (not found), 422 (unprocessable), 429 (rate limited)
  - Unknown errors return 500 without stack trace exposure
  - X-Request-ID header per request (UUID)
  - React Error Boundary at portal layout
  - Toast notification system for API errors
  - Zod error formatter for human-readable validation messages
- **Acceptance Criteria:** 8 items
  - ValidationError returns 400
  - UnauthorizedError returns 401
  - NotFoundError returns 404
  - Unknown error returns 500
  - X-Request-ID present on all responses
  - Error Boundary catches render-time errors
  - Toast shows API errors
- **Files Affected:** apps/web/src/lib/api/error-handler.ts, error classes, zod/error-formatter.ts

### P0-08: Sentry Setup
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-0-foundation/08-sentry-setup.md`
- **Feature:** Configure error tracking and performance monitoring with Sentry
- **Dependencies:** P0-07
- **Tech Stack:** Sentry, Next.js, TypeScript
- **Key Requirements:**
  - Install @sentry/nextjs with types
  - sentry.client.config.ts: client-side error capture and APM
  - sentry.server.config.ts: server-side error capture (API routes, Server Components)
  - sentry.edge.config.ts: Edge Runtime (middleware)
  - Add to next.config.ts via withSentryConfig wrapper
  - Capture exceptions from withErrorHandler
  - Include communityId and userId as Sentry context
  - Include X-Request-ID as tag for correlation
  - Source maps upload for production
  - Environment-based DSN (production/staging only)
  - Redact sensitive headers (authorization, cookie, x-api-key)
- **Acceptance Criteria:** 8 items
  - Errors appear in Sentry dashboard with context
  - Server Component errors captured
  - Performance transactions recorded
  - Source maps resolve correctly
  - No local dev execution unless explicitly set
  - communityId and userId included
  - X-Request-ID tagged
  - Sensitive headers redacted
- **Files Affected:** apps/web/sentry.*.config.ts files, next.config.ts, middleware.ts, instrumentation.ts

---

## PHASE 1: COMPLIANCE CORE (21 specs)

Compliance layer builds the statutory document management and compliance checklist system.

### P1-09: Compliance Checklist Engine
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/09-compliance-checklist-engine.md`
- **Feature:** Auto-generate compliance checklists based on community type
- **Dependencies:** P0-05, P0-06
- **Tech Stack:** Drizzle ORM, TypeScript, date-fns
- **Key Requirements:**
  - compliance_checklist_items table
  - Florida §718 (condo) and §720 (HOA) templates as config constants
  - Auto-generate checklist on community creation
  - Track status: satisfied/unsatisfied/overdue/not_applicable
  - Calculate status based on document presence and posting deadlines
  - 30-day posting deadline tracking
  - Rolling 12-month windows for minutes/recordings
  - Use date-fns for date arithmetic, store UTC
- **Acceptance Criteria:** 7 items
  - Condo creates §718 checklist
  - HOA creates §720 checklist
  - Apartment creates NO checklist
  - Status reflects document presence
  - Overdue detection works
  - Unit tests cover DST/leap years/weekends
- **Files Affected:** packages/db/src/schema.ts, packages/shared/src/compliance-templates.ts, apps/api/src/routes/compliance.ts, compliance-calculator.ts, test files

### P1-10: Compliance Dashboard UI
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/10-compliance-dashboard-ui.md`
- **Feature:** Build compliance dashboard UI
- **Dependencies:** P1-09, P0-03
- **Tech Stack:** React, TypeScript, Tailwind
- **Key Requirements:**
  - Compliance dashboard showing checklist status
  - Visual indicators for satisfied/unsatisfied/overdue/not_applicable
  - PDF export functionality
  - Filter by status and category
  - Timeline view for upcoming deadlines
- **Acceptance Criteria:** 7 items
  - Dashboard displays all checklist items
  - Status colors correct
  - PDF export includes all required info
  - Filtering works
- **Files Affected:** apps/web/src/app/(authenticated)/communities/[id]/compliance/page.tsx, components/compliance-*.tsx, utils/pdf-export.ts

### P1-11: Document Upload Pipeline
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/11-document-upload-pipeline.md`
- **Feature:** Implement document upload with presigned URLs
- **Dependencies:** P0-04, P0-06
- **Tech Stack:** Supabase Storage, TypeScript, React
- **Key Requirements:**
  - Presigned URL generation for secure uploads
  - Upload to documents storage bucket
  - Create document record in DB
  - Progress tracking
  - Error handling for upload failures
- **Acceptance Criteria:** 6 items
  - Presigned URL generation works
  - Upload succeeds
  - Document record created
  - Progress tracked
- **Files Affected:** apps/api/src/routes/upload.ts, documents.ts, components/document-uploader.tsx, hooks/useDocumentUpload.ts

### P1-12: Magic Bytes Validation
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/12-magic-bytes-validation.md`
- **Feature:** Validate file types by magic bytes
- **Dependencies:** P1-11
- **Tech Stack:** TypeScript
- **Key Requirements:**
  - Validate files by magic bytes, not extension
  - Allowed types: PDF, DOCX, PNG, JPG
  - Reject mismatched MIME types
  - Middleware validation before upload
- **Acceptance Criteria:** 5 items
  - PDF files pass validation
  - Non-PDF files with .pdf extension rejected
  - Size limits enforced
- **Files Affected:** apps/api/src/utils/file-validation.ts, middleware/validate-upload.ts, test files

### P1-13: Document Text Extraction
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/13-document-text-extraction.md`
- **Feature:** Extract text from PDFs for full-text search
- **Dependencies:** P1-11, P0-05
- **Tech Stack:** pdf-parse (or similar), TypeScript, PostgreSQL
- **Key Requirements:**
  - Extract text from uploaded PDFs
  - Update search_text column in documents table
  - Generate search_vector (tsvector) for full-text search
  - Worker/queue system for async extraction
  - Handle extraction failures gracefully
- **Acceptance Criteria:** 6 items
  - Text extracted from PDF
  - search_text populated
  - search_vector generated
  - Full-text search works
- **Files Affected:** apps/api/src/workers/pdf-extraction.ts, utils/extract-pdf-text.ts, packages/db/src/schema.ts (update), tests

### P1-14: Document Search
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/14-document-search.md`
- **Feature:** Full-text search over documents
- **Dependencies:** P1-13, P0-06
- **Tech Stack:** PostgreSQL tsvector, Drizzle ORM, TypeScript
- **Key Requirements:**
  - Full-text search using PostgreSQL tsvector
  - Filter by category, date range, document type
  - Ranked results
  - API endpoint and UI component
- **Acceptance Criteria:** 6 items
  - Search returns relevant results
  - Ranking works
  - Filters apply correctly
  - Performance acceptable
- **Files Affected:** apps/api/src/routes/documents.ts (search endpoint), packages/db/src/queries/document-search.ts, components/document-search.tsx, tests

### P1-15: Document Management UI
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/15-document-management-ui.md`
- **Feature:** Build document management interface
- **Dependencies:** P1-11, P1-12, P1-14, P0-03
- **Tech Stack:** React, TypeScript, Tailwind
- **Key Requirements:**
  - Document upload area (drag-and-drop)
  - Document list with search/filter
  - Document viewer
  - Version history
  - Delete functionality
- **Acceptance Criteria:** 6 items
  - Upload works
  - List displays all documents
  - Search filters work
  - Viewer opens documents
- **Files Affected:** apps/web/src/app/(authenticated)/communities/[id]/documents/page.tsx, components/document-*.tsx

### P1-16: Meeting Management
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/16-meeting-management.md`
- **Feature:** Build meeting scheduling and compliance tracking
- **Dependencies:** P0-05, P0-06, P1-09
- **Tech Stack:** Drizzle ORM, TypeScript, date-fns
- **Key Requirements:**
  - meetings table with date, type, location
  - meeting_documents table for attached documents
  - Calculate compliance deadlines based on meeting date
  - Generate meeting notices
  - Track minutes and recordings
- **Acceptance Criteria:** 7 items
  - Meeting created
  - Deadlines calculated
  - Notices sent
  - Documents attached
- **Files Affected:** packages/db/src/schema.ts (meetings tables), apps/api/src/routes/meetings.ts, utils/meeting-calculator.ts, components/meeting-*.tsx

### P1-17: Announcement System
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/17-announcement-system.md`
- **Feature:** Build announcement posting system
- **Dependencies:** P0-05, P0-06, P0-03
- **Tech Stack:** Drizzle ORM, React, TypeScript
- **Key Requirements:**
  - announcements table with title, body, author, publish_date
  - Compose announcements
  - Pin/featured announcements
  - Archive old announcements
  - Email notifications to residents
- **Acceptance Criteria:** 6 items
  - Announcement created
  - Displayed in resident portal
  - Emails sent
  - Pinning works
- **Files Affected:** packages/db/src/schema.ts, apps/api/src/routes/announcements.ts, components/announcement-*.tsx

### P1-18: Resident Management
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/18-resident-management.md`
- **Feature:** Build resident roster management
- **Dependencies:** P0-04, P0-05, P0-06
- **Tech Stack:** Drizzle ORM, React, TypeScript
- **Key Requirements:**
  - CRUD operations for residents
  - Assign residents to units
  - Assign roles (resident, auditor, manager, admin)
  - Bulk resident import
  - Resident contact info
- **Acceptance Criteria:** 6 items
  - Resident created
  - Assigned to unit
  - Role assignment works
  - Bulk import possible
- **Files Affected:** packages/db/src/schema.ts (user_roles), apps/api/src/routes/residents.ts, components/resident-*.tsx

### P1-19: CSV Import
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/19-csv-import.md`
- **Feature:** Bulk import residents from CSV
- **Dependencies:** P1-18
- **Tech Stack:** TypeScript, papaparse (or similar)
- **Key Requirements:**
  - CSV parsing and validation
  - Preview before import
  - Error reporting
  - Duplicate detection
  - Batch creation of residents
- **Acceptance Criteria:** 6 items
  - CSV parsed correctly
  - Preview shows data
  - Errors reported
  - Import succeeds
- **Files Affected:** apps/api/src/routes/import-residents.ts, utils/csv-validator.ts, components/csv-*.tsx

### P1-20: Invitation Auth Flow
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/20-invitation-auth-flow.md`
- **Feature:** Build invite-based onboarding
- **Dependencies:** P1-18, P0-04
- **Tech Stack:** Supabase Auth, TypeScript, React Email
- **Key Requirements:**
  - Generate invitation links
  - Email invitations to residents
  - Accept invitation with set-password flow
  - Validate invitation tokens
  - One-time links
- **Acceptance Criteria:** 6 items
  - Invitation email sent
  - Link works
  - Password set via invitation
  - Token expires
- **Files Affected:** apps/api/src/routes/invitations.ts, packages/email/src/invitation-email.tsx, apps/web/src/app/auth/accept-invite/page.tsx, components/set-password-form.tsx

### P1-21: Password Reset Flow
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/21-password-reset-flow.md`
- **Feature:** Build password reset functionality
- **Dependencies:** P0-04
- **Tech Stack:** Supabase Auth, TypeScript, React
- **Key Requirements:**
  - Forgot password form
  - Email password reset link
  - Reset password form
  - Validate reset token
  - Rate limiting on requests
- **Acceptance Criteria:** 5 items
  - Reset email sent
  - Link works
  - Password updated
  - Rate limiting enforced
- **Files Affected:** apps/web/src/app/auth/forgot-password/page.tsx, reset-password/page.tsx, components/reset-password-form.tsx

### P1-22: Session Management
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/22-session-management.md`
- **Feature:** Implement session management and auth flows
- **Dependencies:** P0-04
- **Tech Stack:** Supabase Auth, TypeScript, Next.js
- **Key Requirements:**
  - Server-side session management
  - Client-side auth state
  - Session refresh on page load
  - Session expiration handling
  - Auth state change listeners
- **Acceptance Criteria:** 6 items
  - Session created on login
  - Session persists
  - Refresh works
  - Expired sessions logged out
- **Files Affected:** apps/web/src/lib/supabase/server.ts, client.ts, middleware.ts, app/(authenticated)/layout.tsx

### P1-23: Public Website
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/23-public-website.md`
- **Feature:** Build public-facing website for residents
- **Dependencies:** P0-05, P0-03, P1-16
- **Tech Stack:** React, TypeScript, Tailwind, Next.js
- **Key Requirements:**
  - Public community homepage (via subdomain)
  - Display meetings and notices
  - Resident login portal
  - Mobile-responsive
  - Subdomain routing
- **Acceptance Criteria:** 7 items
  - Public site loads
  - Meetings displayed
  - Notices visible
  - Login works
- **Files Affected:** apps/web/src/app/(public)/[subdomain]/page.tsx, notices/page.tsx, components/public-*.tsx

### P1-24: Resident Portal Dashboard
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/24-resident-portal-dashboard.md`
- **Feature:** Build resident dashboard with key information
- **Dependencies:** P0-03, P1-17, P1-16, P0-06
- **Tech Stack:** React, TypeScript, Tailwind
- **Key Requirements:**
  - Welcome message
  - Upcoming meetings
  - Recent announcements
  - Quick links
  - Personal information section
- **Acceptance Criteria:** 5 items
  - Dashboard loads
  - Announcements displayed
  - Meetings visible
  - Information accurate
- **Files Affected:** apps/web/src/app/(authenticated)/dashboard/page.tsx, components/dashboard-*.tsx

### P1-25: Resident Document Library
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/25-resident-document-library.md`
- **Feature:** Build role-based document access for residents
- **Dependencies:** P1-14, P1-15, P0-06
- **Tech Stack:** React, TypeScript, Drizzle ORM
- **Key Requirements:**
  - Role-based document visibility
  - Category filtering
  - Search documents
  - Download documents
  - Access control matrix
- **Acceptance Criteria:** 6 items
  - Residents see only allowed docs
  - Admin sees all docs
  - Search works
  - Download works
- **Files Affected:** packages/shared/src/access-policies.ts, packages/db/src/queries/document-access.ts, components/document-library.tsx

### P1-26: Notification Preferences
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/26-notification-preferences.md`
- **Feature:** Allow residents to control notification frequency
- **Dependencies:** P0-05, P1-18
- **Tech Stack:** Drizzle ORM, React, TypeScript
- **Key Requirements:**
  - notification_preferences table
  - Email frequency (immediate, daily, weekly, never)
  - In-app notification toggle
  - Settings page
  - Respect preferences on email send
- **Acceptance Criteria:** 5 items
  - Preferences saved
  - Email respects frequency
  - Settings page works
- **Files Affected:** packages/db/src/schema.ts, apps/web/src/app/(authenticated)/settings/page.tsx, components/notification-preferences.tsx

### P1-27: Audit Logging
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/27-audit-logging.md`
- **Feature:** Implement immutable audit trail
- **Dependencies:** P0-05, P0-06
- **Tech Stack:** Drizzle ORM, TypeScript, PostgreSQL
- **Key Requirements:**
  - audit_logs table (immutable, append-only)
  - Log user actions (create, update, delete, view)
  - Include user_id, action, resource_type, resource_id, timestamp, old_values, new_values
  - Middleware to auto-inject audit logs on mutations
  - Exclude soft-delete filter for audit queries
- **Acceptance Criteria:** 5 items
  - Actions logged
  - Middleware auto-injects
  - Old/new values captured
  - Queries return all logs
- **Files Affected:** packages/db/src/schema.ts, utils/audit-logger.ts, middleware/audit-middleware.ts, tests

### P1-28: Email Infrastructure
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/28-email-infrastructure.md`
- **Feature:** Set up email template system with React Email
- **Dependencies:** P0-00
- **Tech Stack:** React Email, TypeScript, Tailwind
- **Key Requirements:**
  - Email templates for invitations, password reset, meetings, compliance alerts, announcements
  - Use React Email components
  - Support dark mode
  - Test email rendering
- **Acceptance Criteria:** 5 items
  - Templates render correctly
  - Preview works
  - Email sends successfully
- **Files Affected:** packages/email/src/templates/* (invitation-email.tsx, password-reset-email.tsx, etc.)

### P1-29: Demo Seed Data
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-1-compliance-core/29-demo-seed-data.md`
- **Feature:** Seed demo data for testing
- **Dependencies:** P1-09, P1-10, P1-11, P1-12
- **Tech Stack:** Drizzle ORM, TypeScript
- **Key Requirements:**
  - Create demo communities (condo, HOA, apartment)
  - Create demo users with various roles
  - Create demo documents
  - Create demo checklists
  - Create demo meetings
- **Acceptance Criteria:** 5 items
  - Script runs without error
  - Data verifiable in DB
  - Users can log in
- **Files Affected:** scripts/seed-demo.ts, scripts/config/demo-data.ts, tests/seed.integration.test.ts

---

## PHASE 2: MULTI-TENANCY (15 specs)

Multi-tenancy layer adds SaaS functionality, billing, and self-service setup.

### P2-30: Subdomain Routing Middleware
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-2-multi-tenancy/30-subdomain-routing.md`
- **Feature:** Route requests to correct tenant based on subdomain
- **Dependencies:** P0-04, P0-06
- **Tech Stack:** Next.js middleware, TypeScript
- **Key Requirements:**
  - Extract subdomain from request hostname
  - Resolve subdomain to communityId
  - Set tenant context in request headers
  - Reserved subdomains (www, mail, api, etc.)
  - Redirect logic for non-existent subdomains
- **Acceptance Criteria:** 5 items
  - Subdomain resolved to community
  - Context available to routes
  - Reserved subdomains protected
- **Files Affected:** apps/web/src/middleware.ts, packages/shared/src/middleware/*.ts

### P2-31: Marketing Landing Page
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-2-multi-tenancy/31-marketing-landing-page.md`
- **Feature:** Build marketing landing page
- **Dependencies:** P0-03
- **Tech Stack:** React, TypeScript, Tailwind
- **Key Requirements:**
  - Hero section
  - Features section
  - Pricing section
  - CTA buttons
  - Mobile responsive
- **Acceptance Criteria:** 6 items
  - Page loads
  - Navigation works
  - CTA buttons functional
  - Mobile responsive
- **Files Affected:** apps/web/src/app/(marketing)/page.tsx, components/marketing/*.tsx

### P2-32: Legal Pages
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-2-multi-tenancy/32-legal-pages.md`
- **Feature:** Create legal pages (terms, privacy)
- **Dependencies:** P0-00
- **Tech Stack:** Next.js, Markdown
- **Key Requirements:**
  - Terms of Service page
  - Privacy Policy page
  - Markdown content files
  - Proper formatting
- **Acceptance Criteria:** 4 items
  - Pages render
  - Content complete
  - Links work
- **Files Affected:** apps/web/src/app/legal/terms/page.tsx, privacy/page.tsx, content/legal/*.md

### P2-33: Self-Service Signup
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-2-multi-tenancy/33-self-service-signup.md`
- **Feature:** Allow property managers to self-service signup
- **Dependencies:** P2-31, P0-04
- **Tech Stack:** Supabase Auth, React, TypeScript, Zod
- **Key Requirements:**
  - Signup form (email, password, community name)
  - Community type selector (apartment/condo/hoa)
  - Subdomain availability checker
  - Email verification
  - Create initial admin user
  - Trigger provisioning pipeline
- **Acceptance Criteria:** 7 items
  - Signup form works
  - Community created
  - Subdomain assigned
  - User can log in
  - Email verified
- **Files Affected:** apps/web/src/app/(auth)/signup/page.tsx, components/signup/*.tsx, lib/actions/signup.ts

### P2-34: Stripe Integration
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-2-multi-tenancy/34-stripe-integration.md`
- **Feature:** Integrate Stripe for billing
- **Dependencies:** P2-33
- **Tech Stack:** Stripe, TypeScript
- **Key Requirements:**
  - Stripe webhook handler
  - Checkout flow
  - Subscription management
  - Plan pricing (apartment vs condo/HOA)
  - Payment method management
- **Acceptance Criteria:** 7 items
  - Checkout works
  - Webhook processes payments
  - Subscription created
  - Invoice generated
- **Files Affected:** apps/api/src/routes/webhooks/stripe.ts, lib/actions/checkout.ts, services/stripe-service.ts

### P2-35: Provisioning Pipeline
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-2-multi-tenancy/35-provisioning-pipeline.md`
- **Feature:** Auto-provision new tenant infrastructure
- **Dependencies:** P2-34, P0-05, P0-06
- **Tech Stack:** TypeScript, Drizzle ORM, Supabase
- **Key Requirements:**
  - Create community record
  - Create default documents bucket
  - Create initial user/admin role
  - Generate initial Stripe customer
  - Idempotency keys for retry safety
  - Welcome email
- **Acceptance Criteria:** 6 items
  - Community provisioned
  - Database records created
  - Storage bucket ready
  - Admin can log in
- **Files Affected:** apps/api/src/services/provisioning-service.ts, lib/provisioning-idempotency.ts, packages/email/src/templates/welcome.tsx

### P2-36: Apartment Operational Dashboard
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-2-multi-tenancy/36-apartment-operational-dashboard.md`
- **Feature:** Build apartment-specific operational dashboard
- **Dependencies:** P0-03, P0-05, P0-06
- **Tech Stack:** React, TypeScript, Tailwind
- **Key Requirements:**
  - Unit occupancy overview
  - Lease expiration alerts
  - Maintenance request overview
  - Resident count
  - Vacancy rate
  - Revenue metrics
- **Acceptance Criteria:** 6 items
  - Metrics displayed
  - Data accurate
  - Charts render
  - Filters work
- **Files Affected:** apps/web/src/app/dashboard/apartment/page.tsx, components/dashboard/apartment-*.tsx

### P2-37: Lease Tracking
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-2-multi-tenancy/37-lease-tracking.md`
- **Feature:** Track apartment lease dates and expiration
- **Dependencies:** P0-05, P0-06
- **Tech Stack:** Drizzle ORM, TypeScript, date-fns
- **Key Requirements:**
  - leases table: unit_id FK, resident_id FK, start_date, end_date, rent_amount
  - Lease expiration calculations
  - Upcoming lease alerts
  - Lease renewal reminders
- **Acceptance Criteria:** 5 items
  - Lease created
  - Expiration calculated
  - Alerts triggered
  - Renewals tracked
- **Files Affected:** packages/shared/src/schema/leases.ts, apps/api/src/routes/leases.ts, services/lease-expiration-service.ts

### P2-38: Apartment Onboarding Wizard
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-2-multi-tenancy/38-apartment-onboarding-wizard.md`
- **Feature:** Multi-step apartment onboarding
- **Dependencies:** P2-35, P2-36, P2-37
- **Tech Stack:** React, TypeScript, Tailwind
- **Key Requirements:**
  - Step 1: Community profile
  - Step 2: Units configuration
  - Step 3: Lease rules setup
  - Progress tracking
  - Validation at each step
- **Acceptance Criteria:** 5 items
  - All steps complete
  - Data saved
  - Validation works
  - Dashboard shows data
- **Files Affected:** apps/web/src/app/onboarding/apartment/page.tsx, components/onboarding/apartment-wizard.tsx, steps/*.tsx

### P2-39: Condo Onboarding Wizard
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-2-multi-tenancy/39-condo-onboarding-wizard.md`
- **Feature:** Multi-step condo/HOA onboarding
- **Dependencies:** P2-35, P1-09
- **Tech Stack:** React, TypeScript, Tailwind
- **Key Requirements:**
  - Step 1: Statutory documents upload
  - Step 2: Community profile
  - Step 3: Unit roster import
  - Auto-generate compliance checklist
- **Acceptance Criteria:** 5 items
  - All steps complete
  - Documents uploaded
  - Checklist generated
- **Files Affected:** apps/web/src/app/onboarding/condo/page.tsx, components/onboarding/condo-wizard.tsx, steps/*.tsx

### P2-40: Community Features Config
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-2-multi-tenancy/40-community-features-config.md`
- **Feature:** Feature flags for community-type specific functionality
- **Dependencies:** P0-05
- **Tech Stack:** TypeScript
- **Key Requirements:**
  - Feature matrix: community_type × feature → enabled/disabled
  - getFeatures(communityId) returns available features
  - Frontend conditionally renders based on features
  - Examples: lease_tracking (apartment only), compliance_checklist (condo/HOA only)
- **Acceptance Criteria:** 5 items
  - Features returned for community type
  - Correct features enabled
  - Frontend respects flags
- **Files Affected:** packages/shared/src/features/community-features.ts, types.ts, get-features.ts

### P2-41: Email Notifications
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-2-multi-tenancy/41-email-notifications.md`
- **Feature:** Expanded email notification system
- **Dependencies:** P1-28, P1-26
- **Tech Stack:** React Email, TypeScript, SendGrid/Resend
- **Key Requirements:**
  - Meeting notice emails
  - Compliance alert emails
  - Announcement blast emails
  - Maintenance update emails
  - Respect notification preferences
  - Batch sending
- **Acceptance Criteria:** 5 items
  - Emails sent correctly
  - HTML renders properly
  - Preferences respected
  - Bulk sending works
- **Files Affected:** packages/email/src/templates/*.tsx, apps/api/src/services/email-service.ts

### P2-42: Rate Limiting
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-2-multi-tenancy/42-rate-limiting.md`
- **Feature:** Implement API rate limiting
- **Dependencies:** P0-07
- **Tech Stack:** Upstash Redis, TypeScript
- **Key Requirements:**
  - Rate limit by IP and user
  - Sliding window algorithm
  - Different limits per endpoint
  - Return 429 Too Many Requests
  - Reset time in response headers
- **Acceptance Criteria:** 4 items
  - Rate limit enforced
  - Status 429 returned
  - Reset time provided
  - Limits accurate
- **Files Affected:** apps/api/src/middleware/rate-limit.ts, lib/rate-limiter.ts, services/upstash-service.ts

### P2-43: Multi-Tenant Isolation Tests
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-2-multi-tenancy/43-multi-tenant-isolation-tests.md`
- **Feature:** Comprehensive multi-tenant isolation tests
- **Dependencies:** P0-06, P2-30
- **Tech Stack:** Jest, TypeScript
- **Key Requirements:**
  - Test that communityA cannot access communityB data
  - Test scoped queries enforce isolation
  - Test soft-delete filtering works per-tenant
  - Test cross-tenant edge cases
- **Acceptance Criteria:** 4 items
  - All isolation tests pass
  - Edge cases covered
  - No data leaks
- **Files Affected:** apps/api/tests/integration/multi-tenant-isolation.test.ts, fixtures/multi-tenant-*.ts

### P2-44: Apartment Demo Seed
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-2-multi-tenancy/44-apartment-demo-seed.md`
- **Feature:** Extend demo seed data for apartment communities
- **Dependencies:** P2-36, P2-37, P1-29
- **Tech Stack:** Drizzle ORM, TypeScript
- **Key Requirements:**
  - Create demo apartment community
  - Create demo units
  - Create demo leases
  - Create demo residents
  - Create demo maintenance requests
- **Acceptance Criteria:** 5 items
  - Seed runs successfully
  - Data queryable
  - Dashboard displays data
- **Files Affected:** packages/db/src/seed-demo.ts, fixtures/apartment-demo-data.ts, scripts/seed-apartment-demo.ts

---

## PHASE 3: PM & MOBILE (10 specs)

Property manager and mobile optimization layer.

### P3-45: PM Portfolio Dashboard
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-3-pm-mobile/45-pm-portfolio-dashboard.md`
- **Feature:** Property manager multi-community dashboard
- **Dependencies:** P0-03, P0-06, P2-40
- **Tech Stack:** React, TypeScript, Tailwind
- **Key Requirements:**
  - View all managed communities
  - Community cards showing key metrics
  - Filter/search communities
  - Quick action buttons per community
  - Switch between communities
- **Acceptance Criteria:** 6 items
  - Communities displayed
  - Metrics accurate
  - Filtering works
  - Navigation works
- **Files Affected:** apps/web/app/(pm)/dashboard/communities/page.tsx, components/pm/Community*.tsx

### P3-46: PM Community Switcher
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-3-pm-mobile/46-pm-community-switcher.md`
- **Feature:** Easy community switching for multi-community PMs
- **Dependencies:** P3-45
- **Tech Stack:** React, TypeScript
- **Key Requirements:**
  - Community switcher dropdown in header
  - Recently accessed communities
  - Quick search
  - Switch and stay on same page
- **Acceptance Criteria:** 4 items
  - Switcher displays
  - Search works
  - Switch updates context
- **Files Affected:** apps/web/app/(pm)/dashboard/[community_id]/page.tsx, components/pm/CommunitySwitcher.tsx, hooks/useSelectedCommunity.ts

### P3-47: White-Label Branding
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-3-pm-mobile/47-white-label-branding.md`
- **Feature:** Customizable branding per community
- **Dependencies:** P3-45, P0-05
- **Tech Stack:** React, TypeScript, image processing
- **Key Requirements:**
  - Upload community logo
  - Set primary and secondary colors
  - Preview changes
  - Apply to public site
  - Persist to community record
- **Acceptance Criteria:** 5 items
  - Logo uploads
  - Colors apply
  - Preview shows changes
  - Public site reflects branding
- **Files Affected:** apps/web/app/(pm)/settings/branding/page.tsx, components/pm/Branding*.tsx, lib/services/image-processor.ts

### P3-48: Phone Frame Mobile Preview
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-3-pm-mobile/48-phone-frame-mobile-preview.md`
- **Feature:** Preview resident experience on mobile
- **Dependencies:** P0-03, P1-24, P2-40
- **Tech Stack:** React, TypeScript, Tailwind, iframe
- **Key Requirements:**
  - Simulate iPhone/Android viewport
  - Display resident portal in mobile frame
  - Zoom controls
  - Rotate device orientation
  - Link back to full page
- **Acceptance Criteria:** 6 items
  - Frame renders
  - Content displays
  - Zoom works
  - Responsive layout correct
- **Files Affected:** apps/web/components/mobile/PhoneFrame.tsx, app/mobile/layout.tsx, page.tsx

### P3-49: Mobile Layouts
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-3-pm-mobile/49-mobile-layouts.md`
- **Feature:** Optimize all layouts for mobile
- **Dependencies:** P3-48, P0-02, P0-03
- **Tech Stack:** React, TypeScript, Tailwind
- **Key Requirements:**
  - Bottom tab bar navigation
  - Compact card layout
  - Touch-friendly buttons (48x48px min)
  - Reduced whitespace
  - Readable text sizes
- **Acceptance Criteria:** 5 items
  - Tab bar displays correctly
  - Cards responsive
  - Text readable
  - Touch targets adequate
- **Files Affected:** apps/web/components/mobile/*.tsx, styles/mobile.css

### P3-50: Maintenance Request Submission
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-3-pm-mobile/50-maintenance-request-submission.md`
- **Feature:** Allow residents to submit maintenance requests
- **Dependencies:** P0-05, P0-06, P0-03
- **Tech Stack:** React, TypeScript, Tailwind, file upload
- **Key Requirements:**
  - maintenance_requests table: title, description, priority, location, images
  - Submission form with image upload
  - Status tracking
  - Comment threads
  - Email notifications on creation/update
- **Acceptance Criteria:** 6 items
  - Request created
  - Images uploaded
  - Status tracked
  - Comments work
  - Notifications sent
- **Files Affected:** apps/web/app/(resident)/maintenance/submit/page.tsx, components/maintenance/*.tsx, lib/api/maintenance-requests.ts

### P3-51: Maintenance Request Admin
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-3-pm-mobile/51-maintenance-request-admin.md`
- **Feature:** Admin interface for maintenance request management
- **Dependencies:** P3-50
- **Tech Stack:** React, TypeScript, Tailwind
- **Key Requirements:**
  - Maintenance inbox with filtering
  - Assign to maintenance vendor
  - Update status
  - Add notes/replies
  - View request details and images
- **Acceptance Criteria:** 6 items
  - Inbox displays requests
  - Filtering works
  - Assignment works
  - Status updates work
  - Notifications sent
- **Files Affected:** apps/web/app/(admin)/maintenance/inbox/page.tsx, components/maintenance/Admin*.tsx, lib/api/admin-maintenance.ts

### P3-52: Contract & Vendor Tracking
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-3-pm-mobile/52-contract-vendor-tracking.md`
- **Feature:** Track contracts and vendor bids
- **Dependencies:** P0-05, P0-06
- **Tech Stack:** React, TypeScript, Drizzle ORM
- **Key Requirements:**
  - contracts table: vendor_name, start_date, end_date, amount, renewal_date
  - Track vendor bids/proposals
  - Contract renewal alerts
  - Document attachment
  - Vendor contact information
- **Acceptance Criteria:** 5 items
  - Contract created
  - Bids tracked
  - Alerts triggered
  - Documents attached
- **Files Affected:** apps/web/app/(admin)/contracts/page.tsx, components/contracts/*.tsx, lib/api/contracts.ts

### P3-53: Audit Trail Viewer
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-3-pm-mobile/53-audit-trail-viewer.md`
- **Feature:** Visual audit trail viewer
- **Dependencies:** P1-27
- **Tech Stack:** React, TypeScript, Tailwind
- **Key Requirements:**
  - Display audit logs in chronological order
  - Filter by user, action, resource type
  - Show before/after values
  - Search functionality
  - Timeline view
- **Acceptance Criteria:** 5 items
  - Logs displayed
  - Filters work
  - Search works
  - Before/after visible
  - Timeline renders
- **Files Affected:** apps/web/app/(admin)/audit-trail/page.tsx, components/audit/*.tsx, lib/api/audit-trail.ts

### P3-54: Performance Optimization
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-3-pm-mobile/54-performance-optimization.md`
- **Feature:** Comprehensive performance optimization
- **Dependencies:** P3-45, P3-46, P3-47, P3-48
- **Tech Stack:** TypeScript, Next.js, performance monitoring
- **Key Requirements:**
  - Code splitting with dynamic imports
  - Image optimization
  - Database query optimization
  - Caching strategies
  - Web Vitals monitoring
  - Bundle size analysis
- **Acceptance Criteria:** 5 items
  - LCP < 2.5s
  - FID < 100ms
  - CLS < 0.1
  - Bundle < 200KB
  - Performance metrics tracked
- **Files Affected:** apps/web/lib/performance/vitals-monitor.ts, next.config.js, middleware.ts, component refactors

---

## PHASE 4: HARDENING & DEPLOYMENT (10 specs)

Security hardening, testing, and production deployment.

### P4-55: Row-Level Security
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-4-hardening/55-row-level-security.md`
- **Feature:** Implement PostgreSQL RLS policies
- **Dependencies:** P0-06, P2-43
- **Tech Stack:** PostgreSQL, SQL, TypeScript
- **Key Requirements:**
  - Enable RLS on all tables
  - Create policies for each table
  - Users can only see their community's data
  - Admins can manage their community's data
  - Audit logs readable by admins only
  - Test RLS enforcement
- **Acceptance Criteria:** 5 items
  - RLS enabled on all tables
  - Policies created
  - Test data isolation
  - Unauthorized access blocked
- **Files Affected:** packages/db/migrations/add-rls-policies.sql, schema.ts, rls-validation.test.ts

### P4-56: Security Audit
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-4-hardening/56-security-audit.md`
- **Feature:** Comprehensive security audit
- **Dependencies:** P4-55
- **Tech Stack:** Security analysis tools
- **Key Requirements:**
  - CORS configuration
  - CSP headers
  - Input validation
  - Output encoding
  - Authentication review
  - API security review
  - Dependency vulnerability scan
- **Acceptance Criteria:** 4 items
  - Security audit completed
  - No critical issues
  - Recommendations documented
  - Fixes applied
- **Files Affected:** SECURITY_AUDIT.md, middleware.ts, validation/zod-schemas.ts

### P4-57: RBAC Audit
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-4-hardening/57-rbac-audit.md`
- **Feature:** Audit and document role-based access control
- **Dependencies:** P4-56, P1-25
- **Tech Stack:** TypeScript
- **Key Requirements:**
  - Document RBAC matrix: role × community_type × resource → permissions
  - Implement checkPermission() utility
  - Unit tests for each role/resource combo
  - Audit trail integration
- **Acceptance Criteria:** 4 items
  - RBAC matrix documented
  - Tests comprehensive
  - No gaps in coverage
  - Audit logs all access decisions
- **Files Affected:** apps/web/lib/db/access-control.ts, __tests__/rbac.test.ts, RBAC_MATRIX.md

### P4-58: Integration Tests
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-4-hardening/58-integration-tests.md`
- **Feature:** Comprehensive integration tests
- **Dependencies:** P4-57
- **Tech Stack:** Jest, TypeScript, test fixtures
- **Key Requirements:**
  - Full flow tests: signup → provision → login → upload → compliance
  - Document upload and extraction flow
  - Compliance checklist auto-generation
  - Role isolation verification
  - Error handling verification
- **Acceptance Criteria:** 4 items
  - Integration test suite runs
  - All critical paths covered
  - Tests pass
  - Coverage > 80%
- **Files Affected:** apps/web/__tests__/integration/*.test.ts, fixtures/community-fixtures.ts

### P4-59: CI/CD Pipeline
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-4-hardening/59-ci-cd-pipeline.md`
- **Feature:** Set up GitHub Actions CI/CD
- **Dependencies:** P4-58
- **Tech Stack:** GitHub Actions, TypeScript, Turbo
- **Key Requirements:**
  - Lint on PR
  - Type check on PR
  - Tests on PR
  - Build on PR
  - Deploy to staging on merge to main
  - Turbo cache for faster builds
- **Acceptance Criteria:** 6 items
  - CI runs on PR
  - Tests pass before merge
  - Staging deploys on main
  - Build artifacts cached
- **Files Affected:** .github/workflows/ci.yml, deploy.yml, turbo.json

### P4-60: Production Deployment
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-4-hardening/60-production-deployment.md`
- **Feature:** Set up production deployment
- **Dependencies:** P4-59
- **Tech Stack:** Vercel, Next.js
- **Key Requirements:**
  - Deploy to Vercel
  - Environment variables configured
  - Database migrations run
  - CDN configured
  - Monitoring enabled
  - Rollback plan
- **Acceptance Criteria:** 6 items
  - Production deployment successful
  - Site accessible
  - Monitoring working
  - Performance acceptable
- **Files Affected:** vercel.json, .env.example, DEPLOYMENT.md

### P4-61: Demo Reset Script
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-4-hardening/61-demo-reset-script.md`
- **Feature:** Reset demo data periodically
- **Dependencies:** P1-29, P2-44
- **Tech Stack:** TypeScript, Drizzle ORM
- **Key Requirements:**
  - Delete all user-created data
  - Preserve schema
  - Reseed demo data
  - Optional: GitHub Actions cron
  - Vercel cron integration
- **Acceptance Criteria:** 5 items
  - Script runs successfully
  - Data reset completely
  - Demo data reseeded
  - Cron working
- **Files Affected:** scripts/reset-demo.ts, fixtures/demo-data.json, .github/workflows/reset-demo.yml

### P4-62: Load Testing
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-4-hardening/62-load-testing.md`
- **Feature:** Load test the application
- **Dependencies:** P4-60
- **Tech Stack:** k6 (or similar), performance testing
- **Key Requirements:**
  - Simulate 1000 concurrent users
  - Test signup flow
  - Test document upload flow
  - Test compliance queries
  - Identify bottlenecks
  - Generate performance report
- **Acceptance Criteria:** 5 items
  - Load test completed
  - Response times acceptable
  - No errors under load
  - Database performance acceptable
  - Report documented
- **Files Affected:** scripts/load-tests/k6-script.js, LOAD_TEST_RESULTS.md

### P4-63: Accessibility Audit
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-4-hardening/63-accessibility-audit.md`
- **Feature:** Audit and fix accessibility issues
- **Dependencies:** P3-54
- **Tech Stack:** axe-core, Jest, TypeScript
- **Key Requirements:**
  - Automated accessibility tests
  - Manual testing
  - WCAG 2.1 AA compliance
  - Keyboard navigation
  - Screen reader support
  - Color contrast
  - Form labels and ARIA
- **Acceptance Criteria:** 5 items
  - axe tests pass
  - Manual audit completed
  - Issues documented
  - Fixes applied
  - WCAG AA certified
- **Files Affected:** apps/web/__tests__/accessibility/axe-audit.test.ts, ACCESSIBILITY.md

### P4-64: Data Export
- **File:** `/sessions/great-focused-hamilton/mnt/PropertyPro/specs/phase-4-hardening/64-data-export.md`
- **Feature:** Allow data export for compliance
- **Dependencies:** P0-06
- **Tech Stack:** React, TypeScript, CSV generation
- **Key Requirements:**
  - Export users to CSV
  - Export documents to CSV
  - Export audit logs to CSV
  - Date range filtering
  - Format options (CSV, JSON)
  - Download functionality
- **Acceptance Criteria:** 5 items
  - Export dialog displays
  - CSV generated correctly
  - All rows included
  - Date filtering works
  - Downloads successfully
- **Files Affected:** apps/web/app/(admin)/export/page.tsx, lib/api/export.ts, services/csv-generator.ts

---

## SUMMARY STATISTICS

| Phase | Count | Key Focus |
|-------|-------|-----------|
| Phase 0 | 9 | Foundation infrastructure, design system, database, auth |
| Phase 1 | 21 | Compliance core, document management, resident portal |
| Phase 2 | 15 | Multi-tenancy, SaaS, billing, self-service signup |
| Phase 3 | 10 | Property manager features, mobile optimization |
| Phase 4 | 10 | Security hardening, testing, production deployment |
| **Total** | **65** | Complete PropertyPro application |

## KEY TECH STACK

**Frontend:**
- Next.js 14+ with App Router
- React 18+
- TypeScript
- Tailwind CSS
- React Email for email templates

**Backend:**
- Node.js
- Drizzle ORM
- PostgreSQL
- Supabase for auth/storage

**Infrastructure:**
- Vercel for hosting
- Supabase for database
- Stripe for payments
- Sentry for error tracking
- GitHub Actions for CI/CD
- Upstash for rate limiting

## DEPENDENCY TREE

```
Phase 0: Foundation (no dependencies)
  ├─ P0-00: Monorepo Scaffold
  ├─ P0-01: Design Tokens (depends P0-00)
  ├─ P0-02: Core Primitives (depends P0-01)
  ├─ P0-03: Priority Components (depends P0-02)
  ├─ P0-04: Supabase Setup (depends P0-00)
  ├─ P0-05: Drizzle Schema (depends P0-04)
  ├─ P0-06: Scoped Query Builder (depends P0-05)
  ├─ P0-07: Error Handling (depends P0-00)
  └─ P0-08: Sentry Setup (depends P0-07)

Phase 1: Compliance Core (depends P0)
  ├─ P1-09: Compliance Checklist (depends P0-05, P0-06)
  ├─ P1-10: Compliance Dashboard (depends P1-09, P0-03)
  ├─ P1-11: Document Upload Pipeline (depends P0-04, P0-06)
  ├─ P1-12: Magic Bytes Validation (depends P1-11)
  ├─ P1-13: Document Text Extraction (depends P1-11, P0-05)
  ├─ P1-14: Document Search (depends P1-13, P0-06)
  ├─ P1-15: Document Management UI (depends P1-11, P1-12, P1-14, P0-03)
  ├─ P1-16: Meeting Management (depends P0-05, P0-06, P1-09)
  ├─ P1-17: Announcement System (depends P0-05, P0-06, P0-03)
  ├─ P1-18: Resident Management (depends P0-04, P0-05, P0-06)
  ├─ P1-19: CSV Import (depends P1-18)
  ├─ P1-20: Invitation Auth (depends P1-18, P0-04)
  ├─ P1-21: Password Reset (depends P0-04)
  ├─ P1-22: Session Management (depends P0-04)
  ├─ P1-23: Public Website (depends P0-05, P0-03, P1-16)
  ├─ P1-24: Resident Portal Dashboard (depends P0-03, P1-17, P1-16, P0-06)
  ├─ P1-25: Resident Document Library (depends P1-14, P1-15, P0-06)
  ├─ P1-26: Notification Preferences (depends P0-05, P1-18)
  ├─ P1-27: Audit Logging (depends P0-05, P0-06)
  ├─ P1-28: Email Infrastructure (depends P0-00)
  └─ P1-29: Demo Seed Data (depends P1-09, P1-10, P1-11, P1-12)

Phase 2: Multi-Tenancy (depends P0, P1)
  ├─ P2-30: Subdomain Routing (depends P0-04, P0-06)
  ├─ P2-31: Marketing Landing Page (depends P0-03)
  ├─ P2-32: Legal Pages (depends P0-00)
  ├─ P2-33: Self-Service Signup (depends P2-31, P0-04)
  ├─ P2-34: Stripe Integration (depends P2-33)
  ├─ P2-35: Provisioning Pipeline (depends P2-34, P0-05, P0-06)
  ├─ P2-36: Apartment Operations Dashboard (depends P0-03, P0-05, P0-06)
  ├─ P2-37: Lease Tracking (depends P0-05, P0-06)
  ├─ P2-38: Apartment Onboarding (depends P2-35, P2-36, P2-37)
  ├─ P2-39: Condo Onboarding (depends P2-35, P1-09)
  ├─ P2-40: Community Features Config (depends P0-05)
  ├─ P2-41: Email Notifications (depends P1-28, P1-26)
  ├─ P2-42: Rate Limiting (depends P0-07)
  ├─ P2-43: Multi-Tenant Isolation Tests (depends P0-06, P2-30)
  └─ P2-44: Apartment Demo Seed (depends P2-36, P2-37, P1-29)

Phase 3: PM & Mobile (depends P0-3)
  ├─ P3-45: PM Portfolio Dashboard (depends P0-03, P0-06, P2-40)
  ├─ P3-46: PM Community Switcher (depends P3-45)
  ├─ P3-47: White-Label Branding (depends P3-45, P0-05)
  ├─ P3-48: Phone Frame Mobile Preview (depends P0-03, P1-24, P2-40)
  ├─ P3-49: Mobile Layouts (depends P3-48, P0-02, P0-03)
  ├─ P3-50: Maintenance Request Submission (depends P0-05, P0-06, P0-03)
  ├─ P3-51: Maintenance Request Admin (depends P3-50)
  ├─ P3-52: Contract & Vendor Tracking (depends P0-05, P0-06)
  ├─ P3-53: Audit Trail Viewer (depends P1-27)
  └─ P3-54: Performance Optimization (depends P3-45, P3-46, P3-47, P3-48)

Phase 4: Hardening (depends P0-3)
  ├─ P4-55: Row-Level Security (depends P0-06, P2-43)
  ├─ P4-56: Security Audit (depends P4-55)
  ├─ P4-57: RBAC Audit (depends P4-56, P1-25)
  ├─ P4-58: Integration Tests (depends P4-57)
  ├─ P4-59: CI/CD Pipeline (depends P4-58)
  ├─ P4-60: Production Deployment (depends P4-59)
  ├─ P4-61: Demo Reset Script (depends P1-29, P2-44)
  ├─ P4-62: Load Testing (depends P4-60)
  ├─ P4-63: Accessibility Audit (depends P3-54)
  └─ P4-64: Data Export (depends P0-06)
```

---

## ACCEPTANCE CRITERIA MATRIX

Each specification includes 4-7 acceptance criteria that must pass. All specs use:
- `pnpm test` for running tests
- `pnpm typecheck` for TypeScript validation
- Manual testing for UI components
- Integration tests for cross-service flows

---

**Document Generated:** 2026-02-09
**Total Specifications Analyzed:** 65
**Specifications with Unique Dependencies:** 65
**Average Files per Spec:** 4-6 files
**Total Expected Files:** ~320+ across entire codebase

