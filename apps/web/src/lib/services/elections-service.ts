import { createHash, randomUUID } from 'node:crypto';
import {
  complianceAuditLog,
  createScopedClient,
  electionBallotSubmissions,
  electionBallots,
  electionCandidates,
  electionEligibilitySnapshots,
  electionProxies,
  elections,
  type AuditAction,
  type ElectionStatus,
  type ElectionType,
  type ProxyStatus,
  units,
} from '@propertypro/db';
import { and, desc, eq, inArray, isNotNull, sql } from '@propertypro/db/filters';
import { createUnscopedClient } from '@propertypro/db/unsafe';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
  ValidationError,
} from '@/lib/api/errors';
import { listActorUnitIds, requireActorUnitId } from '@/lib/units/actor-units';

interface ElectionRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  title: string;
  description: string | null;
  electionType: ElectionType;
  status: ElectionStatus;
  isSecretBallot: boolean;
  ballotSalt: string;
  maxSelections: number;
  opensAt: Date;
  closesAt: Date;
  quorumPercentage: number;
  eligibleUnitCount: number;
  totalBallotsCast: number;
  certifiedByUserId: string | null;
  certifiedAt: Date | null;
  resultsDocumentId: number | null;
  canceledReason: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ElectionCandidateRecord {
  [key: string]: unknown;
  id: number;
  electionId: number;
}

interface ElectionBallotSubmissionRecord {
  [key: string]: unknown;
  id: number;
  electionId: number;
  unitId: number;
  submittedByUserId: string;
  submissionFingerprint: string;
  voterHash: string;
  isAbstention: boolean;
  isProxyVote: boolean;
  proxyId: number | null;
  submittedAt: Date;
}

interface ElectionBallotRecord {
  [key: string]: unknown;
  id: number;
  submissionId: number;
  electionId: number;
  candidateId: number;
  unitId: number;
}

interface ElectionProxyRecord {
  [key: string]: unknown;
  id: number;
  electionId: number;
  grantorUserId: string;
  grantorUnitId: number;
  proxyHolderUserId: string;
  status: ProxyStatus;
  approvedByUserId: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ElectionEligibilitySnapshotRecord {
  [key: string]: unknown;
  id: number;
  electionId: number;
  unitId: number;
  ownerUserId: string;
  isEligible: boolean;
}

interface UnitEligibilityRecord {
  [key: string]: unknown;
  id: number;
  ownerUserId: string;
}

export interface ElectionVoteReceipt {
  id: number;
  hasVoted: true;
  submittedAt: string;
  submissionFingerprint: string;
  viaProxy: boolean;
  electionStatus: ElectionStatus;
}

export interface MyElectionVoteReceipt {
  hasVoted: boolean;
  submittedAt: string | null;
  submissionFingerprint: string | null;
  viaProxy: boolean;
  electionStatus: ElectionStatus;
}

export interface CastElectionVoteInput {
  selectedCandidateIds?: number[];
  isAbstention?: boolean;
  proxyId?: number | null;
  unitId?: number | null;
}

export interface CreateElectionProxyInput {
  proxyHolderUserId: string;
  grantorUnitId?: number | null;
}

export interface UpdateElectionCertificationInput {
  resultsDocumentId?: number | null;
}

export interface CancelElectionInput {
  canceledReason: string;
}

export interface ListElectionsParams {
  limit?: number;
  statuses?: ElectionStatus[];
}

const MAX_ELECTIONS_PAGE_SIZE = 25;
const DEFAULT_ELECTIONS_PAGE_SIZE = 10;
const VALID_ELECTION_STATUSES: readonly ElectionStatus[] = [
  'draft',
  'open',
  'closed',
  'certified',
  'canceled',
];

const ELECTION_RESULTS_TERMINAL_STATUSES = new Set<ElectionStatus>(['closed', 'certified', 'canceled']);

const ELECTION_SELECT_COLUMNS = {
  id: elections.id,
  communityId: elections.communityId,
  title: elections.title,
  description: elections.description,
  electionType: elections.electionType,
  status: elections.status,
  isSecretBallot: elections.isSecretBallot,
  ballotSalt: elections.ballotSalt,
  maxSelections: elections.maxSelections,
  opensAt: elections.opensAt,
  closesAt: elections.closesAt,
  quorumPercentage: elections.quorumPercentage,
  eligibleUnitCount: elections.eligibleUnitCount,
  totalBallotsCast: elections.totalBallotsCast,
  certifiedByUserId: elections.certifiedByUserId,
  certifiedAt: elections.certifiedAt,
  resultsDocumentId: elections.resultsDocumentId,
  canceledReason: elections.canceledReason,
  createdByUserId: elections.createdByUserId,
  createdAt: elections.createdAt,
  updatedAt: elections.updatedAt,
};

function assertElectionStatus(value: string): ElectionStatus {
  if (!VALID_ELECTION_STATUSES.includes(value as ElectionStatus)) {
    throw new ValidationError(`Unsupported election status: ${value}`);
  }

  return value as ElectionStatus;
}

function mapElectionRow(row: ElectionRecord): ElectionRecord {
  return {
    ...row,
    status: assertElectionStatus(row.status),
  };
}

/**
 * Strip server-only secrets before returning to the API layer.
 *
 * SECURITY INVARIANT: This function MUST be applied to every election value
 * that leaves the service layer via an exported function, except for
 * `getElectionForMutation` which intentionally retains `ballotSalt` for
 * voter hash generation. Verify this invariant in integration tests.
 */
function sanitizeElectionForResponse(election: ElectionRecord): Omit<ElectionRecord, 'ballotSalt'> {
  const { ballotSalt: _ignored, ...safe } = election;
  return safe;
}

/** Fetch the current time from the database to avoid clock skew on vote timing. */
async function getDbNow(
  tx: { execute: (query: ReturnType<typeof sql>) => Promise<unknown[]> },
): Promise<Date> {
  const rows = await tx.execute(sql`SELECT NOW() AS now`) as { now: Date }[];
  const row = rows[0];
  if (!row) throw new Error('Failed to fetch DB time');
  return row.now;
}

function normalizeSelectionIds(selectedCandidateIds: number[] | undefined, maxSelections: number): number[] {
  const normalized = (selectedCandidateIds ?? []).filter((candidateId) => Number.isInteger(candidateId) && candidateId > 0);
  const unique = [...new Set(normalized)];

  if (unique.length !== normalized.length) {
    throw new UnprocessableEntityError('Duplicate candidate selections are not allowed');
  }

  if (unique.length > maxSelections) {
    throw new UnprocessableEntityError(`A maximum of ${maxSelections} selections is allowed`);
  }

  return unique;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

function createSubmissionFingerprint(): string {
  return randomUUID().replace(/-/g, '').slice(0, 24);
}

function createVoterHash(ballotSalt: string, unitId: number, actorUserId: string, proxyId?: number | null): string {
  return createHash('sha256')
    .update(`${ballotSalt}:${unitId}:${actorUserId}:${proxyId ?? 'self'}`)
    .digest('hex');
}

function electionStatusAllowsProxyDesignation(status: ElectionStatus): boolean {
  return !ELECTION_RESULTS_TERMINAL_STATUSES.has(status);
}

function assertElectionOpenForVoting(election: ElectionRecord, dbNow: Date): void {
  if (election.status !== 'open') {
    throw new UnprocessableEntityError('Election is not open for voting');
  }

  if (election.opensAt > dbNow) {
    throw new UnprocessableEntityError('Election voting has not opened yet');
  }

  if (election.closesAt <= dbNow) {
    throw new UnprocessableEntityError('Election voting is closed');
  }
}

function buildBallotCastAuditMetadata(
  payload: { isAbstention: boolean; isProxyVote: boolean; selectionCount: number; requestId?: string | null },
): Record<string, unknown> {
  return {
    isAbstention: payload.isAbstention,
    isProxyVote: payload.isProxyVote,
    selectionCount: payload.selectionCount,
    requestId: payload.requestId ?? null,
  };
}

/**
 * Authorization contract: callers MUST verify tenant membership and election
 * permissions before invoking these mutations. This escape hatch is limited to
 * wrapping tenant-scoped writes and the audit insert in one DB transaction.
 */
function createElectionMutationClient() {
  return createUnscopedClient();
}

function createElectionScopedClient(communityId: number, tx: unknown) {
  return createScopedClient(
    communityId,
    tx as unknown as Parameters<typeof createScopedClient>[1],
  );
}

type AuditInsertExecutor = {
  insert(table: typeof complianceAuditLog): {
    values(payload: Record<string, unknown>): Promise<unknown>;
  };
};

async function insertAuditEventInTransaction(
  tx: AuditInsertExecutor,
  params: {
    userId: string | null;
    action: AuditAction;
    resourceType: string;
    resourceId: string;
    communityId: number;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.insert(complianceAuditLog).values({
    userId: params.userId,
    communityId: params.communityId,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    oldValues: params.oldValues ?? null,
    newValues: params.newValues ?? null,
    metadata: params.metadata ?? null,
  });
}

async function getElectionForMutation(
  scoped: ReturnType<typeof createScopedClient>,
  electionId: number,
): Promise<ElectionRecord> {
  const rows = await scoped.selectFrom<ElectionRecord>(
    elections,
    ELECTION_SELECT_COLUMNS,
    eq(elections.id, electionId),
  );

  const election = rows[0];
  if (!election) {
    throw new NotFoundError('Election not found');
  }

  return mapElectionRow(election as ElectionRecord);
}

async function getCandidateIdsForElection(
  scoped: ReturnType<typeof createScopedClient>,
  electionId: number,
): Promise<number[]> {
  const rows = await scoped.selectFrom<ElectionCandidateRecord>(
    electionCandidates,
    {
      id: electionCandidates.id,
      electionId: electionCandidates.electionId,
    },
    eq(electionCandidates.electionId, electionId),
  );

  return rows.map((row) => row.id);
}

async function getExistingSubmissionForUnit(
  scoped: ReturnType<typeof createScopedClient>,
  electionId: number,
  unitId: number,
): Promise<ElectionBallotSubmissionRecord | null> {
  const rows = await scoped.selectFrom<ElectionBallotSubmissionRecord>(
    electionBallotSubmissions,
    {
      id: electionBallotSubmissions.id,
      electionId: electionBallotSubmissions.electionId,
      unitId: electionBallotSubmissions.unitId,
      submittedByUserId: electionBallotSubmissions.submittedByUserId,
      submissionFingerprint: electionBallotSubmissions.submissionFingerprint,
      voterHash: electionBallotSubmissions.voterHash,
      isAbstention: electionBallotSubmissions.isAbstention,
      isProxyVote: electionBallotSubmissions.isProxyVote,
      proxyId: electionBallotSubmissions.proxyId,
      submittedAt: electionBallotSubmissions.submittedAt,
    },
    and(
      eq(electionBallotSubmissions.electionId, electionId),
      eq(electionBallotSubmissions.unitId, unitId),
    ),
  );

  return (rows[0] as ElectionBallotSubmissionRecord | undefined) ?? null;
}

async function getBallotCandidateIdsForSubmission(
  scoped: ReturnType<typeof createScopedClient>,
  submissionId: number,
): Promise<number[]> {
  const rows = await scoped.selectFrom<ElectionBallotRecord>(
    electionBallots,
    {
      id: electionBallots.id,
      submissionId: electionBallots.submissionId,
      electionId: electionBallots.electionId,
      candidateId: electionBallots.candidateId,
      unitId: electionBallots.unitId,
    },
    eq(electionBallots.submissionId, submissionId),
  );

  return rows.map((row) => row.candidateId).sort((a, b) => a - b);
}

function assertSameLogicalSubmission(
  existing: ElectionBallotSubmissionRecord,
  existingCandidateIds: number[],
  requestedCandidateIds: number[],
  isAbstention: boolean,
  proxyId: number | null,
): void {
  if (
    existing.isAbstention !== isAbstention ||
    existing.isProxyVote !== (proxyId !== null) ||
    (existing.proxyId ?? null) !== proxyId
  ) {
    throw new AppError('This unit has already submitted a ballot for this election', 409, 'CONFLICT');
  }

  const normalizedRequested = [...requestedCandidateIds].sort((a, b) => a - b);
  if (existingCandidateIds.length !== normalizedRequested.length) {
    throw new AppError('This unit has already submitted a ballot for this election', 409, 'CONFLICT');
  }

  for (let index = 0; index < existingCandidateIds.length; index += 1) {
    if (existingCandidateIds[index] !== normalizedRequested[index]) {
      throw new AppError('This unit has already submitted a ballot for this election', 409, 'CONFLICT');
    }
  }
}

async function resolveVotingUnit(
  scoped: ReturnType<typeof createScopedClient>,
  actorUserId: string,
  requestedUnitId: number | null | undefined,
  proxyId: number | null,
  electionId: number,
): Promise<{ unitId: number; proxy: ElectionProxyRecord | null }> {
  if (proxyId !== null) {
    const proxyRows = await scoped.selectFrom<ElectionProxyRecord>(
      electionProxies,
      {
        id: electionProxies.id,
        electionId: electionProxies.electionId,
        grantorUserId: electionProxies.grantorUserId,
        grantorUnitId: electionProxies.grantorUnitId,
        proxyHolderUserId: electionProxies.proxyHolderUserId,
        status: electionProxies.status,
        approvedByUserId: electionProxies.approvedByUserId,
        approvedAt: electionProxies.approvedAt,
        createdAt: electionProxies.createdAt,
        updatedAt: electionProxies.updatedAt,
      },
      and(eq(electionProxies.id, proxyId), eq(electionProxies.electionId, electionId)),
    );

    const proxy = (proxyRows[0] as ElectionProxyRecord | undefined) ?? null;
    if (!proxy) {
      throw new NotFoundError('Proxy designation not found');
    }

    if (proxy.proxyHolderUserId !== actorUserId) {
      throw new ForbiddenError('You are not authorized to cast this proxy ballot');
    }

    if (proxy.status !== 'approved') {
      throw new UnprocessableEntityError('Only approved proxies can be used for voting');
    }

    if (requestedUnitId != null && requestedUnitId !== proxy.grantorUnitId) {
      throw new UnprocessableEntityError('Proxy ballots must use the grantor unit associated with the approved proxy');
    }

    return {
      unitId: proxy.grantorUnitId,
      proxy,
    };
  }

  const actorUnitIds = await listActorUnitIds(scoped, actorUserId);
  if (requestedUnitId != null) {
    if (!actorUnitIds.includes(requestedUnitId)) {
      throw new ForbiddenError('You are not authorized to vote for that unit');
    }

    return {
      unitId: requestedUnitId,
      proxy: null,
    };
  }

  return {
    unitId: await requireActorUnitId(scoped, actorUserId),
    proxy: null,
  };
}

async function getExistingReceiptForActorUnits(
  scoped: ReturnType<typeof createScopedClient>,
  electionId: number,
  actorUnitIds: number[],
): Promise<ElectionBallotSubmissionRecord | null> {
  if (actorUnitIds.length === 0) {
    return null;
  }

  const rows = await scoped.selectFrom<ElectionBallotSubmissionRecord>(
    electionBallotSubmissions,
    {
      id: electionBallotSubmissions.id,
      electionId: electionBallotSubmissions.electionId,
      unitId: electionBallotSubmissions.unitId,
      submittedByUserId: electionBallotSubmissions.submittedByUserId,
      submissionFingerprint: electionBallotSubmissions.submissionFingerprint,
      voterHash: electionBallotSubmissions.voterHash,
      isAbstention: electionBallotSubmissions.isAbstention,
      isProxyVote: electionBallotSubmissions.isProxyVote,
      proxyId: electionBallotSubmissions.proxyId,
      submittedAt: electionBallotSubmissions.submittedAt,
    },
    and(
      eq(electionBallotSubmissions.electionId, electionId),
      inArray(electionBallotSubmissions.unitId, actorUnitIds),
    ),
  )
    .orderBy(desc(electionBallotSubmissions.submittedAt), desc(electionBallotSubmissions.id))
    .limit(1);

  return (rows[0] as ElectionBallotSubmissionRecord | undefined) ?? null;
}

async function materializeEligibilitySnapshot(
  scoped: ReturnType<typeof createScopedClient>,
  electionId: number,
): Promise<{ insertedCount: number; eligibleUnitCount: number }> {
  const existing = await scoped.selectFrom<ElectionEligibilitySnapshotRecord>(
    electionEligibilitySnapshots,
    {
      id: electionEligibilitySnapshots.id,
      electionId: electionEligibilitySnapshots.electionId,
      unitId: electionEligibilitySnapshots.unitId,
      ownerUserId: electionEligibilitySnapshots.ownerUserId,
      isEligible: electionEligibilitySnapshots.isEligible,
    },
    eq(electionEligibilitySnapshots.electionId, electionId),
  );

  if (existing.length > 0) {
    return {
      insertedCount: 0,
      eligibleUnitCount: existing.filter((row) => row.isEligible).length,
    };
  }

  const unitRows = await scoped.selectFrom<UnitEligibilityRecord>(
    units,
    {
      id: units.id,
      ownerUserId: units.ownerUserId,
    },
    isNotNull(units.ownerUserId),
  );

  if (unitRows.length === 0) {
    return { insertedCount: 0, eligibleUnitCount: 0 };
  }

  await scoped.insert(
    electionEligibilitySnapshots,
    unitRows.map((unitRow) => ({
      electionId,
      unitId: unitRow.id,
      ownerUserId: unitRow.ownerUserId,
      isEligible: true,
      ineligibilityReason: null,
    })),
  );

  return {
    insertedCount: unitRows.length,
    eligibleUnitCount: unitRows.length,
  };
}

async function updateElectionStatus(
  scoped: ReturnType<typeof createScopedClient>,
  electionId: number,
  patch: Record<string, unknown>,
): Promise<Omit<ElectionRecord, 'ballotSalt'>> {
  const rows = await scoped.update(elections, patch, eq(elections.id, electionId));
  const updated = rows[0];
  if (!updated) {
    throw new NotFoundError('Election not found');
  }

  return sanitizeElectionForResponse(mapElectionRow(updated as ElectionRecord));
}

export async function listElectionsForCommunity(
  communityId: number,
  params: ListElectionsParams = {},
): Promise<Omit<ElectionRecord, 'ballotSalt'>[]> {
  const scoped = createScopedClient(communityId);
  const limit = Math.min(params.limit ?? DEFAULT_ELECTIONS_PAGE_SIZE, MAX_ELECTIONS_PAGE_SIZE);
  const filters = [];

  if (params.statuses && params.statuses.length > 0) {
    filters.push(inArray(elections.status, params.statuses));
  }

  const where = filters.length > 0 ? and(...filters) : undefined;
  const rows = await scoped
    .selectFrom<ElectionRecord>(
      elections,
      ELECTION_SELECT_COLUMNS,
      where as never,
    )
    .orderBy(desc(elections.opensAt), desc(elections.id))
    .limit(limit);

  return rows.map((row) => sanitizeElectionForResponse(mapElectionRow(row as ElectionRecord)));
}

export async function getElectionByIdForCommunity(
  communityId: number,
  electionId: number,
): Promise<Omit<ElectionRecord, 'ballotSalt'> | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<ElectionRecord>(
    elections,
    ELECTION_SELECT_COLUMNS,
    eq(elections.id, electionId),
  );

  const row = rows[0];
  return row ? sanitizeElectionForResponse(mapElectionRow(row as ElectionRecord)) : null;
}

export async function getMyElectionVoteReceiptForCommunity(
  communityId: number,
  electionId: number,
  actorUserId: string,
): Promise<MyElectionVoteReceipt> {
  const election = await getElectionByIdForCommunity(communityId, electionId);
  if (!election) {
    throw new NotFoundError('Election not found');
  }
  const scoped = createScopedClient(communityId);
  const actorUnitIds = await listActorUnitIds(scoped, actorUserId);
  const submission = await getExistingReceiptForActorUnits(scoped, electionId, actorUnitIds);

  return {
    hasVoted: submission !== null,
    submittedAt: submission?.submittedAt.toISOString() ?? null,
    submissionFingerprint: submission?.submissionFingerprint ?? null,
    viaProxy: submission?.isProxyVote ?? false,
    electionStatus: election.status as ElectionStatus,
  };
}

export async function castElectionVoteForCommunity(
  communityId: number,
  electionId: number,
  actorUserId: string,
  input: CastElectionVoteInput,
  requestId?: string | null,
): Promise<ElectionVoteReceipt> {
  const db = createElectionMutationClient();

  return db.transaction(async (tx) => {
    const scoped = createElectionScopedClient(communityId, tx);
    const election = await getElectionForMutation(scoped, electionId);
    const dbNow = await getDbNow(tx);
    assertElectionOpenForVoting(election, dbNow);

    const proxyId = input.proxyId ?? null;
    const { unitId, proxy } = await resolveVotingUnit(scoped, actorUserId, input.unitId, proxyId, electionId);

    const snapshotRows = await scoped.selectFrom<ElectionEligibilitySnapshotRecord>(
      electionEligibilitySnapshots,
      {
        id: electionEligibilitySnapshots.id,
        electionId: electionEligibilitySnapshots.electionId,
        unitId: electionEligibilitySnapshots.unitId,
        ownerUserId: electionEligibilitySnapshots.ownerUserId,
        isEligible: electionEligibilitySnapshots.isEligible,
      },
      and(
        eq(electionEligibilitySnapshots.electionId, electionId),
        eq(electionEligibilitySnapshots.unitId, unitId),
      ),
    );

    if (snapshotRows.length === 0 || !snapshotRows[0]?.isEligible) {
      throw new ForbiddenError('This unit is not eligible to vote in the selected election');
    }

    const isAbstention = input.isAbstention === true;
    const selectedCandidateIds = normalizeSelectionIds(input.selectedCandidateIds, election.maxSelections);

    if (isAbstention && selectedCandidateIds.length > 0) {
      throw new UnprocessableEntityError('Abstentions cannot include candidate selections');
    }

    if (!isAbstention && selectedCandidateIds.length === 0) {
      throw new UnprocessableEntityError('At least one candidate must be selected');
    }

    const validCandidateIds = await getCandidateIdsForElection(scoped, electionId);
    if (selectedCandidateIds.some((candidateId) => !validCandidateIds.includes(candidateId))) {
      throw new UnprocessableEntityError('Selected candidates must belong to this election');
    }

    const submissionFingerprint = createSubmissionFingerprint();
    const voterHash = createVoterHash(election.ballotSalt, unitId, actorUserId, proxyId);

    try {
      const [submission] = await scoped.insert(electionBallotSubmissions, {
        electionId,
        unitId,
        submittedByUserId: actorUserId,
        submissionFingerprint,
        voterHash,
        isAbstention,
        isProxyVote: proxy !== null,
        proxyId,
      });

      if (!submission) {
        throw new Error('Failed to record ballot submission');
      }

      const typedSubmission = submission as ElectionBallotSubmissionRecord;

      if (!isAbstention) {
        await scoped.insert(
          electionBallots,
          selectedCandidateIds.map((candidateId) => ({
            electionId,
            submissionId: typedSubmission.id,
            candidateId,
            unitId,
            voterHash,
            isAbstention: false,
            isProxyVote: proxy !== null,
            proxyId,
          })),
        );
      }

      await updateElectionStatus(scoped, electionId, {
        totalBallotsCast: election.totalBallotsCast + 1,
      });

      await insertAuditEventInTransaction(tx, {
        userId: actorUserId,
        action: 'ballot_cast',
        resourceType: 'election_ballot_submission',
        resourceId: String(typedSubmission.id),
        communityId,
        metadata: buildBallotCastAuditMetadata({
          isAbstention,
          isProxyVote: proxy !== null,
          selectionCount: selectedCandidateIds.length,
          requestId,
        }),
      });

      return {
        id: typedSubmission.id,
        hasVoted: true,
        submittedAt: typedSubmission.submittedAt.toISOString(),
        submissionFingerprint: typedSubmission.submissionFingerprint,
        viaProxy: typedSubmission.isProxyVote,
        electionStatus: election.status,
      };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const existing = await getExistingSubmissionForUnit(scoped, electionId, unitId);
      if (!existing) {
        throw new AppError('This unit has already submitted a ballot for this election', 409, 'CONFLICT');
      }

      const existingCandidateIds = await getBallotCandidateIdsForSubmission(scoped, existing.id);
      assertSameLogicalSubmission(existing, existingCandidateIds, selectedCandidateIds, isAbstention, proxyId);

      return {
        id: existing.id,
        hasVoted: true,
        submittedAt: existing.submittedAt.toISOString(),
        submissionFingerprint: existing.submissionFingerprint,
        viaProxy: existing.isProxyVote,
        electionStatus: election.status,
      };
    }
  });
}

export async function openElectionForCommunity(
  communityId: number,
  electionId: number,
  actorUserId: string,
  requestId?: string | null,
): Promise<Omit<ElectionRecord, 'ballotSalt'>> {
  const db = createElectionMutationClient();

  return db.transaction(async (tx) => {
    const scoped = createElectionScopedClient(communityId, tx);
    const election = await getElectionForMutation(scoped, electionId);

    if (election.status === 'open') {
      return sanitizeElectionForResponse(election);
    }

    if (election.status !== 'draft') {
      throw new UnprocessableEntityError('Only draft elections can be opened');
    }

    const snapshot = await materializeEligibilitySnapshot(scoped, electionId);
    const updated = await updateElectionStatus(scoped, electionId, {
      status: 'open',
      eligibleUnitCount: snapshot.eligibleUnitCount,
    });

    await insertAuditEventInTransaction(tx, {
      userId: actorUserId,
      action: 'election_opened',
      resourceType: 'election',
      resourceId: String(electionId),
      communityId,
      oldValues: { status: election.status },
      newValues: { status: updated.status, eligibleUnitCount: updated.eligibleUnitCount },
      metadata: { requestId: requestId ?? null },
    });

    if (snapshot.insertedCount > 0) {
      await insertAuditEventInTransaction(tx, {
        userId: actorUserId,
        action: 'election_eligibility_snapshotted',
        resourceType: 'election',
        resourceId: String(electionId),
        communityId,
        metadata: {
          eligibleUnitCount: snapshot.eligibleUnitCount,
          insertedCount: snapshot.insertedCount,
          requestId: requestId ?? null,
        },
      });
    }

    return updated;
  });
}

export async function closeElectionForCommunity(
  communityId: number,
  electionId: number,
  actorUserId: string,
  requestId?: string | null,
): Promise<Omit<ElectionRecord, 'ballotSalt'>> {
  const db = createElectionMutationClient();

  return db.transaction(async (tx) => {
    const scoped = createElectionScopedClient(communityId, tx);
    const election = await getElectionForMutation(scoped, electionId);

    if (election.status === 'closed') {
      return sanitizeElectionForResponse(election);
    }
    if (election.status === 'certified') {
      throw new UnprocessableEntityError('Election has already been certified and cannot be closed again');
    }
    if (election.status === 'canceled') {
      throw new UnprocessableEntityError('Election has been canceled and cannot be closed');
    }

    if (election.status !== 'open') {
      throw new UnprocessableEntityError('Only open elections can be closed');
    }

    const updated = await updateElectionStatus(scoped, electionId, { status: 'closed' });
    await insertAuditEventInTransaction(tx, {
      userId: actorUserId,
      action: 'election_closed',
      resourceType: 'election',
      resourceId: String(electionId),
      communityId,
      oldValues: { status: election.status },
      newValues: { status: updated.status },
      metadata: { requestId: requestId ?? null },
    });

    return updated;
  });
}

export async function certifyElectionForCommunity(
  communityId: number,
  electionId: number,
  actorUserId: string,
  input: UpdateElectionCertificationInput = {},
  requestId?: string | null,
): Promise<Omit<ElectionRecord, 'ballotSalt'>> {
  const db = createElectionMutationClient();

  return db.transaction(async (tx) => {
    const scoped = createElectionScopedClient(communityId, tx);
    const election = await getElectionForMutation(scoped, electionId);

    if (election.status === 'certified') {
      return sanitizeElectionForResponse(election);
    }

    if (election.status !== 'closed') {
      throw new UnprocessableEntityError('Only closed elections can be certified');
    }

    const certifiedAt = new Date();
    const updated = await updateElectionStatus(scoped, electionId, {
      status: 'certified',
      certifiedByUserId: actorUserId,
      certifiedAt,
      resultsDocumentId: input.resultsDocumentId ?? election.resultsDocumentId,
    });

    await insertAuditEventInTransaction(tx, {
      userId: actorUserId,
      action: 'election_certified',
      resourceType: 'election',
      resourceId: String(electionId),
      communityId,
      oldValues: { status: election.status },
      newValues: {
        status: updated.status,
        certifiedAt: certifiedAt.toISOString(),
        hasResultsDocument: updated.resultsDocumentId !== null,
      },
      metadata: { requestId: requestId ?? null },
    });

    return updated;
  });
}

export async function cancelElectionForCommunity(
  communityId: number,
  electionId: number,
  actorUserId: string,
  input: CancelElectionInput,
  requestId?: string | null,
): Promise<Omit<ElectionRecord, 'ballotSalt'>> {
  const db = createElectionMutationClient();

  return db.transaction(async (tx) => {
    const scoped = createElectionScopedClient(communityId, tx);
    const election = await getElectionForMutation(scoped, electionId);

    if (election.status === 'canceled') {
      return sanitizeElectionForResponse(election);
    }

    if (election.status === 'draft') {
      throw new UnprocessableEntityError('Draft elections should be deleted, not canceled');
    }

    if (election.status === 'certified') {
      throw new UnprocessableEntityError('Certified elections cannot be canceled');
    }

    const updated = await updateElectionStatus(scoped, electionId, {
      status: 'canceled',
      canceledReason: input.canceledReason.trim(),
    });

    await insertAuditEventInTransaction(tx, {
      userId: actorUserId,
      action: 'election_canceled',
      resourceType: 'election',
      resourceId: String(electionId),
      communityId,
      oldValues: { status: election.status },
      newValues: { status: updated.status, canceledReason: updated.canceledReason },
      metadata: { requestId: requestId ?? null },
    });

    return updated;
  });
}

export async function createElectionProxyForCommunity(
  communityId: number,
  electionId: number,
  actorUserId: string,
  input: CreateElectionProxyInput,
  requestId?: string | null,
): Promise<ElectionProxyRecord> {
  const db = createElectionMutationClient();

  return db.transaction(async (tx) => {
    const scoped = createElectionScopedClient(communityId, tx);
    const election = await getElectionForMutation(scoped, electionId);

    if (!electionStatusAllowsProxyDesignation(election.status)) {
      throw new UnprocessableEntityError('Proxy designations are closed for this election');
    }

    const actorUnitIds = await listActorUnitIds(scoped, actorUserId);
    const grantorUnitId = input.grantorUnitId ?? (await requireActorUnitId(scoped, actorUserId));
    if (!actorUnitIds.includes(grantorUnitId)) {
      throw new ForbiddenError('You are not authorized to designate a proxy for that unit');
    }

    try {
      const [proxy] = await scoped.insert(electionProxies, {
        electionId,
        grantorUserId: actorUserId,
        grantorUnitId,
        proxyHolderUserId: input.proxyHolderUserId,
        status: 'pending',
      });

      if (!proxy) {
        throw new Error('Failed to create proxy designation');
      }

      const typedProxy = proxy as ElectionProxyRecord;
      await insertAuditEventInTransaction(tx, {
        userId: actorUserId,
        action: 'proxy_designated',
        resourceType: 'election_proxy',
        resourceId: String(typedProxy.id),
        communityId,
        metadata: {
          electionId,
          status: typedProxy.status,
          requestId: requestId ?? null,
        },
      });

      return typedProxy;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppError('This unit already has a proxy designation for the election', 409, 'CONFLICT');
      }

      throw error;
    }
  });
}

async function updateProxyStatusForCommunity(
  communityId: number,
  electionId: number,
  proxyId: number,
  actorUserId: string,
  nextStatus: Exclude<ProxyStatus, 'pending'>,
  requestId?: string | null,
): Promise<ElectionProxyRecord> {
  const db = createElectionMutationClient();

  return db.transaction(async (tx) => {
    const scoped = createElectionScopedClient(communityId, tx);
    const rows = await scoped.selectFrom<ElectionProxyRecord>(
      electionProxies,
      {
        id: electionProxies.id,
        electionId: electionProxies.electionId,
        grantorUserId: electionProxies.grantorUserId,
        grantorUnitId: electionProxies.grantorUnitId,
        proxyHolderUserId: electionProxies.proxyHolderUserId,
        status: electionProxies.status,
        approvedByUserId: electionProxies.approvedByUserId,
        approvedAt: electionProxies.approvedAt,
        createdAt: electionProxies.createdAt,
        updatedAt: electionProxies.updatedAt,
      },
      and(eq(electionProxies.id, proxyId), eq(electionProxies.electionId, electionId)),
    );

    const proxy = (rows[0] as ElectionProxyRecord | undefined) ?? null;
    if (!proxy) {
      throw new NotFoundError('Proxy designation not found');
    }

    if (proxy.status === nextStatus) {
      return proxy;
    }

    const patch: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === 'approved') {
      patch.approvedByUserId = actorUserId;
      patch.approvedAt = new Date();
    } else {
      patch.approvedByUserId = null;
      patch.approvedAt = null;
    }

    const updatedRows = await scoped.update(
      electionProxies,
      patch,
      and(eq(electionProxies.id, proxyId), eq(electionProxies.electionId, electionId)),
    );

    const updated = updatedRows[0];
    if (!updated) {
      throw new NotFoundError('Proxy designation not found');
    }

    const actionMap: Record<Exclude<ProxyStatus, 'pending'>, AuditAction> = {
      approved: 'proxy_approved',
      rejected: 'proxy_rejected',
      revoked: 'proxy_revoked',
    };

    await insertAuditEventInTransaction(tx, {
      userId: actorUserId,
      action: actionMap[nextStatus],
      resourceType: 'election_proxy',
      resourceId: String(proxyId),
      communityId,
      oldValues: { status: proxy.status },
      newValues: { status: nextStatus },
      metadata: {
        electionId,
        requestId: requestId ?? null,
      },
    });

    return updated as ElectionProxyRecord;
  });
}

export async function approveElectionProxyForCommunity(
  communityId: number,
  electionId: number,
  proxyId: number,
  actorUserId: string,
  requestId?: string | null,
): Promise<ElectionProxyRecord> {
  return updateProxyStatusForCommunity(communityId, electionId, proxyId, actorUserId, 'approved', requestId);
}

export async function rejectElectionProxyForCommunity(
  communityId: number,
  electionId: number,
  proxyId: number,
  actorUserId: string,
  requestId?: string | null,
): Promise<ElectionProxyRecord> {
  return updateProxyStatusForCommunity(communityId, electionId, proxyId, actorUserId, 'rejected', requestId);
}

export async function revokeElectionProxyForCommunity(
  communityId: number,
  electionId: number,
  proxyId: number,
  actorUserId: string,
  actorIsAdmin: boolean,
  requestId?: string | null,
): Promise<ElectionProxyRecord> {
  // Check ownership before delegating — grantor can revoke their own proxy; admins can revoke any
  const scoped = createScopedClient(communityId);
  const proxyRows = await scoped.selectFrom<{ id: number; grantorUserId: string }>(
    electionProxies,
    { id: electionProxies.id, grantorUserId: electionProxies.grantorUserId },
    and(eq(electionProxies.id, proxyId), eq(electionProxies.electionId, electionId)),
  );
  const proxy = (proxyRows[0] as { id: number; grantorUserId: string } | undefined) ?? null;
  if (!proxy) {
    throw new NotFoundError('Proxy designation not found');
  }

  const isGrantor = proxy.grantorUserId === actorUserId;
  if (!isGrantor && !actorIsAdmin) {
    throw new ForbiddenError('Only the proxy grantor or an admin can revoke a proxy');
  }

  return updateProxyStatusForCommunity(communityId, electionId, proxyId, actorUserId, 'revoked', requestId);
}

export async function snapshotElectionEligibilityForCommunity(
  communityId: number,
  electionId: number,
  actorUserId: string,
  requestId?: string | null,
): Promise<{ eligibleUnitCount: number; insertedCount: number }> {
  const db = createElectionMutationClient();

  return db.transaction(async (tx) => {
    const scoped = createElectionScopedClient(communityId, tx);
    await getElectionForMutation(scoped, electionId);

    const snapshot = await materializeEligibilitySnapshot(scoped, electionId);
    if (snapshot.insertedCount > 0) {
      await updateElectionStatus(scoped, electionId, {
        eligibleUnitCount: snapshot.eligibleUnitCount,
      });

      await insertAuditEventInTransaction(tx, {
        userId: actorUserId,
        action: 'election_eligibility_snapshotted',
        resourceType: 'election',
        resourceId: String(electionId),
        communityId,
        metadata: {
          eligibleUnitCount: snapshot.eligibleUnitCount,
          insertedCount: snapshot.insertedCount,
          requestId: requestId ?? null,
        },
      });
    }

    return snapshot;
  });
}
