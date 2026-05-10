/**
 * Maintenance Requests [id] API — P3-50/P3-51
 *
 * GET  — Fetch a single maintenance request (resident: own only; staff: any in community)
 * PATCH — Update request (staff only)
 * DELETE — Soft-delete request (staff only)
 *
 * Security:
 * - Residents can only GET their own requests (ForbiddenError if not owner)
 * - PATCH/DELETE restricted to community staff roles
 * - internalNotes stripped from resident responses
 * - isInternal=true comments stripped from resident responses
 * - Status transitions enforced via ALLOWED_TRANSITIONS map
 * - Notification payload never includes internalNotes
 *
 * Legacy compatibility:
 * - DB may have rows with status='open' from P2-36.
 *   ALLOWED_TRANSITIONS['open'] allows transitioning those rows.
 *   GET normalizes 'open' → 'submitted' in JSON responses (cosmetic only).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient, logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError, ValidationError, UnprocessableEntityError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { requirePermission } from '@/lib/db/access-control';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
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

/**
 * Valid status transitions.
 *
 * Legacy rows from P2-36 may still have status='open'. This entry ensures those
 * rows can be transitioned via PATCH. GET normalizes 'open' → 'submitted' in
 * responses (cosmetic), but the DB value may still be 'open'. Both paths handled.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  // Legacy rows from P2-36 may still be in 'open' status. This entry ensures
  // they can be transitioned. GET normalizes 'open' → 'submitted' in responses,
  // but the DB value may still be 'open'. Both paths must be handled.
  open:         ['submitted', 'acknowledged', 'in_progress'],
  submitted:    ['acknowledged', 'in_progress'],
  acknowledged: ['submitted', 'in_progress'],
  in_progress:  ['submitted', 'resolved'],
  resolved:     ['closed'],
  closed:       [],
};

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const patchSchema = z.object({
  communityId: z.number().int().positive(),
  status: z.string().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  resolutionDescription: z.string().nullable().optional(),
  resolutionDate: z.string().datetime().nullable().optional(),
  category: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

// ---------------------------------------------------------------------------
// Route params
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const actorUserId = await requireAuthenticatedUserId();
  const rawId = (await context?.params)?.['id'] ?? '';

  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('id must be a positive integer');
  }

  const { searchParams } = new URL(req.url);
  const rawCommunityId = searchParams.get('communityId');
  if (!rawCommunityId) {
    throw new ValidationError('communityId query parameter is required');
  }
  const parsedCommunityId = Number(rawCommunityId);
  if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
    throw new ValidationError('communityId must be a positive integer');
  }

  const communityId = resolveEffectiveCommunityId(req, parsedCommunityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  await requirePlanFeature(communityId, 'hasMaintenanceRequests');
  requirePermission(membership, 'maintenance', 'read');
  const isResident = membership.role === 'resident';

  const scoped = createScopedClient(communityId);
  const [reqRows, commentRows] = await Promise.all([
    getMaintenanceRequestById(scoped, id),
    listMaintenanceCommentsForRequest(scoped, id),
  ]);

  const request = reqRows;
  if (!request) {
    throw new NotFoundError('Maintenance request not found');
  }

  // Resident can only view their own requests
  if (isResident && request['submittedById'] !== actorUserId) {
    throw new ForbiddenError('You can only view your own maintenance requests');
  }

  // Filter internal comments for residents
  const comments = commentRows.filter((c) => {
    if (isResident) return !c['isInternal'];
    return true;
  });

  return NextResponse.json({ data: formatRequest(request, comments, isResident) });
});

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

export const PATCH = withErrorHandler(async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const actorUserId = await requireAuthenticatedUserId();
  const rawId = (await context?.params)?.['id'] ?? '';
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('id must be a positive integer');
  }

  const body: unknown = await req.json();
  const parseResult = patchSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid update payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const { communityId: rawCommunityId, ...fields } = parseResult.data;
  const communityId = resolveEffectiveCommunityId(req, rawCommunityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  await requirePlanFeature(communityId, 'hasMaintenanceRequests');

  requirePermission(membership, 'maintenance', 'write');
  if (!membership.isAdmin) {
    throw new ForbiddenError('Only maintenance staff can update maintenance requests');
  }

  const scoped = createScopedClient(communityId);
  const existing = await getMaintenanceRequestById(scoped, id);
  if (!existing) {
    throw new NotFoundError('Maintenance request not found');
  }

  const updateData: Record<string, unknown> = {};
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  // Validate status transition if provided
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
    // Validate that the assignee is a community member with an admin role
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

  const updated = await updateMaintenanceRequestById(scoped, id, updateData);

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'maintenance_request',
    resourceId: String(id),
    communityId,
    oldValues,
    newValues,
  });

  // Queue notification to submitter on status change (NEVER pass internalNotes)
  if (oldStatus !== undefined && newStatus !== undefined) {
    const submittedById = existing['submittedById'] as string;
    void queueNotification(
      communityId,
      {
        type: 'maintenance_update',
        requestTitle: existing['title'] as string,
        previousStatus: oldStatus,
        newStatus,
        requestId: String(id),
      },
      { type: 'specific_user', userId: submittedById },
      actorUserId,
    ).catch(() => {
      // Notification failure must not fail the PATCH request
    });

    void createNotificationsForEvent(
      communityId,
      {
        category: 'maintenance',
        title: `Maintenance Update: ${existing['title'] as string}`,
        body: `Status changed to ${newStatus}`,
        actionUrl: `/maintenance/${id}`,
        sourceType: 'maintenance',
        sourceId: `maintenance:${id}:status:${newStatus}`,
      },
      { type: 'specific_user', userId: existing['submittedById'] as string },
      actorUserId,
    ).catch((err: unknown) => {
      console.error('[maintenance] in-app notification failed', { communityId, id, error: err instanceof Error ? err.message : String(err) });
    });
  }

  return NextResponse.json({ data: updated });
});

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

export const DELETE = withErrorHandler(async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
  const actorUserId = await requireAuthenticatedUserId();
  const rawId = (await context?.params)?.['id'] ?? '';
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('id must be a positive integer');
  }

  const { searchParams } = new URL(req.url);
  const rawCommunityId = searchParams.get('communityId');
  if (!rawCommunityId) {
    throw new ValidationError('communityId query parameter is required');
  }
  const parsedCommunityId = Number(rawCommunityId);
  if (!Number.isInteger(parsedCommunityId) || parsedCommunityId <= 0) {
    throw new ValidationError('communityId must be a positive integer');
  }

  const communityId = resolveEffectiveCommunityId(req, parsedCommunityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  await requirePlanFeature(communityId, 'hasMaintenanceRequests');

  requirePermission(membership, 'maintenance', 'write');
  if (!membership.isAdmin) {
    throw new ForbiddenError('Only maintenance staff can delete maintenance requests');
  }

  const scoped = createScopedClient(communityId);
  const existing = await getMaintenanceRequestById(scoped, id);
  if (!existing) {
    throw new NotFoundError('Maintenance request not found');
  }

  await softDeleteMaintenanceRequestById(scoped, id);

  await logAuditEvent({
    userId: actorUserId,
    action: 'delete',
    resourceType: 'maintenance_request',
    resourceId: String(id),
    communityId,
    oldValues: {
      title: existing['title'],
      status: existing['status'],
    },
  });

  return NextResponse.json({ data: { deleted: true } });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// formatRequest is imported from ../_formatRequest (shared with route.ts)
