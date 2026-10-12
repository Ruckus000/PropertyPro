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
 *     → validateResidentCsv → planResidentImport → (dryRun ? preview : writes)
 *
 * The inline `importSchema.safeParse` is now the contract body schema, so the
 * runner rejects invalid payloads with the canonical `VALIDATION_ERROR`
 * envelope (status unchanged at 400).
 *
 * The preview and the import share one read-only eligibility evaluation,
 * `planResidentImport` (`lib/services/resident-import-plan.ts`). Until
 * 2026-10-12 the preview returned right after the CSV shape checks, so it
 * reported rows as ready that the import then skipped (onboarding audit F1,
 * `docs/audits/2026-10-05-onboarding/01-evidence-brief.md`). The import
 * re-plans in its own request rather than trusting the preview, then writes
 * user + role + notification preferences for each ready row, followed by the
 * per-user audit-log fan-out. Both responses are returned via the runner's
 * canonical `{ data: ... }` wrapper.
 */
import { runRoute } from "@propertypro/api-contract";
import { logAuditEvent } from "@propertypro/db";
import type { CommunityRole } from "@propertypro/shared";
import { withErrorHandler } from "@/lib/api/error-handler";
import { validateResidentCsv, type ResidentImportRole } from "@/lib/utils/csv-validator";
import { requireAuthenticatedUserId } from "@/lib/api/auth";
import { requireCommunityMembership } from "@/lib/api/community-membership";
import { requirePermission } from "@/lib/db/access-control";
import { resolveEffectiveCommunityId } from "@/lib/api/tenant-context";
import { assertNotDemoGrace } from "@/lib/middleware/demo-grace-guard";
import { requireActiveSubscriptionForMutation } from "@/lib/middleware/subscription-guard";
import {
  insertNotificationPreferencesForImport,
  insertUserForImport,
  insertUserRoleForImport,
} from "@/lib/services/import-residents-service";
import { planResidentImport } from "@/lib/services/resident-import-plan";
import { importResidentsContract } from "./contract";

const byRowNumber = (a: { rowNumber: number }, b: { rowNumber: number }) => a.rowNumber - b.rowNumber;

export const POST = withErrorHandler(
  runRoute(importResidentsContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();

    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    await requireActiveSubscriptionForMutation(communityId);
    const { csv, dryRun } = body;
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'residents', 'write');

    // Parse and validate CSV
    const parsedCsv = validateResidentCsv(csv);
    const invalidCsvRowNumbers = new Set<number>(parsedCsv.errors.map((e) => e.rowNumber));

    // The same read-only evaluation serves the preview and the import, so the
    // preview reports exactly the rows the import would take. See
    // `planResidentImport` for the checks.
    const plan = await planResidentImport({ communityId, actorUserId, rows: parsedCsv.rows });

    if (dryRun) {
      return {
        // `rowNumber` is the line in the uploaded file; `existingAccount`
        // says the row attaches an account that already exists rather than
        // creating one. Both are additive to the original preview row shape.
        preview: plan.ready.map((r) => ({
          ...r.data,
          rowNumber: r.rowNumber,
          existingAccount: r.existingUserId !== null,
        })),
        errors: [...parsedCsv.errors, ...plan.errors].sort(byRowNumber),
        header: parsedCsv.header,
      };
    }

    // `plan` was computed in THIS request, not carried over from the preview,
    // so anything that changed since the manager previewed is caught here.
    const errors = [...parsedCsv.errors, ...plan.errors];
    const createdUsers: Array<{ userId: string; email: string; role: CommunityRole; legacyRole: ResidentImportRole }> = [];
    let importedCount = 0;
    // rows with parse-level errors, plus rows the plan refused
    let skippedCount = invalidCsvRowNumbers.size + plan.errors.length;

    for (const row of plan.ready) {
      const { name, email, role } = row.data;

      let userId = row.existingUserId;
      if (!userId) {
        userId = await insertUserForImport(communityId, {
          id: crypto.randomUUID(),
          email,
          fullName: name,
        });

        if (!userId) {
          errors.push({ rowNumber: row.rowNumber, column: "email", message: `Failed to create user for '${email}'` });
          skippedCount++;
          continue;
        }
      }

      // Resident-tier rows never carry a board designation (role-v3 invariant 3);
      // the designation column stays null and is set only via the root-only path.
      await insertUserRoleForImport(communityId, {
        userId,
        role: row.mapped.role,
        unitId: row.unitId,
        isUnitOwner: row.mapped.isUnitOwner,
        displayTitle: row.mapped.displayTitle,
      });

      await insertNotificationPreferencesForImport(communityId, userId);

      importedCount++;
      createdUsers.push({ userId, email, role: row.mapped.role, legacyRole: role });
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
      errors: errors.sort(byRowNumber),
    };
  }),
);
