import {
  createScopedClient,
  elections,
  type ElectionStatus,
  type ElectionType,
} from '@propertypro/db';
import { and, desc, eq, inArray } from '@propertypro/db/filters';
import { ValidationError } from '@/lib/api/errors';

interface ElectionRecord {
  [key: string]: unknown;
  id: number;
  communityId: number;
  title: string;
  description: string | null;
  electionType: ElectionType;
  status: ElectionStatus;
  isSecretBallot: boolean;
  maxSelections: number;
  opensAt: Date;
  closesAt: Date;
  quorumPercentage: number;
  eligibleUnitCount: number;
  totalBallotsCast: number;
  certifiedAt: Date | null;
  resultsDocumentId: number | null;
  canceledReason: string | null;
  createdAt: Date;
  updatedAt: Date;
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

export async function listElectionsForCommunity(
  communityId: number,
  params: ListElectionsParams = {},
): Promise<ElectionRecord[]> {
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
      {
        id: elections.id,
        communityId: elections.communityId,
        title: elections.title,
        description: elections.description,
        electionType: elections.electionType,
        status: elections.status,
        isSecretBallot: elections.isSecretBallot,
        maxSelections: elections.maxSelections,
        opensAt: elections.opensAt,
        closesAt: elections.closesAt,
        quorumPercentage: elections.quorumPercentage,
        eligibleUnitCount: elections.eligibleUnitCount,
        totalBallotsCast: elections.totalBallotsCast,
        certifiedAt: elections.certifiedAt,
        resultsDocumentId: elections.resultsDocumentId,
        canceledReason: elections.canceledReason,
        createdAt: elections.createdAt,
        updatedAt: elections.updatedAt,
      },
      where as never,
    )
    .orderBy(desc(elections.opensAt), desc(elections.id))
    .limit(limit);

  return rows.map((row) => mapElectionRow(row as ElectionRecord));
}

export async function getElectionByIdForCommunity(
  communityId: number,
  electionId: number,
): Promise<ElectionRecord | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<ElectionRecord>(
    elections,
    {
      id: elections.id,
      communityId: elections.communityId,
      title: elections.title,
      description: elections.description,
      electionType: elections.electionType,
      status: elections.status,
      isSecretBallot: elections.isSecretBallot,
      maxSelections: elections.maxSelections,
      opensAt: elections.opensAt,
      closesAt: elections.closesAt,
      quorumPercentage: elections.quorumPercentage,
      eligibleUnitCount: elections.eligibleUnitCount,
      totalBallotsCast: elections.totalBallotsCast,
      certifiedAt: elections.certifiedAt,
      resultsDocumentId: elections.resultsDocumentId,
      canceledReason: elections.canceledReason,
      createdAt: elections.createdAt,
      updatedAt: elections.updatedAt,
    },
    eq(elections.id, electionId),
  );

  const row = rows[0];
  return row ? mapElectionRow(row as ElectionRecord) : null;
}
