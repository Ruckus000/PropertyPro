# Task 0.8 — Refactor Seed Script for Parameterized Use

> **Context files to read first:** `SHARED-CONTEXT.md`, then read these files completely:
> - `scripts/seed-demo.ts` (entire file)
> - `scripts/config/demo-data.ts`
> **Branch:** `feat/seed-refactor`
> **Estimated time:** 3-4 hours
> **Files touched by other parallel agents:** None.

## Objective

Extract a reusable `seedCommunity()` function from the existing seed script so that Phase 2's demo generator can create a single community with arbitrary config.

## Current Problem

`seedCoreEntities()` (line 1079 of `seed-demo.ts`) hardcodes:
- Specific slugs: `'sunset-condos'`, `'palm-shores-hoa'`, `'sunset-ridge-apartments'`
- Specific emails: `'board.president@sunset.local'`, etc.
- Cross-community references (same user assigned roles in multiple communities)

This function cannot be called with "create one community named Acme Condos with custom branding."

## Deliverables

### 1. New file: `packages/db/src/seed/seed-community.ts`

```typescript
import type { CommunityBranding } from '@propertypro/shared';

export interface SeedCommunityConfig {
  name: string;
  slug: string;
  communityType: 'condo_718' | 'hoa_720' | 'apartment';
  timezone?: string;           // default: 'America/New_York'
  city?: string;
  state?: string;
  zipCode?: string;
  addressLine1?: string;
  branding?: CommunityBranding;
  isDemo?: boolean;            // default: false
}

export interface SeedUserConfig {
  email: string;
  fullName: string;
  phone?: string;
  role: 'owner' | 'tenant' | 'board_member' | 'board_president' | 'cam'
    | 'site_manager' | 'property_manager_admin';
}

export interface SeedCommunityResult {
  communityId: number;
  users: Array<{ email: string; userId: string; role: string }>;
}

/**
 * Create a fully-seeded community with users, roles, documents, meetings,
 * announcements, compliance checklist, and (for apartments) units/leases/maintenance.
 */
export async function seedCommunity(
  config: SeedCommunityConfig,
  users: SeedUserConfig[],
  options?: { syncAuthUsers?: boolean },
): Promise<SeedCommunityResult>;
```

### 2. Implementation approach

Move these functions from `seed-demo.ts` to `seed-community.ts`:
- `ensureCommunity()` — generalize to accept `SeedCommunityConfig` with branding
- `ensureUser()` — keep as-is
- `ensureAuthUser()` — keep as-is
- `seedRoles()` — keep as-is
- `ensureNotificationPreference()` — keep as-is
- `seedDocumentCategories()` — keep as-is (already parameterized by communityId + type)
- `seedRegistryDocument()` — keep as-is
- `seedRegistryMeeting()` — keep as-is
- `seedRegistryAnnouncement()` — keep as-is
- `seedCommunityCompliance()` — keep as-is
- `seedWizardState()` — keep as-is
- `seedApartmentUnits()` — keep as-is
- `seedApartmentLeases()` — keep as-is
- `seedApartmentMaintenanceRequests()` — keep as-is

Also move these helpers:
- `getUserRoleLabels()`
- `resolvePersistedRole()`
- `hasRegistryTable()`
- `lookupRegistry()`
- `upsertRegistryEntry()`
- `getDemoCategoryDefinitions()`
- `debugSeed()`
- `ROLE_FALLBACK_ORDER`

### 3. `seedCommunity()` implementation

The function should:

1. Call `ensureCommunity()` with config (including branding and isDemo)
2. For each user in `users`: call `ensureUser()` + optionally `ensureAuthUser()`
3. Call `seedRoles()` for each user
4. Call `ensureNotificationPreference()` for each user
5. Call `seedDocumentCategories()` with community type
6. Seed standard documents appropriate to community type:
   - **condo_718:** "Association Bylaws" (declaration category), "Annual Budget" (rules category)
   - **hoa_720:** "HOA Budget Report" (rules category), "Covenant & Restrictions" (declaration category)
   - **apartment:** "Community Rules" (rules category), "Move-In Instructions" (move_in_out_docs category), "Resident Handbook" (community_handbook category)
7. Seed one meeting per community (future date, appropriate type):
   - **condo_718:** "Board Meeting" (board type, 14 days out)
   - **hoa_720:** "Annual Meeting" (annual type, 21 days out)
   - **apartment:** "Operations Briefing" (committee type, 10 days out)
8. Seed announcements:
   - **condo_718:** 2 announcements (one pinned)
   - **hoa_720:** 1 announcement
   - **apartment:** 5 announcements (parking, gym, maintenance, package, event)
   Use the first user with a board/admin role as the author.
9. Call `seedCommunityCompliance()` with community type
10. Call `seedWizardState()` with appropriate wizard type
11. For **apartment** type only: call `seedApartmentUnits()`, `seedApartmentLeases()`, `seedApartmentMaintenanceRequests()`

**The announcement and document titles/content for dynamic seed should be generic but realistic.** Use the prospect's community name in titles where appropriate. For example: `"${config.name} Board Meeting"` not `"Sunset Board Meeting"`.

### 4. Rewrite `scripts/seed-demo.ts`

After extraction, `seed-demo.ts` becomes thin:

```typescript
import { seedCommunity } from '@propertypro/db/seed/seed-community';
import { DEMO_COMMUNITIES, DEMO_USERS } from './config/demo-data';

// Map DEMO_USERS to per-community SeedUserConfig arrays
// Call seedCommunity() for each of the 3 communities
// Handle cross-community user assignments (same user in multiple communities)
```

**Cross-community challenge:** The current seed assigns the same user (e.g., `board.president@sunset.local`) roles in BOTH `sunset-condos` AND `palm-shores-hoa`. The new `seedCommunity()` function handles one community at a time. Solution: `seed-demo.ts` calls `seedCommunity()` three times, then makes additional `seedRoles()` calls for cross-community assignments.

Export `seedRoles` and `ensureNotificationPreference` from the seed module so `seed-demo.ts` can call them for cross-community fixups.

### 5. Export from package

**Create/Modify:** `packages/db/src/seed/index.ts` (or update package.json exports)

Ensure `seedCommunity` is importable as:
```typescript
import { seedCommunity } from '@propertypro/db/seed/seed-community';
```

Add to `packages/db/package.json` exports if needed:
```json
{
  "exports": {
    "./seed/seed-community": "./src/seed/seed-community.ts"
  }
}
```

## Testing

### Regression test

After the refactor, `pnpm seed:demo` must produce the same result as before. Verify:
- 3 communities created (or already exist)
- 22 users created (or already exist)
- Document categories, documents, meetings, announcements exist for each
- Compliance checklists populated
- Apartment units, leases, maintenance requests exist

### Unit test for seedCommunity config validation

**Create:** `packages/db/__tests__/seed/seed-community.test.ts`

Test that `seedCommunity` rejects:
- Missing required fields (name, slug, communityType)
- Invalid communityType value

(Full integration test of seed output requires DB — mark as `.integration.test.ts` if needed)

## Do NOT

- Do not delete any existing seed data or functions
- Do not change the demo data in `scripts/config/demo-data.ts`
- Do not change the public interface of `pnpm seed:demo`
- Do not add dependencies on `packages/theme` (branding is passed as `CommunityBranding` from `@propertypro/shared`)

## Acceptance Criteria

- [ ] `seedCommunity()` is exported and callable with arbitrary config
- [ ] `pnpm seed:demo` still works identically to before
- [ ] Seed script is thin — orchestration only, no data logic
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
