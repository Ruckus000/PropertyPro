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
 * re-plans in its own request rather than trusting the preview.
 *
 * Each ready row is then written in its OWN transaction — user (if new),
 * membership, notification preferences and its audit entry together
 * (`importResidentRow`, onboarding audit F2). A row that fails becomes a row
 * error and the import carries on. If the request itself dies part-way, every
 * row already saved is complete and audited, and running the same file again
 * imports only what is left: the plan reports saved rows as already members.
 * Both responses are returned via the runner's canonical `{ data: ... }` wrapper.
 *
 * Operating limit (`RESIDENT_IMPORT_MAX_ROWS`, 2,000): measured 2026-10-12 on
 * a local Postgres, a 2,000-row import of new residents took 2.9 s (1.5 ms a
 * row) and its preview 17 ms. Production adds about six round trips a row
 * (BEGIN, four INSERTs, COMMIT) at the pdx1→us-west-2 latency — an ESTIMATE
 * of 30–60 s for 2,000 rows against Vercel's 300 s, not a measurement. Rows
 * attaching existing accounts cost a few more reads each (the attach guard).
 * Re-measure on production before raising the cap.
 */
import { runRoute } from "@propertypro/api-contract";
import { captureException } from "@sentry/nextjs";
import { withErrorHandler } from "@/lib/api/error-handler";
import { isNamedUniqueViolation } from "@/lib/db/postgres-error";
import { validateResidentCsv } from "@/lib/utils/csv-validator";
import { requireAuthenticatedUserId } from "@/lib/api/auth";
import { requireCommunityMembership } from "@/lib/api/community-membership";
import { requirePermission } from "@/lib/db/access-control";
import { resolveEffectiveCommunityId } from "@/lib/api/tenant-context";
import { assertNotDemoGrace } from "@/lib/middleware/demo-grace-guard";
import { requireActiveSubscriptionForMutation } from "@/lib/middleware/subscription-guard";
import { importResidentRow } from "@/lib/services/import-residents-service";
import { planResidentImport } from "@/lib/services/resident-import-plan";
import { importResidentsContract } from "./contract";

const byRowNumber = (a: { rowNumber: number }, b: { rowNumber: number }) => a.rowNumber - b.rowNumber;

/**
 * Unexpected row failures in a row before the import stops. Several in a row
 * means the database (or the pool) is failing, not one row: carrying on would
 * send up to 2,000 Sentry events and run each remaining row into the same
 * failure until the function times out. Stopping leaves every saved row whole,
 * and the same file re-imports what is left.
 */
const MAX_CONSECUTIVE_ROW_FAILURES = 5;

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
    let importedCount = 0;
    // rows with parse-level errors, plus rows the plan refused
    let skippedCount = invalidCsvRowNumbers.size + plan.errors.length;

    let consecutiveFailures = 0;
    for (const [index, row] of plan.ready.entries()) {
      if (consecutiveFailures >= MAX_CONSECUTIVE_ROW_FAILURES) {
        for (const notTried of plan.ready.slice(index)) {
          errors.push({
            rowNumber: notTried.rowNumber,
            column: null,
            message: "Not imported: the import stopped after repeated errors. Upload the file again to finish.",
          });
        }
        skippedCount += plan.ready.length - index;
        break;
      }

      const { name, email, role } = row.data;
      try {
        // Resident-tier rows never carry a board designation (role-v3 invariant 3);
        // the designation column stays null and is set only via the root-only path.
        await importResidentRow({
          communityId,
          actorUserId,
          email,
          fullName: name,
          existingUserId: row.existingUserId,
          isUnitOwner: row.mapped.isUnitOwner,
          unitId: row.unitId,
          displayTitle: row.mapped.displayTitle,
          legacyRole: role,
          bulkCount: plan.ready.length,
        });
        importedCount++;
        consecutiveFailures = 0;
      } catch (error) {
        // The row's transaction rolled back, so nothing of it exists. Report
        // it and keep going: one row must not cost the manager the rest.
        skippedCount++;
        if (isNamedUniqueViolation(error, "user_roles_user_community_unique")) {
          // Someone gave this person a membership here between the plan and
          // the write — another tab, another manager, a second import. Only
          // THIS constraint means that; any other unique violation is not a
          // race and must not be reported as one (re-uploading would fail the
          // same way forever), so it takes the generic path below.
          errors.push({
            rowNumber: row.rowNumber,
            column: "email",
            message: `'${email}' was added while this import ran, so nothing was saved for this row. Upload the file again to see where it stands.`,
          });
        } else {
          consecutiveFailures++;
          captureException(error, {
            tags: { route: "import-residents", phase: "row-write" },
            extra: { communityId, rowNumber: row.rowNumber },
          });
          errors.push({
            rowNumber: row.rowNumber,
            column: null,
            message: "We couldn't import this row, and nothing was saved for it. Please try it again.",
          });
        }
      }
    }

    return {
      importedCount,
      skippedCount,
      errors: errors.sort(byRowNumber),
    };
  }),
);
