# Decision Required: User Role Enum

## The Problem

There's a conflict between two authoritative documents about what role values the `user_role` PostgreSQL enum should contain.

### Source A: IMPLEMENTATION_PLAN.md (line 380, 684, 832)

Uses 4 abstract roles throughout:
```
admin, manager, auditor, resident
```

These are used consistently in:
- P0-05 schema definition: `role (admin, manager, auditor, resident)`
- P1-18 acceptance criteria: "Role assignment works: resident, auditor, manager, admin"
- P1-25 document access matrix: "Admin sees all documents / Manager sees management + public / Auditor sees audit + financial + public / Resident sees public only"

### Source B: specs/phase-1-compliance-core/18-resident-management.md (line 17)

Uses 6 domain-specific Florida roles:
```
owner, tenant, board_member, board_president, cam, site_manager
```

With community-type restrictions:
- `owner`, `board_member`, `board_president` — only valid for condo_718 and hoa_720
- `tenant` — valid for all community types (and the only resident role for apartments)
- `cam` (Community Association Manager) — licensed professional role under Florida §468
- `site_manager` — on-site property management staff

### Current State

The schema currently has `admin, manager, auditor, resident` (matching the implementation plan). `packages/shared/src/index.ts` was updated to match. P0-06 scoped query builder and P0-07/P0-08 are complete and don't depend on which role names are used.

## Why This Matters

This isn't cosmetic — the role enum determines the authorization model for the entire application.

### What abstract roles CAN do:
- Simple 4-tier permission system (full access → management → read-financial → read-public)
- Easy to reason about for the document access matrix
- Works fine for P0 and early P1 tasks

### What abstract roles CANNOT do:
- **Distinguish owners from tenants.** Under Florida §718, only unit owners can vote on association matters, attend owner meetings, and access certain financial records. Tenants have limited rights. With just "resident," you can't enforce this.
- **Identify board members for compliance.** §718.111(1)(a) requires board member names to be posted on the association website. If your only roles are admin/manager/auditor/resident, you'd need to track "is this admin a board member or a CAM?" somewhere else.
- **Validate community-type role restrictions.** Apartments don't have owners or board members — everyone is a tenant. With abstract roles, there's no enum-level enforcement of "you can't assign 'owner' to an apartment community."
- **Track CAM licensing.** CAMs are licensed by the state of Florida (DBPR). This is a legally distinct role, not just an "admin."

### What domain-specific roles CANNOT do:
- They don't map cleanly to a 4-tier permission hierarchy without an additional mapping layer
- The implementation plan's document access matrix (admin/manager/auditor/resident) would need to be rewritten as a role-to-permission mapping

## Options

### Option 1: Keep abstract roles, add a `role_label` or `role_subtype` column later
Keep `admin, manager, auditor, resident` in the enum. When P1-18 arrives, add a nullable `role_label` text column to `user_roles` for display purposes (e.g., "Board President", "CAM"). Permission logic uses the enum; UI uses the label.

**Pro:** No migration needed now. Permission matrix stays simple.
**Con:** You're encoding domain knowledge in a free-text field instead of the type system. "Board President" vs "board president" vs "Board Pres" becomes a data quality problem.

### Option 2: Switch to domain-specific roles now
Change the enum to: `owner, tenant, board_member, board_president, cam, site_manager, auditor`

Add a role-to-permission mapping in `packages/shared`:
```ts
export const ROLE_PERMISSIONS = {
  board_president: 'admin',
  cam: 'admin',
  site_manager: 'manager',
  board_member: 'manager',
  auditor: 'auditor',
  owner: 'resident',
  tenant: 'resident',
} as const;
```

**Pro:** Type-safe domain modeling. Community-type validation at the enum level. Clear compliance reporting.
**Con:** Requires a migration (drop and recreate enum), updating `packages/shared`, and rewriting the P0-06 prompt's type signatures from the implementation plan's abstract roles.

### Option 3: Use both — enum for domain roles, computed permission tier
Same as Option 2 but formalize the two layers:
- `user_role` enum = domain identity (who you ARE): owner, tenant, board_member, board_president, cam, site_manager, auditor
- `PermissionTier` TypeScript type = access level (what you CAN DO): admin, manager, auditor, resident

The scoped query builder and document access matrix use `PermissionTier`. The UI, compliance reports, and role validation use the enum.

**Pro:** Best of both worlds. Domain-accurate AND simple permission logic.
**Con:** Two concepts to understand instead of one.

## My Recommendation

**Option 3** if you want to do it right. **Option 1** if you want to move fast and defer the decision.

Option 2 is the worst of both — you pay the migration cost but don't get the clean separation of identity vs permission.

## What To Do

Read this document, decide which option you want, then tell me. I'll update:
1. `packages/db/src/schema/enums.ts` — the PostgreSQL enum
2. `packages/shared/src/index.ts` — the TypeScript constants
3. Generate a new migration if the enum values change
4. Update the IMPLEMENTATION_PLAN.md to document the decision

No other code needs to change — P0-06/07/08 don't reference specific role values.
