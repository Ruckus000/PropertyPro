# Spec: P2-40 — Community Features Config

> Create the CommunityFeatures configuration object that maps community type to enabled features.

## Phase
2 — Multi-Tenancy & Self-Service

## Priority
P0

## Dependencies
- P0-05

## Functional Requirements
- Define a CommunityFeatures config in packages/shared
- Maps community_type → feature flags: hasCompliance, hasLeaseTracking, hasMeetings, hasStatutoryCategories, hasPublicNoticesPage, hasOwnerRole, hasVoting, requiresPublicWebsite
- Components check features.hasCompliance etc. instead of if (type === 'condo')
- Centralize ALL conditional logic
- Export type-safe feature checking function

## Acceptance Criteria
- [ ] Config correctly maps all three community types
- [ ] No component checks community_type directly — all use feature flags
- [ ] Adding a new feature flag is a single-file change
- [ ] TypeScript enforces that all community types are handled
- [ ] pnpm test passes

## Technical Notes
- This MUST be built early in Phase 2 — all apartment/condo conditional logic depends on it
- Consider moving to Phase 0

## Files Expected
- packages/shared/src/features/community-features.ts
- packages/shared/src/features/types.ts
- packages/shared/src/features/get-features.ts

## Attempts
0
