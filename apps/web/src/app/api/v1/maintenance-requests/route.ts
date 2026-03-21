/**
 * Maintenance Requests API — P3-50
 *
 * Patterns:
 * - withErrorHandler for structured error responses
 * - createScopedClient for tenant isolation
 * - logAuditEvent on every mutation
 * - Zod validation on request bodies
 * - Action-dispatch POST pattern (mirrors contracts/route.ts)
 *
 * Security invariants:
 * - internalNotes and isInternal=true comments never returned to RESIDENT_ROLES callers
 * - Resident add_comment always stores isInternal=false regardless of request body
 * - Photo count ≤ 5 checked before issuing a new upload URL (resident callers)
 * - Resident read scope = own requests only
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  createPresignedDownloadUrl,
  logAuditEvent,
  maintenanceRequests,
  maintenanceComments,
  units,
} from '@propertypro/db';
import { eq, and, inArray } from '@propertypro/db/filters';
import { ADMIN_ROLES as ADMIN_ROLES_LIST, RESIDENT_ROLES as RESIDENT_ROLES_LIST, getFeaturesForCommunity } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { getMaintenancePhotoUploadUrl, processAndStoreThumbnail } from '@/lib/services/photo-processor';
import { formatRequest } from './_formatRequest';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADMIN_ROLES = new Set<string>(ADMIN_ROLES_LIST);
const RESIDENT_ROLES = new Set<string>(RESIDENT_ROLES_LIST);

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const prioritySchema = z
  .enum(['low', 'normal', 'high', 'urgent', 'emergency'])
  .transform((v): 'low' | 'normal' | 'high' | 'urgent' =>
    v === 'emergency' ? 'urgent' : v,
  );

const categoryValues = ['plumbing', 'electrical', 'hvac', 'general', 'other'] as const;

const createRequestSchema = z.object({
  action: z.literal('create'),
  communityId: z.number().int().positive(),
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  category: z.enum(categoryValues).default('general'),
  priority: prioritySchema.default('normal'),
  unitId: z.number().int().positive().nullable().optional(),
  storagePaths: z.array(z.string().min(1)).max(5).optional(),
});

const addCommentSchema = z.object({
  action: z.literal('add_comment'),
  communityId: z.number().int().positive(),
  requestId: z.number().int().positive(),
  text: z.string().min(1).max(5000),
  isInternal: z.boolean().default(false),
});

const requestUploadUrlSchema = z.object({
  action: z.literal('request_upload_url'),
  communityId: z.number().int().positive(),
  requestId: z.number().int().positive().nullable().optional(),
  filename: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(10 * 1024 * 1024), // 10MB
  mimeType: z.string(),
});

// ---------------------------------------------------------------------------
// GET — List maintenance requests
// ---------------------------------------------------------------------------

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
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
  const typeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!typeFeatures.hasMaintenanceRequests) {
    throw new ForbiddenError('Maintenance requests are not enabled for this community type');
  }
  await requirePlanFeature(communityId, 'hasMaintenanceRequests');
  const isAdmin = ADMIN_ROLES.has(membership.role);
  const isResident = RESIDENT_ROLES.has(membership.role);

  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '20')));
  const statusFilter = searchParams.get('status');
  const categoryFilter = searchParams.get('category');
  const priorityFilter = searchParams.get('priority');
  const assignedToIdFilter = searchParams.get('assignedToId');

  const scoped = createScopedClient(communityId);

  // Push filters to DB — avoids full-table scan on every list request
  const conditions: ReturnType<typeof eq>[] = [];
  if (isResident) conditions.push(eq(maintenanceRequests.submittedById, actorUserId));
  if (statusFilter) conditions.push(eq(maintenanceRequests.status, statusFilter as 'submitted' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed' | 'open'));
  if (categoryFilter) conditions.push(eq(maintenanceRequests.category, categoryFilter));
  if (priorityFilter) conditions.push(eq(maintenanceRequests.priority, priorityFilter as 'low' | 'normal' | 'high' | 'urgent'));
  if (isAdmin && assignedToIdFilter) conditions.push(eq(maintenanceRequests.assignedToId, assignedToIdFilter));

  const additionalWhere = conditions.length > 0 ? and(...conditions) : undefined;
  const dbOffset = (page - 1) * limit;

  // Run count (ID-only) and paginated full-row fetch in parallel — avoids fetching all rows into memory
  type IdRow = { id: number };
  type DynBuilder = { limit(n: number): { offset(n: number): Promise<Record<string, unknown>[]> } };
  const [countRows, paged] = await Promise.all([
    scoped.selectFrom(maintenanceRequests, { id: maintenanceRequests.id }, additionalWhere) as unknown as Promise<IdRow[]>,
    (scoped.selectFrom(maintenanceRequests, {}, additionalWhere) as unknown as DynBuilder)
      .limit(limit)
      .offset(dbOffset),
  ]);
  const total = (countRows as IdRow[]).length;

  // Fetch comments only for this page's request IDs (not all community comments)
  const pagedIds = paged.map((r) => r['id'] as number);
  const commentsByRequestId = new Map<number, Record<string, unknown>[]>();
  if (pagedIds.length > 0) {
    const commentRows = await scoped.selectFrom(
      maintenanceComments,
      {},
      inArray(maintenanceComments.requestId, pagedIds),
    ) as unknown as Record<string, unknown>[];
    for (const c of commentRows) {
      const rid = c['requestId'] as number;
      const bucket = commentsByRequestId.get(rid) ?? [];
      bucket.push(c);
      commentsByRequestId.set(rid, bucket);
    }
  }

  const data = paged.map((r) => {
    const requestId = r['id'] as number;
    const comments = (commentsByRequestId.get(requestId) ?? []).filter((c) => {
      if (isResident) return !c['isInternal'];
      return true;
    });
    return formatRequest(r, comments, isResident);
  });

  return NextResponse.json({ data, meta: { total, page, limit } });
});

// ---------------------------------------------------------------------------
// POST — Action dispatch
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const bodyObj = body as Record<string, unknown>;
  const action = bodyObj['action'] as string | undefined;

  if (action === 'create') {
    return handleCreateRequest(bodyObj, actorUserId, req);
  }
  if (action === 'add_comment') {
    return handleAddComment(bodyObj, actorUserId, req);
  }
  if (action === 'request_upload_url') {
    return handleRequestUploadUrl(bodyObj, actorUserId, req);
  }

  throw new ValidationError('Unknown action. Valid actions: create, add_comment, request_upload_url');
});

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleCreateRequest(
  body: Record<string, unknown>,
  actorUserId: string,
  req: NextRequest,
): Promise<NextResponse> {
  const parseResult = createRequestSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid request payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const payload = parseResult.data;
  const communityId = resolveEffectiveCommunityId(req, payload.communityId);
  const createMembership = await requireCommunityMembership(communityId, actorUserId);
  const createTypeFeatures = getFeaturesForCommunity(createMembership.communityType);
  if (!createTypeFeatures.hasMaintenanceRequests) {
    throw new ForbiddenError('Maintenance requests are not enabled for this community type');
  }
  await requirePlanFeature(communityId, 'hasMaintenanceRequests');

  const scoped = createScopedClient(communityId);

  // Validate unitId belongs to this community (scoped client auto-injects communityId filter)
  if (payload.unitId != null) {
    const unitRows = await scoped.selectFrom(
      units,
      {},
      eq(units.id, payload.unitId),
    ) as unknown as Record<string, unknown>[];
    if (unitRows.length === 0) {
      throw new ValidationError('Unit not found in this community');
    }
  }

  // Build photo entries from already-uploaded storage paths.
  // thumbnailUrl is null initially — fire-and-forget thumbnail generation runs after insert.
  // thumbnailUrl cannot be written back without a separate PATCH-photos path (deferred per design).
  const photoEntries: Array<{
    url: string;
    thumbnailUrl: string | null;
    storagePath: string;
    uploadedAt: string;
  }> = [];
  if (payload.storagePaths?.length) {
    const uploadedAt = new Date().toISOString();
    for (const storagePath of payload.storagePaths) {
      // Validate path prefix to prevent cross-tenant photo access
      if (!storagePath.startsWith(`maintenance/${communityId}/`)) {
        throw new ValidationError('Invalid storage path');
      }
      const url = await createPresignedDownloadUrl('maintenance', storagePath);
      photoEntries.push({ url, thumbnailUrl: null, storagePath, uploadedAt });
    }
  }

  const insertedRows = await scoped.insert(maintenanceRequests, {
    submittedById: actorUserId,
    unitId: payload.unitId ?? null,
    title: payload.title,
    description: payload.description,
    category: payload.category,
    priority: payload.priority,
    status: 'submitted',
    photos: photoEntries.length > 0 ? photoEntries : null,
  });

  const created = insertedRows[0];
  if (!created) {
    throw new ValidationError('Failed to create maintenance request');
  }

  // Fire-and-forget thumbnail generation. Stores thumbnail files in Supabase Storage.
  // thumbnailUrl stays null in DB — acceptable per schema design (nullable, best-effort).
  if (photoEntries.length > 0) {
    const requestId = created['id'] as number;
    for (const entry of photoEntries) {
      void processAndStoreThumbnail(entry.storagePath, communityId, requestId).catch(() => {});
    }
  }

  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'maintenance_request',
    resourceId: String(created['id']),
    communityId,
    newValues: {
      title: payload.title,
      category: payload.category,
      priority: payload.priority,
      photoCount: photoEntries.length,
    },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}

async function handleAddComment(
  body: Record<string, unknown>,
  actorUserId: string,
  req: NextRequest,
): Promise<NextResponse> {
  const parseResult = addCommentSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid comment payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const payload = parseResult.data;
  const communityId = resolveEffectiveCommunityId(req, payload.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  const commentTypeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!commentTypeFeatures.hasMaintenanceRequests) {
    throw new ForbiddenError('Maintenance requests are not enabled for this community type');
  }
  await requirePlanFeature(communityId, 'hasMaintenanceRequests');
  const isAdmin = ADMIN_ROLES.has(membership.role);
  const isResident = RESIDENT_ROLES.has(membership.role);

  const scoped = createScopedClient(communityId);

  // Verify request belongs to this community
  const reqRows = await scoped.selectFrom(
    maintenanceRequests,
    {},
    eq(maintenanceRequests.id, payload.requestId),
  );
  const existingRequest = (reqRows as unknown as Record<string, unknown>[])[0];
  if (!existingRequest) {
    throw new ValidationError('Maintenance request not found in this community');
  }

  // Resident can only comment on their own requests
  if (isResident && existingRequest['submittedById'] !== actorUserId) {
    throw new ForbiddenError('You can only comment on your own requests');
  }

  // Force isInternal=false for residents regardless of request body
  const isInternal = isAdmin ? payload.isInternal : false;

  const insertedRows = await scoped.insert(maintenanceComments, {
    requestId: payload.requestId,
    userId: actorUserId,
    text: payload.text,
    isInternal,
  });

  const created = insertedRows[0];
  if (!created) {
    throw new ValidationError('Failed to create comment');
  }

  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'maintenance_comment',
    resourceId: String(created['id']),
    communityId,
    newValues: {
      requestId: payload.requestId,
      isInternal,
    },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}

async function handleRequestUploadUrl(
  body: Record<string, unknown>,
  actorUserId: string,
  req: NextRequest,
): Promise<NextResponse> {
  const parseResult = requestUploadUrlSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid upload URL request', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const payload = parseResult.data;
  const communityId = resolveEffectiveCommunityId(req, payload.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  const uploadTypeFeatures = getFeaturesForCommunity(membership.communityType);
  if (!uploadTypeFeatures.hasMaintenanceRequests) {
    throw new ForbiddenError('Maintenance requests are not enabled for this community type');
  }
  await requirePlanFeature(communityId, 'hasMaintenanceRequests');
  const isResident = RESIDENT_ROLES.has(membership.role);

  if (payload.requestId != null) {
    // Verify ownership for residents
    const scoped = createScopedClient(communityId);
    const reqRows = await scoped.selectFrom(
      maintenanceRequests,
      {},
      eq(maintenanceRequests.id, payload.requestId),
    );
    const existingRequest = (reqRows as unknown as Record<string, unknown>[])[0];
    if (!existingRequest) {
      throw new ValidationError('Maintenance request not found in this community');
    }
    if (isResident && existingRequest['submittedById'] !== actorUserId) {
      throw new ForbiddenError('You can only upload photos to your own requests');
    }

    // Check photo count ≤ 5 for resident callers
    if (isResident) {
      const photos = existingRequest['photos'];
      const photoCount = Array.isArray(photos) ? photos.length : 0;
      if (photoCount >= 5) {
        throw new ValidationError('Maximum of 5 photos allowed per request', { code: 'PHOTO_LIMIT_EXCEEDED' });
      }
    }
  }

  const { uploadUrl, storagePath } = await getMaintenancePhotoUploadUrl(
    communityId,
    payload.requestId ?? null,
    payload.filename,
  );

  return NextResponse.json({ data: { uploadUrl, storagePath } });
}
