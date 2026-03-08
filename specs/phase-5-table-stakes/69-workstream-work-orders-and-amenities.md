# Workstream 69: Work Orders and Amenities

**Complexity:** Medium
**Tier:** 2 (expand)
**Migration Range:** 0070-0079
**Depends on:** WS 65 (RBAC resources, feature flags, test harness)

---

## 1. Objective And Business Outcome

Enable vendor dispatch work orders for maintenance beyond resident self-service requests, and amenity reservation management for shared community facilities.

---

## 2. In Scope

- Work order creation and assignment to vendors/staff
- Work order lifecycle: created → assigned → in_progress → completed → closed
- SLA tracking (target response time, target completion time)
- Vendor contact management (name, company, phone, email, specialties)
- Amenity definitions (pool, gym, clubhouse, tennis court, etc.)
- Reservation creation with time slots and capacity limits
- Reservation conflict detection
- Calendar view of reservations

---

## 3. Out Of Scope

- Vendor bidding/procurement (contracts exist in Phase 3)
- Amenity access control hardware integration (key fobs, gate systems)
- Recurring reservations
- Amenity fee collection (future enhancement, would integrate with WS 66)

---

## 4. Dependencies

| Dependency | Source | Status |
|---|---|---|
| `work_orders` and `amenities` RBAC resources | WS 65 | Must land first |
| `hasWorkOrders` and `hasAmenities` feature flags | WS 65 | Must land first |
| Test harness | WS 65 | Must land first |
| Existing maintenance_requests table | Phase 2 | Available (work orders are separate from maintenance requests) |

---

## 5. Data Model And Migrations

### New Tables (migrations 0070-0079 range)

**vendors** — Vendor directory
- id, communityId, name, company, phone, email, specialties (JSONB array), isActive, createdAt, updatedAt, deletedAt

**work_orders** — Dispatch work orders
- id, communityId, title, description, vendorId, assignedByUserId, priority (low/medium/high/urgent), status (created/assigned/in_progress/completed/closed), slaResponseHours, slaCompletionHours, assignedAt, startedAt, completedAt, closedAt, notes, createdAt, updatedAt, deletedAt

**amenities** — Bookable amenities
- id, communityId, name, description, location, capacity, isBookable, bookingRules (JSONB: minDurationMinutes, maxDurationMinutes, advanceBookingDays, blackoutDates), createdAt, updatedAt, deletedAt

**amenity_reservations** — Bookings
- id, communityId, amenityId, userId, unitId, startTime (timestamptz), endTime (timestamptz), status (confirmed/cancelled), notes, createdAt, updatedAt, deletedAt
- **Overlap prevention:** Use a PostgreSQL exclusion constraint with `tstzrange` to prevent double-booking at the DB level:
  ```sql
  ALTER TABLE amenity_reservations
    ADD CONSTRAINT no_overlapping_reservations
    EXCLUDE USING gist (
      amenity_id WITH =,
      tstzrange(start_time, end_time) WITH &&
    )
    WHERE (status = 'confirmed' AND deleted_at IS NULL);
  ```
  This requires the `btree_gist` extension (already available in Supabase). The application-level check remains as a user-friendly pre-validation, but the constraint is the authoritative guard against race conditions.

All tables: communityId FK, RLS enabled, soft-delete support.

---

## 6. API Contracts

```
# Vendors
POST   /api/v1/vendors                 — Add vendor
GET    /api/v1/vendors                 — List vendors
PATCH  /api/v1/vendors/:id            — Update vendor

# Work Orders
POST   /api/v1/work-orders            — Create work order
GET    /api/v1/work-orders            — List work orders
GET    /api/v1/work-orders/:id        — Get detail
PATCH  /api/v1/work-orders/:id        — Update status/assignment
POST   /api/v1/work-orders/:id/complete — Mark completed

# Amenities
POST   /api/v1/amenities              — Create amenity
GET    /api/v1/amenities              — List amenities
PATCH  /api/v1/amenities/:id          — Update amenity

# Reservations
POST   /api/v1/amenities/:id/reserve  — Create reservation
GET    /api/v1/amenities/:id/schedule — Get availability/schedule
DELETE /api/v1/reservations/:id       — Cancel reservation
GET    /api/v1/reservations           — My reservations
```

---

## 7. Authorization + RLS Policy Family Mapping

### Work Orders

| Role | Create | View | Assign | Update Status |
|---|---|---|---|---|
| owner / tenant | no | own unit related | no | no |
| board_member | yes | all | no | no |
| board_president / cam | yes | all | yes | yes |
| site_manager | yes | all | yes | yes |
| property_manager_admin | yes | all | yes | yes |

### Amenities & Reservations

| Role | Manage Amenities | Reserve | View Schedule | Cancel Own |
|---|---|---|---|---|
| owner / tenant | no | yes | yes | yes |
| board_president / cam | yes | yes | yes | yes (any) |
| site_manager | yes | yes | yes | yes (any) |

---

## 9. Failure Modes And Edge Cases

- Double-booking same amenity slot → check for overlapping `[startTime, endTime)` ranges before insert; return 409 on conflict
- Work order assigned to inactive vendor → reject with 422
- SLA breach notification → track elapsed time, emit notification when SLA threshold crossed
- Reservation in the past → reject with 422
- Cancellation after event start → allow but flag as late cancellation

---

## 10. Testing Plan

### Seed Strategy
- Add 1-2 vendors, 1-2 work orders, 2-3 amenities with reservations per community

### Teardown Rules
- Standard cascade delete

### Tenant Isolation Matrix
- communityA work orders/amenities not visible to communityB
- Reservations scoped to community

### Concurrency Cases
- Two reservations for overlapping time slots → only first succeeds (conflict check)
- SLA timer calculation during DST transition → use `date-fns` with community timezone

### Environment Requirements
- `DATABASE_URL` only

### Required Test Coverage
- Work order lifecycle: create → assign → complete → close (integration)
- SLA tracking and breach detection (integration)
- Reservation creation with conflict detection (integration)
- Cross-tenant isolation (integration)

---

## 12. Definition Of Done + Evidence Required

- [ ] Vendor management CRUD
- [ ] Work order lifecycle with SLA tracking
- [ ] Amenity management and reservation system
- [ ] Reservation conflict detection
- [ ] No-mock integration tests
- [ ] Cross-tenant isolation tests
- [ ] RLS policies for all new tables
- [ ] Audit logging for all mutations
- [ ] Feature flags (`hasWorkOrders`, `hasAmenities`) enforcement
- [ ] Evidence doc in `docs/audits/phase5-69-YYYY-MM-DD.md`
