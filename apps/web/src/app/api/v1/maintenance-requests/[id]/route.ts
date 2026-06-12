/**
 * Maintenance Requests [id] API — P3-50/P3-51
 *
 * GET  — Fetch a single maintenance request (resident: own only; staff: any in community)
 * PATCH — Update request (staff only)
 * DELETE — Soft-delete request (staff only)
 *
 * Plan A1 drain #129. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError, ValidationError, UnprocessableEntityError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { createNotificationsForEvent, queueNotification } from '@/lib/services/notification-service';
import { formatRequest } from '../_formatRequest';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import {
  getMaintenanceRequestById,
  listMaintenanceCommentsForRequest,
  softDeleteMaintenanceRequestById,
  updateMaintenanceRequestById,
} from '@/lib/services/maintenance-request-service';
import { isMaintenanceStaffAssignee } from '@/lib/services/maintenance-assignee-service';
import { createScopedClient, logAuditEvent } from '@propertypro/db';
import {
  maintenanceRequestDeleteContract,
  maintenanceRequestGetContract,
  maintenanceRequestPatchContract,
} from './contract';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  open:         ['submitted', 'acknowledged', 'in_progress'],
  submitted:    ['acknowledged', 'in_progress'],
  acknowledged: ['submitted', 'in_progress'],
  in_progress:  ['submitted', 'resolved'],
  resolved:     ['closed'],
  closed:       [],
};

export const GET = withErrorHandler(
  runRoute(maintenanceRequestGetContract, async ({ params, query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requirePlanFeature(communityId, 'hasMaintenanceRequests');
    requirePermission(membership, 'maintenance', 'read');
    const isResident = membership.role === 'resident';

    const scoped = createScopedClient(communityId);
    const [reqRows, commentRows] = await Promise.all([
      getMaintenanceRequestById(scoped, params.id),
      listMaintenanceCommentsForRequest(scoped, params.id),
    ]);

    const request = reqRows;
    if (!request) {
      throw new NotFoundError('Maintenance request not found');
    }

    if (isResident && request['submittedById'] !== actorUserId) {
      throw new ForbiddenError('You can only view your own maintenance requests');
    }

    const comments = commentRows.filter((c) => {
      if (isResident) return !c['isInternal'];
      return true;
    });

    return formatRequest(request, comments, isResident);
  }),
);

export const PATCH = withErrorHandler(
  runRoute(maintenanceRequestPatchContract, async ({ params, body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const { communityId: rawCommunityId, ...fields } = body;
    const communityId = resolveEffectiveCommunityId(req, rawCommunityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requirePlanFeature(communityId, 'hasMaintenanceRequests');

    requirePermission(membership, 'maintenance', 'write');
    if (!membership.isAdmin) {
      throw new ForbiddenError('Only maintenance staff can update maintenance requests');
    }

    const scoped = createScopedClient(communityId);
    const existing = await getMaintenanceRequestById(scoped, params.id);
    if (!existing) {
      throw new NotFoundError('Maintenance request not found');
    }

    const updateData: Record<string, unknown> = {};
    const oldValues: Record<string, unknown> = {};
    const newValues: Record<string, unknown> = {};

    let oldStatus: string | undefined;
    let newStatus: string | undefined;

    if (fields.status !== undefined) {
      oldStatus = existing['status'] as string;
      newStatus = fields.status;
      const allowed = ALLOWED_TRANSITIONS[oldStatus] ?? [];
      if (!allowed.includes(newStatus)) {
        throw new UnprocessableEntityError(
          `Invalid status transition: '${oldStatus}' → '${newStatus}'`,
          { allowedTransitions: allowed },
        );
      }
      updateData['status'] = newStatus;
      oldValues['status'] = oldStatus;
      newValues['status'] = newStatus;
    }

    if (fields.assignedToId !== undefined) {
      if (fields.assignedToId !== null) {
        if (!(await isMaintenanceStaffAssignee(scoped, fields.assignedToId))) {
          throw new ValidationError('Assigned user must be maintenance staff');
        }
      }
      updateData['assignedToId'] = fields.assignedToId;
      oldValues['assignedToId'] = existing['assignedToId'];
      newValues['assignedToId'] = fields.assignedToId;
    }
    if (fields.internalNotes !== undefined) {
      updateData['internalNotes'] = fields.internalNotes;
      oldValues['internalNotes'] = existing['internalNotes'];
      newValues['internalNotes'] = fields.internalNotes;
    }
    if (fields.resolutionDescription !== undefined) {
      updateData['resolutionDescription'] = fields.resolutionDescription;
      oldValues['resolutionDescription'] = existing['resolutionDescription'];
      newValues['resolutionDescription'] = fields.resolutionDescription;
    }
    if (fields.resolutionDate !== undefined) {
      updateData['resolutionDate'] = fields.resolutionDate ? new Date(fields.resolutionDate) : null;
      oldValues['resolutionDate'] = existing['resolutionDate'];
      newValues['resolutionDate'] = fields.resolutionDate;
    }
    if (fields.category !== undefined) {
      updateData['category'] = fields.category;
      oldValues['category'] = existing['category'];
      newValues['category'] = fields.category;
    }
    if (fields.priority !== undefined) {
      updateData['priority'] = fields.priority;
      oldValues['priority'] = existing['priority'];
      newValues['priority'] = fields.priority;
    }

    if (Object.keys(updateData).length === 0) {
      throw new ValidationError('No fields to update');
    }

    const updated = await updateMaintenanceRequestById(scoped, params.id, updateData);

    await logAuditEvent({
      userId: actorUserId,
      action: 'update',
      resourceType: 'maintenance_request',
      resourceId: String(params.id),
      communityId,
      oldValues,
      newValues,
    });

    if (oldStatus !== undefined && newStatus !== undefined) {
      const submittedById = existing['submittedById'] as string;
      void queueNotification(
        communityId,
        {
          type: 'maintenance_update',
          requestTitle: existing['title'] as string,
          previousStatus: oldStatus,
          newStatus,
          requestId: String(params.id),
        },
        { type: 'specific_user', userId: submittedById },
        actorUserId,
      ).catch(() => {});

      void createNotificationsForEvent(
        communityId,
        {
          category: 'maintenance',
          title: `Maintenance Update: ${existing['title'] as string}`,
          body: `Status changed to ${newStatus}`,
          actionUrl: `/communities/${communityId}/operations?tab=requests&from=maintenance`,
          sourceType: 'maintenance',
          sourceId: `maintenance:${params.id}:status:${newStatus}`,
        },
        { type: 'specific_user', userId: existing['submittedById'] as string },
        actorUserId,
      ).catch((err: unknown) => {
        console.error('[maintenance] in-app notification failed', { communityId, id: params.id, error: err instanceof Error ? err.message : String(err) });
      });
    }

    return updated;
  }),
);

export const DELETE = withErrorHandler(
  runRoute(maintenanceRequestDeleteContract, async ({ params, query, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);
    await requirePlanFeature(communityId, 'hasMaintenanceRequests');

    requirePermission(membership, 'maintenance', 'write');
    if (!membership.isAdmin) {
      throw new ForbiddenError('Only maintenance staff can delete maintenance requests');
    }

    const scoped = createScopedClient(communityId);
    const existing = await getMaintenanceRequestById(scoped, params.id);
    if (!existing) {
      throw new NotFoundError('Maintenance request not found');
    }

    await softDeleteMaintenanceRequestById(scoped, params.id);

    await logAuditEvent({
      userId: actorUserId,
      action: 'delete',
      resourceType: 'maintenance_request',
      resourceId: String(params.id),
      communityId,
      oldValues: {
        title: existing['title'],
        status: existing['status'],
      },
    });

    return { deleted: true as const };
  }),
);
