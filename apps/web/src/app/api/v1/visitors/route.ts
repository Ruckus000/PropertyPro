import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createScopedClient } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody, parseCommunityIdFromQuery } from '@/lib/finance/request';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { parsePositiveInt } from '@/lib/finance/common';
import {
  isResidentRole,
  requireActorUnitIds,
  requireStaffOperator,
  requireVisitorLoggingEnabled,
  requireVisitorsReadPermission,
  requireVisitorsWritePermission,
} from '@/lib/logistics/common';
import {
  createVisitorForCommunity,
  paginateVisitorsForCommunity,
} from '@/lib/services/package-visitor-service';
import { resolveUnitIdByLabel } from '@/lib/services/units-lookup';

const createVisitorCommunitySchema = z.object({
  communityId: z.number().int().positive(),
});

const createVisitorSchema = z
  .object({
    communityId: z.number().int().positive(),
    visitorName: z.string().trim().min(1).max(240),
    purpose: z.string().trim().min(1).max(240),
    hostUnitLabel: z.string().trim().min(1).max(100),
    expectedArrival: z.string().datetime({ offset: true }).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
    guestType: z
      .enum(['one_time', 'recurring', 'permanent', 'vendor'])
      .optional()
      .default('one_time'),
    validFrom: z.string().datetime({ offset: true }).nullable().optional(),
    validUntil: z.string().datetime({ offset: true }).nullable().optional(),
    recurrenceRule: z
      .enum(['weekdays', 'weekends', 'mon_wed_fri', 'tue_thu', 'custom'])
      .nullable()
      .optional(),
    expectedDurationMinutes: z.number().int().min(15).max(1440).nullable().optional(),
    vehicleMake: z.string().max(100).nullable().optional(),
    vehicleModel: z.string().max(100).nullable().optional(),
    vehicleColor: z.string().max(50).nullable().optional(),
    vehiclePlate: z.string().max(20).nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const gt = data.guestType;

    if (gt === 'one_time') {
      if (!data.expectedArrival) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['expectedArrival'],
          message: 'expectedArrival is required for one-time passes',
        });
      }
    }

    if (gt === 'recurring') {
      if (!data.validFrom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['validFrom'],
          message: 'validFrom is required for recurring passes',
        });
      }
      if (!data.validUntil) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['validUntil'],
          message: 'validUntil is required for recurring passes',
        });
      }
      if (!data.recurrenceRule) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['recurrenceRule'],
          message: 'recurrenceRule is required for recurring passes',
        });
      }
      if (data.expectedDurationMinutes == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['expectedDurationMinutes'],
          message: 'expectedDurationMinutes is required for recurring passes',
        });
      }
    }

    if (gt === 'permanent') {
      if (!data.validFrom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['validFrom'],
          message: 'validFrom is required for permanent passes',
        });
      }
      if (data.validUntil != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['validUntil'],
          message: 'validUntil must not be set for permanent passes',
        });
      }
      if (data.expectedDurationMinutes != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['expectedDurationMinutes'],
          message: 'expectedDurationMinutes must not be set for permanent passes',
        });
      }
    }

    if (gt === 'vendor') {
      if (!data.validFrom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['validFrom'],
          message: 'validFrom is required for vendor passes',
        });
      }
      if (!data.validUntil) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['validUntil'],
          message: 'validUntil is required for vendor passes',
        });
      }
    }

    // Cross-field: validUntil must be after validFrom when both present
    if (data.validFrom && data.validUntil) {
      if (new Date(data.validUntil) <= new Date(data.validFrom)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['validUntil'],
          message: 'validUntil must be after validFrom',
        });
      }
    }
  });

const listVisitorsQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const communityId = parseCommunityIdFromQuery(req);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireVisitorLoggingEnabled(membership);
  requireVisitorsReadPermission(membership);

  const { searchParams } = new URL(req.url);
  const rawHostUnitId = searchParams.get('hostUnitId');
  const hostUnitId = rawHostUnitId ? parsePositiveInt(rawHostUnitId, 'hostUnitId') : undefined;
  const onlyActive = searchParams.get('active') === 'true';
  const validGuestTypes = new Set(['one_time', 'recurring', 'permanent', 'vendor']);
  const validStatuses = new Set(['expected', 'checked_in', 'checked_out', 'expired', 'overstayed', 'revoked', 'revoked_on_site']);
  const rawGuestType = searchParams.get('guestType');
  const rawStatus = searchParams.get('status');
  const guestType = rawGuestType && validGuestTypes.has(rawGuestType) ? rawGuestType : undefined;
  const status = rawStatus && validStatuses.has(rawStatus) ? rawStatus : undefined;
  const parsedQuery = listVisitorsQuerySchema.safeParse({
    cursor: searchParams.get('cursor') || undefined,
    pageSize: searchParams.get('pageSize') || undefined,
  });
  if (!parsedQuery.success) {
    throw new ValidationError('Invalid visitors query', {
      fields: formatZodErrors(parsedQuery.error),
    });
  }

  let allowedUnitIds: number[] | undefined;
  if (isResidentRole(membership.role)) {
    const scoped = createScopedClient(communityId);
    allowedUnitIds = await requireActorUnitIds(scoped, actorUserId);

    if (hostUnitId !== undefined && !allowedUnitIds.includes(hostUnitId)) {
      throw new ForbiddenError('You can only view visitors for your own unit');
    }
  }

  const result = await paginateVisitorsForCommunity(communityId, {
    cursor: parsedQuery.data.cursor,
    pageSize: parsedQuery.data.pageSize,
    hostUnitId,
    onlyActive,
    allowedUnitIds,
    guestType,
    status,
  });

  // Strip sensitive access-control field from resident responses
  const data = result.data;
  if (isResidentRole(membership.role)) {
    const sanitized = data.map(({ passCode: _, ...rest }) => rest);
    return NextResponse.json({
      data: {
        data: sanitized,
        pagination: result.pagination,
      },
    });
  }

  return NextResponse.json({
    data: {
      data,
      pagination: result.pagination,
    },
  });
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const scope = createVisitorCommunitySchema.safeParse(body);
  if (!scope.success) {
    throw new ValidationError('Invalid visitor payload', {
      fields: formatZodErrors(scope.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, scope.data.communityId);
  await assertNotDemoGrace(communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireVisitorLoggingEnabled(membership);
  requireVisitorsWritePermission(membership);

  const parsed = createVisitorSchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid visitor payload', {
      fields: formatZodErrors(parsed.error),
    });
  }

  const scoped = createScopedClient(communityId);

  const resolution = await resolveUnitIdByLabel(communityId, parsed.data.hostUnitLabel);
  if (resolution.kind !== 'resolved') {
    if (isResidentRole(membership.role)) {
      throw new ValidationError('Invalid visitor payload', {
        fields: { hostUnitLabel: 'Unit not found or not accessible' },
      });
    }
    throw new ValidationError('Invalid visitor payload', {
      fields: {
        hostUnitLabel:
          resolution.kind === 'ambiguous'
            ? 'Multiple units share this label; contact your administrator to resolve duplicates'
            : 'Unit not found',
      },
    });
  }
  const hostUnitId = resolution.unitId;
  const canonicalHostUnitLabel = resolution.unitNumber;

  if (isResidentRole(membership.role)) {
    const allowedUnitIds = await requireActorUnitIds(scoped, actorUserId);
    if (!allowedUnitIds.includes(hostUnitId)) {
      throw new ValidationError('Invalid visitor payload', {
        fields: { hostUnitLabel: 'Unit not found or not accessible' },
      });
    }
  } else {
    requireStaffOperator(membership);
  }

  const requestId = req.headers.get('x-request-id');
  const data = await createVisitorForCommunity(
    communityId,
    actorUserId,
    {
      visitorName: parsed.data.visitorName,
      purpose: parsed.data.purpose,
      hostUnitId,
      hostUnitLabel: canonicalHostUnitLabel,
      expectedArrival: parsed.data.expectedArrival,
      notes: parsed.data.notes ?? null,
      guestType: parsed.data.guestType,
      validFrom: parsed.data.validFrom ?? null,
      validUntil: parsed.data.validUntil ?? null,
      recurrenceRule: parsed.data.recurrenceRule ?? null,
      expectedDurationMinutes: parsed.data.expectedDurationMinutes ?? null,
      vehicleMake: parsed.data.vehicleMake ?? null,
      vehicleModel: parsed.data.vehicleModel ?? null,
      vehicleColor: parsed.data.vehicleColor ?? null,
      vehiclePlate: parsed.data.vehiclePlate ?? null,
    },
    requestId,
  );

  return NextResponse.json({ data }, { status: 201 });
});
