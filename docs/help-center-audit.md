# Help Center & Feature Discovery Audit

**Date:** 2026-03-21
**Scope:** Desktop + mobile help center, command palette, navigation, feature discoverability

---

## Executive Summary

PropertyPro has a **mobile-only help center** (FAQs + contact info) added in Phase 2, but **zero help infrastructure on desktop/web**. The command palette exists but is underutilized — only 2 quick actions, no help content, no data search. New users on desktop have no guided path to discover features beyond clicking through the sidebar.

**Verdict:** The foundation exists (FAQ schema, default content, admin CRUD), but it's trapped in mobile. Desktop users — the primary audience for board members, CAMs, and property managers — have no help system at all.

---

## 1. What Exists Today

### Mobile Help Center (Implemented)

| Component | Route | Status |
|-----------|-------|--------|
| FAQ page with search | `/mobile/help` | Working |
| Management contact info | `/mobile/help/contact` | Working |
| Admin FAQ management | `/mobile/help/manage` | Working (admin-only) |

- 5 default FAQs auto-seeded per community via `ensureFaqsExist()`
- Admins can create, edit, delete, and reorder FAQs
- FAQ search filters by question text
- Accordion UI with expand/collapse

### Desktop Help Center

**Does not exist.** No route, no component, no sidebar link.

### Command Palette (`Cmd+K`)

| Feature | Status |
|---------|--------|
| Page navigation | Working — pulls from `nav-config.ts`, role-filtered |
| Recent pages | Working — auto-populated from browsing history |
| Quick actions | 2 items only: "Upload Document", "Submit Maintenance Request" |
| Data search | Not implemented |
| Help/FAQ access | Not implemented |
| Keyboard hint | `Cmd+K` / `Ctrl+K` shown in UI |

### Navigation Sidebar

- Shows role-filtered menu items from `nav-config.ts`
- No "Help" or "Support" link
- No contextual help tooltips on menu items
- Settings accessible via user profile dropdown, not sidebar

### Empty States

13 predefined empty states in `apps/web/src/lib/constants/empty-states.ts`:
- Each has title, description, and optional action button
- Encourage action ("Let's get you compliant", "Add your first owner")
- Do NOT link to help documentation or explain "what is this?"

---

## 2. Content Coverage Gaps

### Default FAQs (5 total — all basic)

| FAQ | Covers |
|-----|--------|
| How do I submit a maintenance request? | Basic mobile flow |
| How do I view community documents? | Browse/search |
| How do I view upcoming meetings? | Calendar + past minutes |
| How do I update my notification preferences? | Email frequency |
| How do I change my password? | Reset flow |

### Missing FAQ/Help Topics

**For Owners/Tenants:**
- How do I pay my assessment/dues?
- How do I report a violation?
- How do I sign documents electronically?
- How do I track my maintenance request status?
- How do I view my lease information?
- How do I log a visitor or package?
- What is the compliance score and what does it mean?
- How do I access the transparency page?
- How do I export my data?

**For Board Members/Presidents:**
- How do I post a meeting notice (and stay compliant)?
- How do I manage violations and schedule hearings?
- How do I review the compliance dashboard?
- How do I manage community documents?
- How do I create and send announcements?
- How do I use e-sign templates?
- What are the Florida statute requirements?
- How do I view the audit trail?

**For CAMs/Property Managers:**
- How do I manage multiple communities?
- How do I run reports across communities?
- How do I bulk-post announcements or documents?
- How do I manage branding per community?
- How do I handle move-in/move-out checklists?
- How do I manage assessments and finance?
- How do I set up contracts and vendor tracking?

---

## 3. Command Palette Bugs & Issues

### No Duplicate Items Found
The command palette derives items from `NAV_ITEMS` in `nav-config.ts` with stable IDs. No duplication bug exists in the current implementation.

### Issues Found

1. **Only 2 quick actions hardcoded** — "Upload Document" and "Submit Maintenance Request". All other actions require navigating to the page first.

2. **No keyword synonyms** — Items only match on their display label. A user typing "broken" won't find "Submit Maintenance Request". No keyword arrays for natural language discovery.

3. **No data search** — Cannot search for a specific document by title, resident by name, or meeting by date.

4. **No help integration** — No FAQ results, no "How do I...?" suggestions.

5. **No empty query suggestions** — Opening `Cmd+K` with no input shows recent pages only. No role-relevant suggested actions for new users who don't know what to search for.

6. **No result categories for quick scan** — Pages and quick actions are in separate groups, but no icons or type badges to visually distinguish them at a glance.

---

## 4. Feature Inventory

### All User-Facing Features by Category

**Documents** — View library, search, filter by category, download, upload (admin)
**Meetings** — View calendar, past minutes, schedule meeting (admin), post notice (admin)
**Announcements** — View feed, pin/archive (admin), create/edit (admin), bulk post (PM)
**Maintenance** — Submit request, track status, photo attach, admin inbox, assign, resolve
**Compliance** — View score, document posting status, meeting notice compliance, required docs checklist
**Violations** — Report violation, view own violations, admin inbox, schedule hearing, issue fine, resolve
**E-Sign** — View pending signatures, sign documents, create templates (admin), track submissions (admin)
**Leases** — View lease info, upload lease (admin), track expiration (admin)
**Packages** — Log package (admin), view/claim packages
**Visitors** — Log visitor, view visitor log
**Payments** — View balance, pay assessment, manage payment method, admin finance dashboard
**Contracts** — Vendor tracking, contract management (admin)
**Move In/Out** — Checklists for unit turnover (admin)
**Assessments** — Dues scheduling, payment tracking (admin)
**Audit Trail** — Activity log (admin)
**Settings** — Profile, notifications, data export, transparency page
**Residents** — View roster, add owner/tenant (admin), import CSV (admin)

### Feature Count by Role

| Role | Accessible Features | Accessible Actions |
|------|--------------------|--------------------|
| Owner | ~12 pages | ~8 actions |
| Tenant | ~10 pages | ~6 actions |
| Board Member | ~20 pages | ~18 actions |
| Board President | ~20 pages | ~20 actions |
| CAM | ~22 pages | ~25 actions |
| Site Manager | ~18 pages | ~15 actions |
| PM Admin | ~25 pages | ~30 actions |

---

## 5. Recommendations

### P0 — Critical (Command Palette + Help Center)

1. **Build unified search API** (`/api/v1/search`) — query all entities server-side, return ranked results
2. **Expand command palette** — static registry with keyword synonyms, role-aware actions, data search results
3. **Create desktop help center route** — `/help` with FAQ display, search, category filtering
4. **Add "Help" to desktop sidebar** — visible to all roles

### P1 — High (Content & Discovery)

5. **Expand default FAQ library** — 30+ FAQs covering all features by role (see Section 2 gaps)
6. **Add empty query suggestions** — role-relevant quick actions shown when command palette opens
7. **Link empty states to help** — each empty state links to relevant FAQ or guide
8. **Add contextual help icons** — `?` icon on complex features linking to relevant help article

### P2 — Medium (Polish)

9. **Feature tours for new users** — optional guided walkthrough on first login
10. **"What's new" section** — highlight recently added features
11. **Search analytics** — track what users search for to identify content gaps
12. **Admin help content management on desktop** — port FAQ CRUD from mobile

---

## 6. Key File Locations

| Component | Path |
|-----------|------|
| Command palette | `apps/web/src/components/layout/command-palette.tsx` |
| Nav config | `apps/web/src/components/layout/nav-config.ts` |
| Sidebar | `apps/web/src/components/layout/app-sidebar.tsx` |
| Empty states | `apps/web/src/lib/constants/empty-states.ts` |
| Default FAQs | `packages/shared/src/default-faqs.ts` |
| FAQ schema | `packages/db/src/schema/faqs.ts` |
| FAQ service | `apps/web/src/lib/services/faq-service.ts` |
| FAQ API | `apps/web/src/app/api/v1/faqs/route.ts` |
| Mobile help | `apps/web/src/app/mobile/help/page.tsx` |
| Mobile help components | `apps/web/src/components/mobile/MobileHelpContent.tsx` |
| Document search | `packages/db/src/queries/document-search.ts` |
