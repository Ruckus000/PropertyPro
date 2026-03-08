# Workstream 71: Package and Visitor Logging

**Complexity:** Small
**Tier:** 3 (defer — assess after Tier 1 ships)
**Migration Range:** 0086-0090
**Depends on:** WS 65 (RBAC resources, feature flags, test harness)

---

## 1. Objective And Business Outcome

Enable front desk/concierge tracking of package deliveries and visitor check-ins for managed communities, particularly apartments and staffed condos.

---

## 2. In Scope

- Package intake logging (carrier, tracking number, unit, recipient)
- Package pickup confirmation with timestamp
- Notification to resident on package arrival
- Visitor pass creation (name, purpose, expected arrival, host unit)
- Visitor check-in/check-out logging
---

## 3. Out Of Scope

- Physical access control integration (key fobs, gate systems)
- Package locker hardware integration
- Visitor photo capture
- Background check integration
- Data retention policies (configurable auto-purge for visitor logs) — deferred; requires policy engine design and legal review of retention periods before implementation

---

## 4. Dependencies

| Dependency | Source | Status |
|---|---|---|
| `packages` and `visitors` RBAC resources | WS 65 | Must land first |
| `hasPackageLogging` and `hasVisitorLogging` feature flags | WS 65 | Must land first |
| Notification service | Existing | Available |

---

## 5. Data Model And Migrations

### New Tables (migrations 0086-0090 range)

**package_log** — Package tracking
- id, communityId, unitId, recipientName, carrier, trackingNumber, status (received/notified/picked_up), receivedByStaffId, pickedUpAt, pickedUpByName, notes, createdAt, updatedAt, deletedAt

**visitor_log** — Visitor tracking
- id, communityId, visitorName, purpose, hostUnitId, hostUserId, expectedArrival, checkedInAt, checkedOutAt, passCode, staffUserId, notes, createdAt, updatedAt, deletedAt

---

## 6. API Contracts

```
# Packages
POST   /api/v1/packages                — Log package receipt
GET    /api/v1/packages                — List packages (filtered by status, unit)
PATCH  /api/v1/packages/:id/pickup     — Confirm pickup
GET    /api/v1/packages/my             — My pending packages (resident view)

# Visitors
POST   /api/v1/visitors                — Create visitor pass
GET    /api/v1/visitors                — List visitor log
PATCH  /api/v1/visitors/:id/checkin    — Check in visitor
PATCH  /api/v1/visitors/:id/checkout   — Check out visitor
GET    /api/v1/visitors/my             — My expected visitors (resident view)
```

---

## 7. Authorization + RLS Policy Family Mapping

### Packages

| Role | Log Receipt | View All | View Own Unit | Confirm Pickup |
|---|---|---|---|---|
| owner | no | no | yes | no |
| tenant | no | no | yes | no |
| board_member | no | no | no | no |
| board_president / cam | yes | yes | yes | yes |
| site_manager | yes | yes | yes | yes |
| property_manager_admin | yes | yes | yes | yes |

### Visitors

| Role | Create Pass | View Log | View Own | Check In/Out |
|---|---|---|---|---|
| owner | yes (own unit) | no | yes | no |
| tenant | yes (own unit) | no | yes | no |
| board_member | no | no | no | no |
| board_president / cam | yes | yes | yes | yes |
| site_manager | yes | yes | yes | yes |
| property_manager_admin | yes | yes | yes | yes |

### RLS Policy Families

- `package_log` → `tenant_admin_write` (staff create, residents read own unit)
- `visitor_log` → `tenant_admin_write` (staff manage, residents read own)

---

## 10. Testing Plan

### Seed Strategy
- Add 2-3 packages and 2-3 visitor entries per community

### Teardown Rules
- Standard cascade delete

### Tenant Isolation Matrix
- communityA packages/visitors not visible to communityB
- Residents see only their own unit's packages and visitors

### Concurrency Cases
- Double pickup confirmation → idempotent (already picked up returns success)

### Environment Requirements
- `DATABASE_URL` only

### Required Test Coverage
- Package lifecycle: receive → notify → pickup (integration)
- Visitor lifecycle: pass → check-in → check-out (integration)
- Notification delivery on package arrival (capture sink assertion)
- Cross-tenant isolation (integration)
- Resident view filtering (integration)

---

## 12. Definition Of Done + Evidence Required

- [ ] Package logging with receipt, notification, and pickup
- [ ] Visitor pass creation and check-in/check-out
- [ ] Resident notification on package arrival
- [ ] No-mock integration tests
- [ ] Cross-tenant isolation tests
- [ ] RLS policies for new tables
- [ ] Audit logging for mutations
- [ ] Feature flags enforcement
- [ ] Evidence doc in `docs/audits/phase5-71-YYYY-MM-DD.md`
