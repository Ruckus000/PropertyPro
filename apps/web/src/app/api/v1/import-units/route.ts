/**
 * POST /api/v1/import-units — create units from a CSV.
 *
 * Body: { communityId, csv, dryRun? }. `dryRun` validates the file AND checks
 * each number against the community's live units, so the preview shows what
 * an import would actually do. A real import creates the valid rows and
 * reports the rest; a row that loses a race to another writer is a row error
 * (the unique index answers 409), never a 500.
 *
 * Auth mirrors POST /api/v1/units: demo-grace and subscription guards,
 * membership, units:write. Each created unit gets the same `create` audit row
 * a single add writes.
 */
import { createScopedClient, logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { runRoute } from '@/lib/api/run-route';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ConflictError } from '@/lib/api/errors';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requireActiveSubscriptionForMutation } from '@/lib/middleware/subscription-guard';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';
import { createUnitForCommunity, listUnitsForCommunity } from '@/lib/services/unit-service';
import { validateUnitCsv } from '@/lib/utils/unit-csv-validator';
import { importUnitsContract } from './contract';

export const POST = withErrorHandler(
  runRoute(importUnitsContract, async ({ body, communityId }) => {
    const actorUserId = await requireAuthenticatedUserId();
    await assertNotDemoGrace(communityId);
    await requireActiveSubscriptionForMutation(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    requirePermission(membership, 'units', 'write');

    const parsed = validateUnitCsv(body.csv, { occupancyFromLeases: membership.communityType === 'apartment' });
    const errors = [...parsed.errors];
    const scoped = createScopedClient(communityId);

    // Numbers already in the community (any case — the unique index's rule).
    const existing = new Set(
      (await listUnitsForCommunity(scoped)).map((u) => String(u['unitNumber']).toLowerCase()),
    );
    const candidates = parsed.rows.filter((row) => {
      if (!existing.has(row.data.unit_number.toLowerCase())) return true;
      errors.push({ rowNumber: row.rowNumber, column: 'unit_number', message: `Unit '${row.data.unit_number}' already exists` });
      return false;
    });

    const toUnit = (row: (typeof candidates)[number]) => ({
      rowNumber: row.rowNumber,
      unitNumber: row.data.unit_number,
      building: row.data.building,
      floor: row.data.floor,
      bedrooms: row.data.bedrooms,
      bathrooms: row.data.bathrooms,
      sqft: row.data.sqft,
      occupancy: row.data.occupancy,
    });
    const rowsWithErrors = new Set(errors.filter((e) => e.rowNumber > 1).map((e) => e.rowNumber));

    if (body.dryRun) {
      return {
        units: candidates.map(toUnit),
        errors,
        importedCount: 0,
        skippedCount: rowsWithErrors.size,
        dryRun: true,
      };
    }

    const created: ReturnType<typeof toUnit>[] = [];
    // ponytail: serial inserts, ≤2,000 rows per file (validator cap) — the
    // same trade-off as the resident import; each is one indexed insert.
    for (const row of candidates) {
      const unit = toUnit(row);
      try {
        const inserted = await createUnitForCommunity(scoped, {
          unitNumber: unit.unitNumber,
          building: unit.building,
          floor: unit.floor,
          bedrooms: unit.bedrooms,
          bathrooms: unit.bathrooms,
          sqft: unit.sqft,
          occupancy: unit.occupancy,
          // Chosen by the manager in the file: confirmed, like a single add.
          occupancyConfirmedAt: unit.occupancy ? new Date() : null,
        });
        await logAuditEvent({
          userId: actorUserId,
          action: 'create',
          resourceType: 'unit',
          resourceId: String(inserted?.['id']),
          communityId,
          newValues: { ...unit, source: 'csv_import' },
        });
        created.push(unit);
      } catch (error) {
        if (!(error instanceof ConflictError)) throw error;
        errors.push({ rowNumber: row.rowNumber, column: 'unit_number', message: error.message });
        rowsWithErrors.add(row.rowNumber);
      }
    }

    if (created.length > 0) void tryAutoComplete(communityId, actorUserId, 'add_units');

    return {
      units: created,
      errors,
      importedCount: created.length,
      skippedCount: rowsWithErrors.size,
      dryRun: false,
    };
  }),
);
