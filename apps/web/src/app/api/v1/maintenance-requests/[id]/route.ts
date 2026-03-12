/**
 * Maintenance Requests [id] API — P3-50/P3-51
 *
 * GET  — Fetch a single maintenance request (resident: own only; admin: any)
 * PATCH — Update request (admin only)
 * DELETE — Soft-delete request (admin only)
 *
 * Security:
 * - Residents can only GET their own requests (ForbiddenError if not owner)
 * - PATCH/DELETE restricted to ADMIN_ROLES
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
import {
  createScopedClient,
  logAuditEvent,
  maintenanceRequests,
  maintenanceComments,
  userRoles,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { ADMIN_ROLES as ADMIN_ROLES_LIST, RESIDENT_ROLES as RESIDENT_ROLES_LIST } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, NotFoundError, ValidationError, UnprocessableEntityError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { queueNotification } from '@/lib/services/notification-service';
import { formatRequest } from '../_formatRequest';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADMIN_ROLES = new Set<string>(ADMIN_ROLES_LIST);
const RESIDENT_ROLES = new Set<string>(RESIDENT_ROLES_LIST);

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
  const isAdmin = ADMIN_ROLES.has(membership.role);
  const isResident = RESIDENT_ROLES.has(membership.role);

  const scoped = createScopedClient(communityId);
  const [reqRows, commentRows] = await Promise.all([
    scoped.selectFrom(maintenanceRequests, {}, eq(maintenanceRequests.id, id)),
    scoped.selectFrom(maintenanceComments, {}, eq(maintenanceComments.requestId, id)),
  ]);

  const request = (reqRows as unknown as Record<string, unknown>[])[0];
  if (!request) {
    throw new NotFoundError('Maintenance request not found');
  }

  // Resident can only view their own requests
  if (isResident && request['submittedById'] !== actorUserId) {
    throw new ForbiddenError('You can only view your own maintenance requests');
  }

  // Filter internal comments for residents
  const comments = (commentRows as unknown as Record<string, unknown>[]).filter((c) => {
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
  const membership = await requireCommunityMembership(communityId, actorUserId);

  if (!ADMIN_ROLES.has(membership.role)) {
    throw new ForbiddenError('Only community administrators can update maintenance requests');
  }

  const scoped = createScopedClient(communityId);
  const reqRows = await scoped.selectFrom(
    maintenanceRequests,
    {},
    eq(maintenanceRequests.id, id),
  );
  const existing = (reqRows as unknown as Record<string, unknown>[])[0];
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
      // Filter by userId at the DB level — scoped client auto-injects communityId,
      // so this is a point lookup (unique constraint on userId+communityId)
      const roleRows = await scoped.selectFrom(
        userRoles,
        {},
        eq(userRoles.userId, fields.assignedToId),
      ) as unknown as Record<string, unknown>[];
      const match = roleRows.find(
        (row) => ADMIN_ROLES.has(row['role'] as string),
      );
      if (!match) {
        throw new ValidationError('Assigned user must be a community administrator');
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

  const [updated] = await scoped.update(maintenanceRequests, updateData, eq(maintenanceRequests.id, id));

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
  const membership = await requireCommunityMembership(communityId, actorUserId);

  if (!ADMIN_ROLES.has(membership.role)) {
    throw new ForbiddenError('Only community administrators can delete maintenance requests');
  }

  const scoped = createScopedClient(communityId);
  const reqRows = await scoped.selectFrom(
    maintenanceRequests,
    {},
    eq(maintenanceRequests.id, id),
  );
  const existing = (reqRows as unknown as Record<string, unknown>[])[0];
  if (!existing) {
    throw new NotFoundError('Maintenance request not found');
  }

  await scoped.softDelete(maintenanceRequests, eq(maintenanceRequests.id, id));

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
