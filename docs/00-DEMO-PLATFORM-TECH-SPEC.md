# PropertyPro Florida — Demo Platform Technical Specification

**Version:** 1.0 (Draft)
**Date:** February 2026
**Status:** Pre-Development Planning

---

## 1. Executive Summary

This document specifies the technical requirements for building a **functional demo platform** for PropertyPro Florida—a compliance and community management platform for Florida condominium associations.

**Critical Context:** There is no working product yet. This spec defines what must be built to support sales demonstrations and market validation before committing to full production development.

### 1.1 Demo Objectives

The demo platform must:

1. Demonstrate compliance with Florida Statute §718.111(12)(g) requirements
2. Showcase the mobile app differentiator (push notifications, native experience)
3. Support live demonstrations with realistic, pre-populated data
4. Enable the "pre-built portal" sales approach (showing prospects their actual community)
5. Validate product-market fit before full development investment

### 1.2 Scope Boundaries

| In Scope (Demo) | Out of Scope (Production Later) |
|-----------------|--------------------------------|
| Compliance dashboard with statutory checklist | E-voting module |
| Document upload and management | Payment processing (Stripe integration) |
| Owner portal with individual credentials | Amenity reservations |
| Public-facing website with Notices | Violation tracking |
| Mobile app (iOS + Android) with push notifications | Package/visitor logging |
| Announcement system | Digital signage integration |
| Basic maintenance request tracking | Full multi-tenant SaaS architecture |
| Property Manager dashboard (portfolio view) | Automated billing/subscriptions |
| White-label branding configuration | Advanced analytics/reporting |

---

## 2. Florida Statutory Compliance Requirements

### 2.1 Source Statutes

- **Primary:** Florida Statute §718.111(12)(g) — Condominium Act website requirements
- **Secondary:** Florida Statute §720.303(4)(b) — HOA website requirements
- **Recent Amendments:** HB 913 (2025), HB 1021 (2024)

### 2.2 Technical Requirements from Statute

The statute mandates the following technical capabilities:

| Requirement | Statute Reference | Implementation |
|-------------|-------------------|----------------|
| Independent website OR third-party portal | §718.111(12)(g)(1) | Platform provides dedicated subdomain per association |
| Accessible through the internet | §718.111(12)(g)(1) | Standard web hosting with HTTPS |
| Protected electronic location (inaccessible to public) | §718.111(12)(g)(1) | Password-protected owner portal |
| Unique username and password per owner | §718.111(12)(g)(1) | Individual credential management |
| Access restricted to owners and authorized employees | §718.111(12)(g)(1) | Role-based access control |

### 2.3 Required Documents — Password-Protected Portal

All documents must be posted within **30 days** of creation/receipt (per HB 913).

| # | Document Type | Retention | Statute Reference |
|---|---------------|-----------|-------------------|
| a | Declaration of condominium and amendments | Permanent | §718.111(12)(g)(2)(a) |
| b | Bylaws and amendments | Permanent | §718.111(12)(g)(2)(b) |
| c | Articles of incorporation and amendments | Permanent | §718.111(12)(g)(2)(c) |
| d | Rules and regulations | Current | §718.111(12)(g)(2)(d) |
| e | Approved meeting minutes (rolling 12 months) | Rolling 12 months | §718.111(12)(g)(2)(e) |
| f | Video recordings of virtual meetings (rolling 12 months) | Rolling 12 months | §718.111(12)(g)(2)(f) |
| g | Affidavits required by Chapter 718 | Per statute | §718.111(12)(g)(2)(g) |
| h | Annual budget | Current | §718.112(2)(f) |
| i | Annual financial report | Current | §718.111(13) |
| j | Current insurance policies | Current | §718.111(11) |
| k | List of executory contracts | Current | §718.111(12)(g)(2) |
| l | Conflict of interest contracts | Current | §718.3026 |
| m | Bids received (after bidding closes) | Rolling 12 months | §718.111(12)(g)(2) |
| n | Structural/milestone inspection reports | 15 years | §553.899, §718.301(4)(p) |
| o | SIRS (Structural Integrity Reserve Study) | 15 years | §718.112(2)(g) |
| p | Question and answer sheet | Current | §718.504 |

### 2.4 Public-Facing Website Requirements

| Requirement | Timing | Reference |
|-------------|--------|-----------|
| Meeting notices + agendas (owner meetings) | 14 days before meeting | §718.111(12)(g)(2) |
| Meeting notices + agendas (board meetings) | 48 hours before meeting | §718.112 |
| Documents for owner vote | 7 days before meeting | §718.111(12)(g)(2) |
| Page labeled "Notices" linked from home page | Always visible | §718.111(12)(g)(2) |

---

## 3. Technical Architecture

### 3.1 Recommended Tech Stack

**Web Application:**
- Framework: Next.js 14+ (App Router) with TypeScript
- Styling: Tailwind CSS
- UI Components: shadcn/ui
- State Management: React Query (TanStack Query) for server state

**Mobile Application:**
- Framework: React Native with Expo
- Navigation: Expo Router
- Push Notifications: Expo Notifications → APNs (iOS) / FCM (Android)

**Backend / API:**
- Runtime: Node.js
- Database: PostgreSQL (via Supabase for rapid development)
- ORM: Prisma
- Authentication: NextAuth.js with email + password
- File Storage: Supabase Storage or AWS S3
- Email: Resend

**Infrastructure:**
- Hosting: Vercel (web) + Expo Application Services (mobile)
- Database: Supabase (managed Postgres)
- CDN: Cloudflare

### 3.2 Multi-Tenancy Approach

**For Demo:** Simplified single-database with `association_id` foreign key isolation.

**Architecture Diagram:**
```
┌─────────────────────────────────────────────────────────┐
│                  PropertyPro Platform                    │
├─────────────┬──────────────────┬────────────────────────┤
│ Public Site │   Owner Portal   │   Admin Dashboard      │
│ (no auth)   │  (owner auth)    │  (board/CAM auth)      │
├─────────────┴──────────────────┴────────────────────────┤
│                      API Layer                           │
├─────────────────────────────────────────────────────────┤
│               PostgreSQL (tenant-isolated)               │
├─────────────────────────────────────────────────────────┤
│              File Storage (S3/Supabase)                  │
└─────────────────────────────────────────────────────────┘
         │                              │
    ┌────┴─────┐                  ┌─────┴──────┐
    │ iOS App  │                  │ Android App │
    └──────────┘                  └────────────┘
```

### 3.3 URL Structure

| URL Pattern | Purpose |
|-------------|---------|
| `[subdomain].getpropertypro.com` | Association public site + portal |
| `pm.getpropertypro.com` | Property manager dashboard |
| `app.getpropertypro.com` | Platform admin (internal) |
| Mobile App: "PropertyPro" | Single app, association selected at login |

---

## 4. Database Schema (Core Tables)

### 4.1 Tenant & Authentication

```sql
-- Associations (tenants)
associations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  association_type ENUM('condo_718', 'hoa_720'),
  unit_count INTEGER,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT DEFAULT 'FL',
  zip TEXT,
  county TEXT,
  subdomain TEXT UNIQUE NOT NULL,
  custom_domain TEXT UNIQUE,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#0F4C75',
  timezone TEXT DEFAULT 'America/New_York',
  property_manager_id UUID REFERENCES property_managers(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- Property Management Companies
property_managers (
  id UUID PRIMARY KEY,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  subdomain TEXT UNIQUE,
  logo_url TEXT,
  primary_color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- Users
users (
  id UUID PRIMARY KEY,
  association_id UUID REFERENCES associations(id),
  property_manager_id UUID REFERENCES property_managers(id),
  email TEXT NOT NULL,
  password_hash TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  role ENUM('owner', 'board_member', 'board_president', 'cam', 'property_manager_admin'),
  unit_number TEXT,
  is_renter BOOLEAN DEFAULT FALSE,
  email_verified BOOLEAN DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(association_id, email)
)
```

### 4.2 Documents & Compliance

```sql
-- Document Categories (Florida statute-aligned)
document_categories (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  statute_reference TEXT,
  is_required BOOLEAN DEFAULT TRUE,
  retention_period TEXT, -- 'permanent', 'rolling_12_months', '15_years', 'current'
  access_level ENUM('public', 'owner_only', 'board_only'),
  display_order INTEGER,
  association_type_filter ENUM('condo_718', 'hoa_720', 'both') DEFAULT 'both',
  created_at TIMESTAMPTZ DEFAULT NOW()
)

-- Documents
documents (
  id UUID PRIMARY KEY,
  association_id UUID REFERENCES associations(id) NOT NULL,
  category_id UUID REFERENCES document_categories(id),
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_size INTEGER,
  file_type TEXT,
  uploaded_by UUID REFERENCES users(id),
  is_current BOOLEAN DEFAULT TRUE,
  version INTEGER DEFAULT 1,
  effective_date DATE,
  expiration_date DATE,
  posted_at TIMESTAMPTZ DEFAULT NOW(),
  statute_deadline TIMESTAMPTZ, -- created_at + 30 days
  compliance_status ENUM('compliant', 'pending', 'overdue'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
)

-- Compliance Checklist Items
compliance_checklist_items (
  id UUID PRIMARY KEY,
  association_id UUID REFERENCES associations(id) NOT NULL,
  requirement_name TEXT NOT NULL,
  statute_reference TEXT,
  category TEXT,
  is_satisfied BOOLEAN DEFAULT FALSE,
  satisfied_at TIMESTAMPTZ,
  satisfied_by_document_id UUID REFERENCES documents(id),
  notes TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 4.3 Meetings & Communications

```sql
-- Meetings
meetings (
  id UUID PRIMARY KEY,
  association_id UUID REFERENCES associations(id) NOT NULL,
  title TEXT NOT NULL,
  meeting_type ENUM('board', 'owner', 'committee', 'annual', 'special'),
  scheduled_date TIMESTAMPTZ NOT NULL,
  location TEXT,
  is_virtual BOOLEAN DEFAULT FALSE,
  video_conference_url TEXT,
  video_recording_url TEXT,
  agenda_document_id UUID REFERENCES documents(id),
  minutes_document_id UUID REFERENCES documents(id),
  minutes_approved BOOLEAN DEFAULT FALSE,
  notice_posted_at TIMESTAMPTZ,
  notice_deadline TIMESTAMPTZ, -- calculated based on meeting type
  notice_compliance_status ENUM('compliant', 'pending', 'overdue'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- Announcements
announcements (
  id UUID PRIMARY KEY,
  association_id UUID REFERENCES associations(id) NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  author_id UUID REFERENCES users(id),
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  is_pinned BOOLEAN DEFAULT FALSE,
  send_push_notification BOOLEAN DEFAULT FALSE,
  send_email BOOLEAN DEFAULT FALSE,
  target_audience ENUM('all', 'owners_only', 'board_only') DEFAULT 'all',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- Push Notification Tokens
push_notification_tokens (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) NOT NULL,
  token TEXT NOT NULL,
  platform ENUM('ios', 'android'),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

### 4.4 Maintenance Requests

```sql
-- Maintenance Requests
maintenance_requests (
  id UUID PRIMARY KEY,
  association_id UUID REFERENCES associations(id) NOT NULL,
  submitted_by UUID REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  category ENUM('plumbing', 'electrical', 'hvac', 'structural', 'landscaping',
                'pest_control', 'common_area', 'elevator', 'pool', 'parking', 'other'),
  priority ENUM('low', 'medium', 'high', 'emergency') DEFAULT 'medium',
  status ENUM('submitted', 'acknowledged', 'in_progress', 'completed', 'closed') DEFAULT 'submitted',
  unit_number TEXT,
  location_description TEXT,
  assigned_to UUID REFERENCES users(id),
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

-- Maintenance Request Images
maintenance_request_images (
  id UUID PRIMARY KEY,
  maintenance_request_id UUID REFERENCES maintenance_requests(id) NOT NULL,
  image_url TEXT NOT NULL,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

---

## 5. Application Screens & Features

### 5.1 Public-Facing Website (No Authentication)

**Required Pages:**

1. **Home Page**
   - Association name and logo
   - Address and contact information
   - Community photo/banner
   - Prominent link to "Notices" page (statutory requirement)
   - Login button for owner portal

2. **Notices Page** (labeled "Notices" per statute)
   - Upcoming meeting notices with dates
   - Meeting agendas (downloadable)
   - Documents pending owner vote (7+ days before)
   - Posted in reverse chronological order

3. **Contact Page**
   - Board contact information OR
   - Management company contact
   - Emergency contacts

4. **Login Page**
   - Email/password authentication
   - "Forgot password" flow
   - Link to mobile app download

### 5.2 Owner Portal (Authenticated)

**Dashboard:**
- Welcome message with association name
- Recent announcements (pinned first)
- Upcoming meetings with countdown
- Quick links to governing documents
- Compliance status indicator (for board members)

**Documents Section:**
- Browse by category (statute-aligned)
- Search across all documents
- PDF viewer (in-browser)
- Download option
- Document dates and version indicators
- **Renter access:** Limited to declaration, rules, inspection reports per statute

**Meetings Section:**
- List view of upcoming and past meetings
- Each meeting shows: date, type, location, agenda, minutes, video link
- Calendar view option

**Announcements:**
- Chronological feed
- Push notification indicator

**Maintenance Requests (if enabled):**
- Submit new request (title, description, category, photos)
- View status of existing requests
- Comment thread on each request

**Profile:**
- Update email, phone, notification preferences
- Change password
- Push notification opt-in/out

### 5.3 Admin Dashboard (Board Members + CAMs)

**Compliance Dashboard (Key Screen):**
- Visual checklist organized by statute section
- Traffic light status: Green (compliant), Yellow (due within 30 days), Red (overdue/missing)
- Overall compliance score percentage
- Click any item to upload required document
- Automatic deadline tracking (30-day posting rule)
- Meeting notice deadline tracking
- Alert banner for overdue items
- Export compliance report (PDF)

**Document Management:**
- Drag-and-drop upload (multi-file)
- Auto-category suggestion
- Set effective date, expiration date
- Version control (new version archives old)
- Bulk upload for onboarding
- File limits: 50MB per file, PDF/DOC/DOCX/XLS/XLSX/images

**Meeting Management:**
- Create meeting (type, date, location, virtual link)
- Attach agenda document
- Auto-calculate notice deadline with warnings
- Post-meeting: upload minutes, mark approved, auto-publish
- Upload/link video recording
- Track 12-month rolling window

**Announcement Composer:**
- Rich text editor
- Email blast option
- Push notification trigger
- Schedule for future
- Target audience selection

**Owner/Resident Management:**
- Add/edit/remove owners
- Assign unit numbers
- Generate credentials (statutory requirement)
- CSV bulk import
- Track login activity
- Manage renter accounts (limited access)

**Maintenance Request Management:**
- Request inbox
- Assign to board member
- Update status
- Internal notes (not visible to submitter)
- Resolution tracking

### 5.4 Property Manager Dashboard

**Portfolio Overview:**
- Grid/list of all managed communities
- Compliance status summary per community (traffic light)
- Quick stats: total units, registered owners, open maintenance requests
- Alerts for overdue compliance items

**Community Switcher:**
- Dropdown to switch between communities
- Each opens full admin dashboard for that community

**White-Label Settings:**
- Upload company logo
- Set company colors
- Configure subdomain or custom domain

### 5.5 Mobile Application (React Native / Expo)

**Screens:**

1. **Splash / Login**
   - Association-branded (logo, colors from API)
   - Email/password login
   - Association selection if managing multiple

2. **Home**
   - Announcements feed
   - Upcoming meetings
   - Quick action buttons

3. **Documents**
   - Browse by category
   - Search
   - PDF viewer (in-app)
   - Offline caching for recent documents

4. **Meetings**
   - Upcoming and past
   - Agenda/minutes links

5. **Maintenance**
   - Submit request with camera integration
   - View existing request status
   - Push notification on status change

6. **Notifications**
   - Push notification history

7. **Profile**
   - Settings
   - Notification preferences
   - Logout

**Push Notification Triggers:**
- New announcement posted
- Meeting notice published
- Maintenance request status update
- Document requiring attention uploaded

---

## 6. Demo Data Requirements

### 6.1 Fictional Association: "Palm Gardens Condominium Association"

**Association Details:**
- Name: Palm Gardens Condominium Association
- Location: 1500 Palm Gardens Drive, West Palm Beach, FL 33401
- Units: 50
- Type: Condo (§718)
- Subdomain: palmgardens.getpropertypro.com

**Pre-Populated Users:**

| Role | Name | Email | Unit |
|------|------|-------|------|
| Board President | Maria Santos | maria.santos@palmgardens-demo.com | 101 |
| Board Treasurer | Robert Chen | robert.chen@palmgardens-demo.com | 205 |
| Board Secretary | Linda Thompson | linda.thompson@palmgardens-demo.com | 312 |
| CAM | James Wilson | james.wilson@palmgardens-demo.com | N/A |
| Owner | Sarah Johnson | sarah.johnson@palmgardens-demo.com | 108 |
| Owner | Michael Brown | michael.brown@palmgardens-demo.com | 215 |
| Owner (Renter) | Emily Davis | emily.davis@palmgardens-demo.com | 304 |

**Pre-Populated Documents:**
- Declaration of Condominium (effective 2005)
- Bylaws (amended 2022)
- Articles of Incorporation (filed 2005)
- Rules and Regulations (current)
- Meeting Minutes (past 6 months, 6 documents)
- Annual Budget 2026
- Annual Financial Report 2025
- Insurance Policy (expires Dec 2026)
- Sample executory contracts (2-3)
- Milestone Inspection Report (2024)

**Pre-Populated Meetings:**
- 6 months of past board meetings with minutes
- 1 upcoming board meeting (next week)
- 1 upcoming annual meeting (next month)

**Pre-Populated Announcements:**
- Pool closure notice
- Hurricane preparedness reminder
- Assessment due date reminder
- Recent board meeting summary

**Pre-Populated Maintenance Requests:**
- 10 requests in various states (submitted, in progress, completed)
- Categories: pool, landscaping, parking, common area

**Compliance Status:**
- 92% compliant (deliberately show 2-3 yellow/red items to demo alerting)
- Missing: Q&A sheet (yellow), one insurance certificate update (red)

### 6.2 Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Board Admin | admin@palmgardens-demo.getpropertypro.com | demo2026 |
| Unit Owner | owner@palmgardens-demo.getpropertypro.com | demo2026 |
| Property Manager | pm@demo.getpropertypro.com | demo2026 |

### 6.3 Demo Reset

- Demo data resets nightly via automated seed script
- All uploaded documents during demos are cleared
- User accounts reset to default state

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

| Requirement | Implementation |
|-------------|----------------|
| HTTPS everywhere | Enforced at CDN level (Cloudflare) |
| Password hashing | bcrypt with appropriate cost factor |
| Session management | Secure httpOnly cookies |
| RBAC | Role-based checks on every API endpoint |
| Tenant isolation | PostgreSQL RLS policies + middleware validation |

### 7.2 Document Security

- S3/Supabase presigned URLs with 15-minute expiration
- No direct public URLs to document storage
- Access logging for audit trail

### 7.3 Password Requirements

- Minimum 8 characters (statutory: "unique username and password")
- Password reset via email link (30-minute expiry)

### 7.4 Data Privacy

- Owner PII (phone, email) visible only to board members and self
- Mailing addresses redacted per §718.111(12)(a)(7)
- Renter access limited per statute

---

## 8. API Design

### 8.1 Endpoint Patterns

```
GET    /api/v1/associations/:id
GET    /api/v1/associations/:id/documents
POST   /api/v1/associations/:id/documents
GET    /api/v1/associations/:id/meetings
POST   /api/v1/associations/:id/meetings
GET    /api/v1/associations/:id/announcements
POST   /api/v1/associations/:id/announcements
GET    /api/v1/associations/:id/maintenance-requests
POST   /api/v1/associations/:id/maintenance-requests
GET    /api/v1/associations/:id/compliance
GET    /api/v1/associations/:id/users
POST   /api/v1/associations/:id/users
```

### 8.2 Authentication Endpoints

```
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
GET    /api/v1/auth/me
```

### 8.3 Response Format

```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 100
  }
}

// Error response
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid credentials"
  }
}
```

---

## 9. Performance Requirements

| Metric | Target |
|--------|--------|
| Web LCP | < 2.5 seconds |
| API response (list) | p95 < 500ms |
| API response (detail) | p95 < 200ms |
| Document upload | Up to 50MB with progress |
| Mobile cold start | < 3 seconds |
| Document search | < 1 second |

---

## 10. Development Phases

### Phase 1: Core Demo (Target: 2-3 weeks)

**Week 1:**
- Project setup (Next.js, Supabase, Expo)
- Database schema creation
- Authentication system (login, registration, password reset)
- Basic association/tenant model

**Week 2:**
- Admin dashboard: compliance checklist
- Document upload and management
- Public website with Notices page
- Owner portal with document access

**Week 3:**
- Meeting management
- Announcement system
- Basic maintenance requests
- Demo data seeding
- Mobile app shell with core screens

### Phase 2: Sales-Ready Demo (Target: 1-2 weeks)

- Property Manager dashboard (portfolio view)
- White-label configuration
- Push notifications (mobile)
- Demo reset automation
- Polish and bug fixes
- Demo script preparation

### Phase 3: Pilot-Ready (Post-Validation)

- Full multi-tenant architecture
- Production security hardening
- Monitoring and logging
- Backup automation
- Customer onboarding workflow

---

## 11. File & Folder Structure

```
PropertyPro/
├── apps/
│   ├── web/                      # Next.js web application
│   │   ├── app/
│   │   │   ├── (public)/         # Public website routes
│   │   │   ├── (portal)/         # Owner portal routes
│   │   │   ├── (admin)/          # Admin dashboard routes
│   │   │   ├── (pm)/             # Property manager routes
│   │   │   └── api/              # API routes
│   │   ├── components/
│   │   │   ├── ui/               # shadcn/ui components
│   │   │   ├── compliance/       # Compliance-specific
│   │   │   ├── documents/        # Document management
│   │   │   └── shared/           # Shared components
│   │   ├── lib/
│   │   │   ├── auth/             # Authentication utilities
│   │   │   ├── db/               # Database client
│   │   │   ├── storage/          # File storage utilities
│   │   │   └── compliance/       # Compliance calculation logic
│   │   └── prisma/
│   │       └── schema.prisma
│   │
│   └── mobile/                   # React Native / Expo app
│       ├── app/                  # Expo Router screens
│       ├── components/
│       └── lib/
│
├── packages/
│   └── shared/                   # Shared types and constants
│       ├── types/
│       └── constants/
│           └── florida-compliance.ts
│
├── scripts/
│   └── seed-demo.ts              # Demo data seeding
│
└── docs/
    └── [this document]
```

---

## 12. Florida Compliance Constants

```typescript
// packages/shared/constants/florida-compliance.ts

export const FLORIDA_COMPLIANCE = {
  condo_718: {
    name: "Florida Condominium Act",
    statute: "Chapter 718, Florida Statutes",
    websiteThreshold: 25, // units (excluding timeshare)
    effectiveDate: "2026-01-01",
    documentPostingDeadlineDays: 30,
    meetingNotice: {
      ownerMeeting: { daysBeforeMeeting: 14 },
      boardMeeting: { hoursBeforeMeeting: 48 },
      ownerVoteDocuments: { daysBeforeMeeting: 7 },
    },
    requiredDocuments: [
      { id: "declaration", name: "Declaration of Condominium & Amendments",
        statuteRef: "§718.111(12)(g)(2)(a)", retention: "permanent", required: true },
      { id: "bylaws", name: "Bylaws & Amendments",
        statuteRef: "§718.111(12)(g)(2)(b)", retention: "permanent", required: true },
      { id: "articles", name: "Articles of Incorporation & Amendments",
        statuteRef: "§718.111(12)(g)(2)(c)", retention: "permanent", required: true },
      { id: "rules", name: "Rules & Regulations",
        statuteRef: "§718.111(12)(g)(2)(d)", retention: "current", required: true },
      { id: "minutes", name: "Approved Meeting Minutes (12 months)",
        statuteRef: "§718.111(12)(g)(2)(e)", retention: "rolling_12_months", required: true },
      { id: "video_recordings", name: "Video Recordings of Virtual Meetings",
        statuteRef: "§718.111(12)(g)(2)(f)", retention: "rolling_12_months", conditional: true },
      { id: "affidavits", name: "Affidavits Required by Chapter 718",
        statuteRef: "§718.111(12)(g)(2)(g)", retention: "per_statute", required: true },
      { id: "budget", name: "Annual Budget",
        statuteRef: "§718.112(2)(f)", retention: "current", required: true },
      { id: "financial_report", name: "Annual Financial Report",
        statuteRef: "§718.111(13)", retention: "current", required: true },
      { id: "insurance", name: "Current Insurance Policies",
        statuteRef: "§718.111(11)", retention: "current", required: true },
      { id: "contracts", name: "List of Executory Contracts",
        statuteRef: "§718.111(12)(g)(2)", retention: "current", required: true },
      { id: "conflict_contracts", name: "Conflict of Interest Contracts",
        statuteRef: "§718.3026", retention: "current", conditional: true },
      { id: "bids", name: "Bids Received (After Bidding Closed)",
        statuteRef: "§718.111(12)(g)(2)", retention: "rolling_12_months", conditional: true },
      { id: "inspection_reports", name: "Structural/Milestone Inspection Reports",
        statuteRef: "§553.899", retention: "15_years", conditional: true },
      { id: "sirs", name: "Structural Integrity Reserve Study (SIRS)",
        statuteRef: "§718.112(2)(g)", retention: "15_years", conditional: true },
      { id: "qa_sheet", name: "Question & Answer Sheet",
        statuteRef: "§718.504", retention: "current", required: true },
    ],
    enforcement: {
      regulatoryBody: "Division of Florida Condominiums, Timeshares, and Mobile Homes (DBPR)",
      dailyDamageMin: 50,
      dailyDamageMaxDays: 10,
    },
  },
  hoa_720: {
    name: "Florida Homeowners' Association Act",
    statute: "Chapter 720, Florida Statutes",
    websiteThreshold: 100, // parcels
    effectiveDate: "2025-01-01",
    documentPostingDeadlineDays: 30,
    // Similar structure to condo_718
  },
} as const;
```

---

## 13. Legal Disclaimers

Include these throughout the platform:

1. **On signup:** "PropertyPro helps you organize and publish documents required by Florida Statutes §718 and §720. This platform does not constitute legal advice. Consult with your association's attorney to confirm your specific compliance obligations."

2. **On compliance checklist:** "This checklist is based on our interpretation of Florida Statutes as of [date]. Laws change. Always verify requirements with legal counsel."

3. **Terms of Service:** Include limitation of liability for compliance failures.

---

## 14. Open Questions for Clarification

1. **Custom Domains:** Will we support custom domains in the demo phase, or subdomain-only?

2. **Mobile App Branding:** Single "PropertyPro" app with per-association branding, or white-labeled apps per PM company?

3. **Email Provider:** Resend vs AWS SES for transactional emails?

4. **Hosting Region:** Single region (us-east-1) sufficient, or multi-region needed?

5. **Document OCR:** Should we offer OCR for scanned PDFs to meet accessibility requirements?

6. **Offline Mobile:** How critical is offline document caching for the demo?

---

## 15. Success Criteria for Demo

The demo platform is ready for sales when:

- [ ] Compliance dashboard accurately tracks all §718 requirements with traffic-light status
- [ ] Documents can be uploaded, categorized, and viewed by authorized users
- [ ] Owner portal allows individual login with unique credentials
- [ ] Public website displays meeting notices per statutory requirements
- [ ] Mobile app supports push notifications for announcements
- [ ] Property Manager can view portfolio compliance status across multiple communities
- [ ] Demo data accurately represents a typical 50-unit Florida condo
- [ ] 15-minute demo script can be executed without errors
- [ ] Platform can be "pre-built" for a prospect using county clerk records

---

*Document Version: 1.0 Draft*
*Last Updated: February 2026*
