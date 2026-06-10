/**
 * Bulk-import residents from a CSV blob.
 *
 * POST /api/v1/import-residents
 * Body: { communityId, csv, dryRun? }
 *
 * Plan A1 auto-drain. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace            (async — awaited; runs BEFORE membership)
 *     → requireCommunityMembership
 *     → requirePermission('residents', 'write')   (sync — NOT awaited)
 *     → import loop
 *
 * The inline `importSchema.safeParse` is now the contract body schema, so the
 * runner rejects invalid payloads with the canonical `VALIDATION_ERROR`
 * envelope (status unchanged at 400). The full import loop — CSV validation,
 * per-row user/role/notification inserts, tenant-uniqueness check, and the
 * per-user audit-log fan-out — is preserved byte-identical. Both the dryRun
 * preview and the real-import summary are returned via the runner's canonical
 * `{ data: ... }` wrapper, byte-identical to the prior `NextResponse.json`.
 */
import { runRoute } from "@propertypro/api-contract";
import { logAuditEvent } from "@propertypro/db";
import { withErrorHandler } from "@/lib/api/error-handler";
import { validateResidentCsv } from "@/lib/utils/csv-validator";
import { validateRoleAssignment } from "@/lib/utils/role-validator";
import type { CommunityRole, NewCommunityRole, PresetKey } from "@propertypro/shared";
import { getPresetPermissions, PRESET_METADATA } from "@propertypro/shared";
import { requireAuthenticatedUserId } from "@/lib/api/auth";
import { requireCommunityMembership } from "@/lib/api/community-membership";
import { requirePermission } from "@/lib/db/access-control";
import { resolveEffectiveCommunityId } from "@/lib/api/tenant-context";
import { listCommunitiesForUser } from "@/lib/api/user-communities";
import { assertNotDemoGrace } from "@/lib/middleware/demo-grace-guard";
import { getCommunityTypeForOnboarding } from "@/lib/services/onboarding-service";
import {
  insertNotificationPreferencesForImport,
  insertUserForImport,
  insertUserRoleForImport,
  loadUnitNumberMapForImport,
  loadUserEmailMapForImport,
  loadUsersWithExistingRoleForImport,
} from "@/lib/services/import-residents-service";
import { importResidentsContract } from "./contract";

interface MappedRole {
  role: NewCommunityRole;
  isUnitOwner: boolean;
  presetKey: PresetKey | null;
  displayTitle: string;
}

function mapLegacyRole(legacyRole: CommunityRole): MappedRole {
  switch (legacyRole) {
    case "owner":
      return { role: "resident", isUnitOwner: true, presetKey: null, displayTitle: "Owner" };
    case "tenant":
      return { role: "resident", isUnitOwner: false, presetKey: null, displayTitle: "Tenant" };
    case "board_president":
    case "board_member":
    case "cam":
    case "site_manager":
      return {
        role: "manager",
        isUnitOwner: false,
        presetKey: legacyRole as PresetKey,
        displayTitle: PRESET_METADATA[legacyRole as PresetKey].displayTitle,
      };
    case "property_manager_admin":
      return { role: "pm_admin", isUnitOwner: false, presetKey: null, displayTitle: "Administrator" };
    default:
      return { role: "resident", isUnitOwner: false, presetKey: null, displayTitle: "Tenant" };
  }
}

export const POST = withErrorHandler(
  runRoute(importResidentsContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();

    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const { csv, dryRun } = body;
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'residents', 'write');

    // Parse and validate CSV
    const parsedCsv = validateResidentCsv(csv);
    const invalidCsvRowNumbers = new Set<number>(parsedCsv.errors.map((e) => e.rowNumber));

    // If dryRun, just return preview + errors
    if (dryRun) {
      return {
        preview: parsedCsv.rows.map((r) => r.data),
        errors: parsedCsv.errors,
        header: parsedCsv.header,
      };
    }

    // Proceed with import
    const communityType = await getCommunityTypeForOnboarding(communityId);
    const unitByNumber = await loadUnitNumberMapForImport(communityId);
    const userByEmail = await loadUserEmailMapForImport(communityId);
    const userHasRole = await loadUsersWithExistingRoleForImport(communityId);

    const errors = [...parsedCsv.errors];
    const createdUsers: Array<{ userId: string; email: string; role: NewCommunityRole; legacyRole: CommunityRole }> = [];
    let importedCount = 0;
    let skippedCount = invalidCsvRowNumbers.size; // rows with parse-level errors already skipped

    for (const row of parsedCsv.rows) {
      const { name, email, role, unit_number } = row.data;

      // Resolve unitId if provided
      let unitId: number | null = null;
      if (unit_number) {
        const found = unitByNumber.get(unit_number.toLowerCase());
        if (!found) {
          errors.push({ rowNumber: row.rowNumber, column: "unit_number", message: `Unit '${unit_number}' not found` });
          skippedCount++;
          continue;
        }
        unitId = found;
      }

      // Validate role assignment vs community type & unit requirement
      const validation = validateRoleAssignment(role, communityType, unitId);
      if (!validation.valid) {
        errors.push({ rowNumber: row.rowNumber, column: "role", message: validation.error ?? "Invalid role assignment" });
        skippedCount++;
        continue;
      }

      // Find or create user
      let userId = userByEmail.get(email);
      if (!userId) {
        const newUserId = crypto.randomUUID();
        const insertedUserId = await insertUserForImport(communityId, {
          id: newUserId,
          email,
          fullName: name,
        });

        if (!insertedUserId) {
          errors.push({ rowNumber: row.rowNumber, column: "email", message: `Failed to create user for '${email}'` });
          skippedCount++;
          continue;
        }

        userId = insertedUserId;
        userByEmail.set(email, insertedUserId);
      }

      // Skip if user already has a role in this community
      if (userHasRole.has(userId)) {
        errors.push({
          rowNumber: row.rowNumber,
          column: "email",
          message: `User with email '${email}' already has a role in this community`,
        });
        skippedCount++;
        continue;
      }

      // Map legacy CSV role to new hybrid model
      const mapped = mapLegacyRole(role);

      // Tenants belong to exactly one community. Block if this user already
      // has a tenant role in any other community.
      if (role === "tenant" || (mapped.role === "resident" && !mapped.isUnitOwner)) {
        const existingCommunities = await listCommunitiesForUser(userId);
        const hasTenantElsewhere = existingCommunities.some(
          (c) => c.role === "resident" && !c.isUnitOwner && c.communityId !== communityId,
        );
        if (hasTenantElsewhere) {
          errors.push({
            rowNumber: row.rowNumber,
            column: "role",
            message: `Tenant '${email}' already belongs to another community`,
          });
          skippedCount++;
          continue;
        }
      }

      // Derive permissions for manager roles
      const permissions =
        mapped.role === "manager" && mapped.presetKey
          ? getPresetPermissions(mapped.presetKey, communityType)
          : null;

      await insertUserRoleForImport(communityId, {
        userId,
        role: mapped.role,
        unitId,
        isUnitOwner: mapped.isUnitOwner,
        permissions,
        presetKey: mapped.presetKey,
        displayTitle: mapped.displayTitle,
      });

      await insertNotificationPreferencesForImport(communityId, userId);

      userHasRole.add(userId);
      importedCount++;
      createdUsers.push({ userId, email, role: mapped.role, legacyRole: role });
    }

    // Audit log one event per created user with bulkCount metadata
    for (const cu of createdUsers) {
      await logAuditEvent({
        userId: actorUserId,
        action: "user_invited",
        resourceType: "resident",
        resourceId: cu.userId,
        communityId,
        newValues: { email: cu.email, role: cu.role, legacyRole: cu.legacyRole },
        metadata: { bulkCount: createdUsers.length },
      });
    }

    return {
      importedCount,
      skippedCount,
      errors,
    };
  }),
);
