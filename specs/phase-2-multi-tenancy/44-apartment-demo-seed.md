# Spec: P2-44 — Apartment Demo Seed

> Create seed script for a Sunset Ridge apartment demo instance with realistic operational data.

## Phase
2 — Multi-Tenancy & Self-Service

## Priority
P1

## Dependencies
- P2-36
- P2-37
- P1-29

## Functional Requirements
- Extend seed-demo.ts to create "Sunset Ridge Apartments" community
- Include: 20+ units across 3 floors, 15+ tenants with active leases
- 5+ announcements
- 8+ maintenance requests in various states
- Community rules document
- Move-in/out documents
- Lease expirations spread across next 6 months (some expiring soon for alerts)
- Demo user passwords in environment variables

## Acceptance Criteria
- [ ] Running seed creates complete apartment demo
- [ ] Operational dashboard shows realistic metrics
- [ ] Lease expiration alerts visible
- [ ] Maintenance requests in mixed states
- [ ] pnpm test passes

## Technical Notes
- Coordinate with P1-29 for demo data structure
- Use realistic floor/unit numbering (101, 102, 201, 202, etc.)
- Spread lease dates realistically across next 6 months

## Files Expected
- scripts/seed-demo.ts (extended)
- scripts/fixtures/apartment-demo-data.ts
- scripts/seed-apartment-demo.ts

## Attempts
0
