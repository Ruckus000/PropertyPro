/**
 * Contracts API — CRUD for vendor contract tracking (P3-52).
 *
 * Patterns:
 * - withErrorHandler for structured error responses
 * - createScopedClient for tenant isolation (AGENTS #13)
 * - logAuditEvent on every mutation
 * - Zod validation on request bodies
 * - Compliance-community-only feature gate via hasCompliance (AGENTS #34)
 * - Bid embargo enforced server-side: bid details hidden until biddingClosesAt
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  createScopedClient,
  logAuditEvent,
  contracts,
  contractBids,
  documents,
  complianceChecklistItems,
} from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
import { getFeaturesForCommunity, type CommunityType } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError, NotFoundError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { getContractExpirationAlerts } from '@/lib/services/contract-renewal-alerts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Roles allowed to manage contracts (community admins). */
const ADMIN_ROLES = new Set([
  'board_member',
  'board_president',
  'cam',
  'site_manager',
  'property_manager_admin',
]);

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const contractStatusValues = ['draft', 'active', 'expired', 'terminated'] as const;

const createContractSchema = z.object({
  communityId: z.number().int().positive(),
  title: z.string().min(1, 'Title is required').max(500),
  vendorName: z.string().min(1, 'Vendor name is required').max(500),
  description: z.string().nullable().optional(),
  contractValue: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a decimal with up to 2 decimal places')
    .nullable()
    .optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format')
    .nullable()
    .optional(),
  documentId: z.number().int().positive().nullable().optional(),
  complianceChecklistItemId: z.number().int().positive().nullable().optional(),
  biddingClosesAt: z.string().datetime().nullable().optional(),
  conflictOfInterest: z.boolean().optional(),
  conflictOfInterestNote: z.string().nullable().optional(),
  status: z.enum(contractStatusValues).optional(),
});

const updateContractSchema = z.object({
  id: z.number().int().positive(),
  communityId: z.number().int().positive(),
  title: z.string().min(1).max(500).optional(),
  vendorName: z.string().min(1).max(500).optional(),
  description: z.string().nullable().optional(),
  contractValue: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .nullable()
    .optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  documentId: z.number().int().positive().nullable().optional(),
  complianceChecklistItemId: z.number().int().positive().nullable().optional(),
  biddingClosesAt: z.string().datetime().nullable().optional(),
  conflictOfInterest: z.boolean().optional(),
  conflictOfInterestNote: z.string().nullable().optional(),
  status: z.enum(contractStatusValues).optional(),
});

const createBidSchema = z.object({
  communityId: z.number().int().positive(),
  contractId: z.number().int().positive(),
  vendorName: z.string().min(1, 'Vendor name is required').max(500),
  bidAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Must be a decimal with up to 2 decimal places'),
  notes: z.string().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireComplianceCommunity(communityType: CommunityType): void {
  const features = getFeaturesForCommunity(communityType);
  if (!features.hasCompliance) {
    throw new ForbiddenError('Contract tracking is only available for condo and HOA communities');
  }
}

function requireAdminRole(role: string): void {
  if (!ADMIN_ROLES.has(role)) {
    throw new ForbiddenError('Only community administrators can manage contracts');
  }
}

interface ContractRow {
  id: number;
  communityId: number;
  title: string;
  vendorName: string;
  description: string | null;
  contractValue: string | null;
  startDate: string;
  endDate: string | null;
  documentId: number | null;
  complianceChecklistItemId: number | null;
  biddingClosesAt: Date | null;
  conflictOfInterest: boolean;
  conflictOfInterestNote: string | null;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

function coerceContractRow(row: Record<string, unknown>): ContractRow {
  return {
    id: row['id'] as number,
    communityId: row['communityId'] as number,
    title: row['title'] as string,
    vendorName: row['vendorName'] as string,
    description: (row['description'] as string | null) ?? null,
    contractValue: (row['contractValue'] as string | null) ?? null,
    startDate: row['startDate'] as string,
    endDate: (row['endDate'] as string | null) ?? null,
    documentId: (row['documentId'] as number | null) ?? null,
    complianceChecklistItemId: (row['complianceChecklistItemId'] as number | null) ?? null,
    biddingClosesAt: row['biddingClosesAt'] ? (row['biddingClosesAt'] as Date) : null,
    conflictOfInterest: (row['conflictOfInterest'] as boolean) ?? false,
    conflictOfInterestNote: (row['conflictOfInterestNote'] as string | null) ?? null,
    status: row['status'] as string,
    createdBy: row['createdBy'] as string,
    createdAt: row['createdAt'] as Date,
    updatedAt: row['updatedAt'] as Date,
  };
}

/**
 * Apply bid embargo: if biddingClosesAt is in the future, redact bid details
 * and only return a sealed summary (count + close date).
 */
function applyBidEmbargo(
  contract: ContractRow,
  bids: Record<string, unknown>[],
): { bids: Record<string, unknown>[]; embargoed: boolean; bidCount: number; biddingClosesAt: Date | null } {
  const now = new Date();
  const isEmbargoed = contract.biddingClosesAt !== null && contract.biddingClosesAt > now;

  if (isEmbargoed) {
    return {
      bids: [],
      embargoed: true,
      bidCount: bids.length,
      biddingClosesAt: contract.biddingClosesAt,
    };
  }

  return {
    bids,
    embargoed: false,
    bidCount: bids.length,
    biddingClosesAt: contract.biddingClosesAt,
  };
}

// ---------------------------------------------------------------------------
// GET — List contracts with expiration alerts and bid info
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
  requireComplianceCommunity(membership.communityType);
  requireAdminRole(membership.role);

  const scoped = createScopedClient(communityId);
  const contractRows = await scoped.query(contracts);
  const bidRows = await scoped.query(contractBids);
  const contractRecords = contractRows.map(coerceContractRow);

  // Group bids by contractId and apply embargo
  const bidsByContract = new Map<number, Record<string, unknown>[]>();
  for (const bid of bidRows) {
    const contractId = bid['contractId'] as number;
    const existing = bidsByContract.get(contractId) ?? [];
    existing.push(bid);
    bidsByContract.set(contractId, existing);
  }

  const contractsWithBids = contractRecords.map((contract) => {
    const contractBidsList = bidsByContract.get(contract.id) ?? [];
    const embargoResult = applyBidEmbargo(contract, contractBidsList);
    return {
      ...contract,
      bidSummary: {
        bids: embargoResult.bids,
        embargoed: embargoResult.embargoed,
        bidCount: embargoResult.bidCount,
        biddingClosesAt: embargoResult.biddingClosesAt,
      },
    };
  });

  // Compute expiration alerts
  const alerts = getContractExpirationAlerts(contractRecords);

  return NextResponse.json({ data: contractsWithBids, alerts });
});

// ---------------------------------------------------------------------------
// POST — Create contract or bid (dispatched by 'action' field)
// ---------------------------------------------------------------------------

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const bodyObj = body as Record<string, unknown>;
  const action = bodyObj['action'] as string | undefined;

  if (action === 'add_bid') {
    return handleCreateBid(bodyObj, actorUserId, req);
  }

  // Default: create contract
  return handleCreateContract(bodyObj, actorUserId, req);
});

// ---------------------------------------------------------------------------
// PATCH — Update contract
// ---------------------------------------------------------------------------

export const PATCH = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = updateContractSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid update payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const { id, communityId: rawCommunityId, ...fields } = parseResult.data;
  const communityId = resolveEffectiveCommunityId(req, rawCommunityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireComplianceCommunity(membership.communityType);
  requireAdminRole(membership.role);

  const scoped = createScopedClient(communityId);

  const existingRows = await scoped.query(contracts);
  const existing = existingRows.find((row) => row['id'] === id);
  if (!existing) {
    throw new NotFoundError('Contract not found');
  }

  // Validate documentId belongs to this community if provided
  if (fields.documentId) {
    const docRows = await scoped.query(documents);
    const doc = docRows.find((row) => row['id'] === fields.documentId);
    if (!doc) {
      throw new ValidationError('Document not found in this community');
    }
  }

  // Validate complianceChecklistItemId belongs to this community if provided
  if (fields.complianceChecklistItemId) {
    const checklistRows = await scoped.query(complianceChecklistItems);
    const item = checklistRows.find((row) => row['id'] === fields.complianceChecklistItemId);
    if (!item) {
      throw new ValidationError('Compliance checklist item not found in this community');
    }
  }

  const updateData: Record<string, unknown> = {};
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      updateData[key] = value;
      oldValues[key] = existing[key];
      newValues[key] = value;
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw new ValidationError('No fields to update');
  }

  const [updated] = await scoped.update(contracts, updateData, eq(contracts.id, id));

  await logAuditEvent({
    userId: actorUserId,
    action: 'update',
    resourceType: 'contract',
    resourceId: String(id),
    communityId,
    oldValues,
    newValues,
  });

  return NextResponse.json({ data: updated });
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleCreateContract(
  body: Record<string, unknown>,
  actorUserId: string,
  req: NextRequest,
): Promise<NextResponse> {
  const parseResult = createContractSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid contract payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const payload = parseResult.data;
  const communityId = resolveEffectiveCommunityId(req, payload.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireComplianceCommunity(membership.communityType);
  requireAdminRole(membership.role);

  const scoped = createScopedClient(communityId);

  // Validate documentId belongs to this community
  if (payload.documentId) {
    const docRows = await scoped.query(documents);
    const doc = docRows.find((row) => row['id'] === payload.documentId);
    if (!doc) {
      throw new ValidationError('Document not found in this community');
    }
  }

  // Validate complianceChecklistItemId belongs to this community
  if (payload.complianceChecklistItemId) {
    const checklistRows = await scoped.query(complianceChecklistItems);
    const item = checklistRows.find((row) => row['id'] === payload.complianceChecklistItemId);
    if (!item) {
      throw new ValidationError('Compliance checklist item not found in this community');
    }
  }

  const insertedRows = await scoped.insert(contracts, {
    title: payload.title,
    vendorName: payload.vendorName,
    description: payload.description ?? null,
    contractValue: payload.contractValue ?? null,
    startDate: payload.startDate,
    endDate: payload.endDate ?? null,
    documentId: payload.documentId ?? null,
    complianceChecklistItemId: payload.complianceChecklistItemId ?? null,
    biddingClosesAt: payload.biddingClosesAt ? new Date(payload.biddingClosesAt) : null,
    conflictOfInterest: payload.conflictOfInterest ?? false,
    conflictOfInterestNote: payload.conflictOfInterestNote ?? null,
    status: payload.status ?? 'active',
    createdBy: actorUserId,
  });

  const created = insertedRows[0];
  if (!created) {
    throw new ValidationError('Failed to create contract');
  }

  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'contract',
    resourceId: String(created['id']),
    communityId,
    newValues: {
      title: payload.title,
      vendorName: payload.vendorName,
      startDate: payload.startDate,
      endDate: payload.endDate ?? null,
      contractValue: payload.contractValue ?? null,
      status: payload.status ?? 'active',
    },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}

async function handleCreateBid(
  body: Record<string, unknown>,
  actorUserId: string,
  req: NextRequest,
): Promise<NextResponse> {
  const parseResult = createBidSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid bid payload', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const payload = parseResult.data;
  const communityId = resolveEffectiveCommunityId(req, payload.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);
  requireComplianceCommunity(membership.communityType);
  requireAdminRole(membership.role);

  const scoped = createScopedClient(communityId);

  // Validate contract belongs to this community
  const contractRows = await scoped.query(contracts);
  const contract = contractRows.find((row) => row['id'] === payload.contractId);
  if (!contract) {
    throw new NotFoundError('Contract not found in this community');
  }

  const insertedRows = await scoped.insert(contractBids, {
    contractId: payload.contractId,
    vendorName: payload.vendorName,
    bidAmount: payload.bidAmount,
    notes: payload.notes ?? null,
    createdBy: actorUserId,
  });

  const created = insertedRows[0];
  if (!created) {
    throw new ValidationError('Failed to create bid');
  }

  await logAuditEvent({
    userId: actorUserId,
    action: 'create',
    resourceType: 'contract_bid',
    resourceId: String(created['id']),
    communityId,
    newValues: {
      contractId: payload.contractId,
      vendorName: payload.vendorName,
      bidAmount: payload.bidAmount,
    },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
