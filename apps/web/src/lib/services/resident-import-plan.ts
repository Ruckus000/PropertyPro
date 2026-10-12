/**
 * Decide, row by row, what a resident CSV import would do — without writing.
 *
 * `POST /api/v1/import-residents` runs this twice: once for the preview
 * (`dryRun`), and again, fresh, immediately before it writes. Sharing one
 * evaluation is the point. The preview used to stop after the CSV's own shape
 * checks, so it reported rows as ready that the import then skipped (unit not
 * found, already a member, an account the manager may not attach, an owner in
 * an apartment). Re-running it at commit is the recheck for anything that
 * changed after the preview: a unit deleted, a member added elsewhere.
 *
 * Every call here is a read. The writes stay in the route.
 *
 * Kept out of `import-residents-service.ts` on purpose: the route tests mock
 * that module's loaders, and this module consuming them is what lets those
 * tests exercise the real eligibility logic through the route.
 */
import type { CommunityRole } from '@propertypro/shared';
import { listCommunitiesForUser } from '@/lib/api/user-communities';
import { getCommunityTypeForOnboarding } from '@/lib/services/onboarding-service';
import {
  loadUnitNumberMapForImport,
  loadUserEmailMapForImport,
  loadUsersWithExistingRoleForImport,
} from '@/lib/services/import-residents-service';
import {
  assertActorMayAttachExistingUser,
  loadActorCommunitiesForLinking,
} from '@/lib/services/user-linking';
import {
  RESIDENT_IMPORT_ROLES,
  type ResidentCsvRow,
  type ResidentImportRole,
} from '@/lib/utils/csv-validator';
import { isResidentTierRole, validateRoleAssignment } from '@/lib/utils/role-validator';

export interface MappedImportRole {
  role: CommunityRole;
  isUnitOwner: boolean;
  displayTitle: string;
}

export interface ResidentImportRowError {
  rowNumber: number;
  column: string | null;
  message: string;
  /**
   * `already_member`: the person is already in this community. Not something
   * to fix — after an interrupted import it is exactly what a saved row looks
   * like, so the preview shows it as done rather than as an error.
   */
  code?: 'already_member';
}

export interface ResidentImportReadyRow {
  rowNumber: number;
  data: ResidentCsvRow;
  unitId: number | null;
  mapped: MappedImportRole;
  /** The matched platform account, or null when the import will create one. */
  existingUserId: string | null;
}

export interface ResidentImportPlan {
  ready: ResidentImportReadyRow[];
  errors: ResidentImportRowError[];
}

/**
 * Role-v3 invariant 3: the import path may only mint resident-tier rows.
 * Manager/board CSV roles were removed from the import vocabulary — board and
 * manager access is assigned from the root-only Roles & Access screen.
 */
function mapImportRole(csvRole: ResidentImportRole): MappedImportRole {
  if (csvRole === 'owner') {
    return { role: 'resident', isUnitOwner: true, displayTitle: 'Owner' };
  }
  return { role: 'resident', isUnitOwner: false, displayTitle: 'Tenant' };
}

/**
 * Evaluate rows that already passed `validateResidentCsv`. The checks run in
 * the order the import has always applied them, with the same messages, and
 * stop at the first refusal for a row.
 *
 * Rows are independent: the validator rejects a repeated email within one
 * file, so no row's outcome depends on another row of the same import.
 */
export async function planResidentImport(params: {
  communityId: number;
  actorUserId: string;
  rows: Array<{ rowNumber: number; data: ResidentCsvRow }>;
}): Promise<ResidentImportPlan> {
  const { communityId, actorUserId, rows } = params;

  const communityType = await getCommunityTypeForOnboarding(communityId);
  const unitByNumber = await loadUnitNumberMapForImport(communityId);
  const userByEmail = await loadUserEmailMapForImport(
    communityId,
    rows.map((row) => row.data.email),
  );
  // Hoisted out of the row loop: the cross-tenant guard needs the actor's own
  // memberships for every pre-existing match, and they do not change mid-import.
  const actorCommunities = await loadActorCommunitiesForLinking(actorUserId);
  const userHasRole = await loadUsersWithExistingRoleForImport(communityId);

  const ready: ResidentImportReadyRow[] = [];
  const errors: ResidentImportRowError[] = [];

  for (const row of rows) {
    const { email, role, unit_number } = row.data;
    const refuse = (column: string, message: string, code?: ResidentImportRowError['code']) => {
      errors.push({ rowNumber: row.rowNumber, column, message, ...(code ? { code } : {}) });
    };

    // Role-v3 invariant 3 (mirrors residents POST): only resident-tier rows
    // may be minted here. The CSV validator already rejects manager/board
    // vocabulary; this re-check keeps the invariant even if the validator
    // drifts or is bypassed.
    const mapped = mapImportRole(role);
    if (
      !(RESIDENT_IMPORT_ROLES as readonly string[]).includes(role) ||
      !isResidentTierRole(mapped.role)
    ) {
      refuse(
        'role',
        `Role '${role}' cannot be imported. Manager roles are assigned from Roles & Access (root only).`,
      );
      continue;
    }

    // Apartments have no unit owners. Pre-v3 this was enforced by
    // ROLE_COMMUNITY_CONSTRAINTS rejecting 'owner' for apartment; in v3 it is
    // an isUnitOwner-vs-community-type rule, preserved explicitly here.
    if (communityType === 'apartment' && mapped.isUnitOwner) {
      refuse('role', `Role '${role}' is not allowed for apartment communities.`);
      continue;
    }

    let unitId: number | null = null;
    if (unit_number) {
      const found = unitByNumber.get(unit_number.toLowerCase());
      if (!found) {
        refuse('unit_number', `Unit '${unit_number}' not found`);
        continue;
      }
      unitId = found;
    }

    // Validate the v3 role being assigned (resident) against unit-requirement.
    const validation = validateRoleAssignment(mapped.role, communityType, unitId);
    if (!validation.valid) {
      refuse('role', validation.error ?? 'Invalid role assignment');
      continue;
    }

    const existingUserId = userByEmail.get(email) ?? null;

    if (existingUserId) {
      // `userByEmail` comes from a platform-wide lookup (`users` has no
      // `community_id`, so the scoped client does not filter it). A hit here
      // may therefore be a resident of a DIFFERENT association, and binding
      // them in would publish their real name, email and phone through this
      // community's residents list. Issue #940 — same hole as the single-add
      // paths, reachable with one CSV row per victim.
      try {
        await assertActorMayAttachExistingUser({
          actorUserId,
          targetUserId: existingUserId,
          communityId,
          actorCommunities,
        });
      } catch {
        // Refuse the ROW, not the import: one stranger's address must not
        // abort an otherwise valid CSV.
        refuse('email', `'${email}' belongs to an existing account you cannot already see`);
        continue;
      }

      if (userHasRole.has(existingUserId)) {
        refuse('email', `User with email '${email}' already has a role in this community`, 'already_member');
        continue;
      }

      // Tenants belong to exactly one community. A brand-new account has no
      // communities, so only a pre-existing one can already be a tenant
      // elsewhere.
      if (!mapped.isUnitOwner) {
        const existingCommunities = await listCommunitiesForUser(existingUserId);
        const hasTenantElsewhere = existingCommunities.some(
          (c) => c.role === 'resident' && !c.isUnitOwner && c.communityId !== communityId,
        );
        if (hasTenantElsewhere) {
          refuse('role', `Tenant '${email}' already belongs to another community`);
          continue;
        }
      }
    }

    ready.push({ rowNumber: row.rowNumber, data: row.data, unitId, mapped, existingUserId });
  }

  return { ready, errors };
}
