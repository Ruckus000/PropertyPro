/**
 * Elections tables — statutory e-voting per Florida §718.128 (condos) and §720.317 (HOAs).
 *
 * Tables:
 * - elections: Election/ballot measure definitions with lifecycle status
 * - election_candidates: Candidates or options on a ballot
 * - election_ballots: Immutable append-only vote records (one per unit per candidate)
 * - election_proxies: Proxy voting designations with admin approval workflow
 * - election_eligibility_snapshots: Point-in-time eligibility snapshot at election open
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { documents } from './documents';
import { units } from './units';
import { users } from './users';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export type ElectionType =
  | 'board_election'
  | 'budget_approval'
  | 'rule_amendment'
  | 'special_assessment'
  | 'custom';

export type ElectionStatus =
  | 'draft'
  | 'open'
  | 'closed'
  | 'certified'
  | 'canceled';

export type ProxyStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

// ---------------------------------------------------------------------------
// elections
// ---------------------------------------------------------------------------

export const elections = pgTable(
  'elections',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    electionType: text('election_type').$type<ElectionType>().notNull(),
    status: text('status').$type<ElectionStatus>().notNull().default('draft'),
    isSecretBallot: boolean('is_secret_ballot').notNull().default(true),
    ballotSalt: text('ballot_salt').notNull(),
    maxSelections: integer('max_selections').notNull().default(1),
    opensAt: timestamp('opens_at', { withTimezone: true }).notNull(),
    closesAt: timestamp('closes_at', { withTimezone: true }).notNull(),
    quorumPercentage: integer('quorum_percentage').notNull().default(50),
    eligibleUnitCount: integer('eligible_unit_count').notNull().default(0),
    totalBallotsCast: integer('total_ballots_cast').notNull().default(0),
    certifiedByUserId: uuid('certified_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    certifiedAt: timestamp('certified_at', { withTimezone: true }),
    resultsDocumentId: bigint('results_document_id', { mode: 'number' }).references(
      () => documents.id,
      { onDelete: 'set null' },
    ),
    canceledReason: text('canceled_reason'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_elections_community_status').on(table.communityId, table.status),
    index('idx_elections_community_dates').on(table.communityId, table.opensAt, table.closesAt),
    check('elections_closes_after_opens', sql`${table.closesAt} > ${table.opensAt}`),
    check('elections_quorum_range', sql`${table.quorumPercentage} >= 1 AND ${table.quorumPercentage} <= 100`),
    check('elections_max_selections_positive', sql`${table.maxSelections} >= 1`),
  ],
);

// ---------------------------------------------------------------------------
// election_candidates
// ---------------------------------------------------------------------------

export const electionCandidates = pgTable(
  'election_candidates',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    electionId: bigint('election_id', { mode: 'number' })
      .notNull()
      .references(() => elections.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    description: text('description'),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_election_candidates_election').on(table.electionId, table.sortOrder),
  ],
);

// ---------------------------------------------------------------------------
// election_ballots (append-only — NO updatedAt, NO deletedAt)
// ---------------------------------------------------------------------------

export const electionBallots = pgTable(
  'election_ballots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    electionId: bigint('election_id', { mode: 'number' })
      .notNull()
      .references(() => elections.id, { onDelete: 'cascade' }),
    candidateId: bigint('candidate_id', { mode: 'number' })
      .notNull()
      .references(() => electionCandidates.id, { onDelete: 'cascade' }),
    unitId: bigint('unit_id', { mode: 'number' })
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    voterHash: text('voter_hash').notNull(),
    isAbstention: boolean('is_abstention').notNull().default(false),
    isProxyVote: boolean('is_proxy_vote').notNull().default(false),
    proxyId: bigint('proxy_id', { mode: 'number' }),
    castAt: timestamp('cast_at', { withTimezone: true }).notNull().defaultNow(),
    // NO updatedAt, NO deletedAt — append-only / immutable
  },
  (table) => [
    index('idx_election_ballots_election').on(table.electionId),
    index('idx_election_ballots_unit').on(table.electionId, table.unitId),
    uniqueIndex('uq_election_ballots_unit_candidate').on(
      table.electionId,
      table.unitId,
      table.candidateId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// election_proxies
// ---------------------------------------------------------------------------

export const electionProxies = pgTable(
  'election_proxies',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    electionId: bigint('election_id', { mode: 'number' })
      .notNull()
      .references(() => elections.id, { onDelete: 'cascade' }),
    grantorUserId: uuid('grantor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    grantorUnitId: bigint('grantor_unit_id', { mode: 'number' })
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    proxyHolderUserId: uuid('proxy_holder_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').$type<ProxyStatus>().notNull().default('pending'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_election_proxies_election').on(table.electionId, table.status),
    index('idx_election_proxies_holder').on(table.proxyHolderUserId, table.electionId),
    uniqueIndex('uq_election_proxies_grantor')
      .on(table.electionId, table.grantorUnitId)
      .where(sql`${table.deletedAt} is null`),
  ],
);

// ---------------------------------------------------------------------------
// election_eligibility_snapshots (append-only — NO updatedAt, NO deletedAt)
// ---------------------------------------------------------------------------

export const electionEligibilitySnapshots = pgTable(
  'election_eligibility_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    electionId: bigint('election_id', { mode: 'number' })
      .notNull()
      .references(() => elections.id, { onDelete: 'cascade' }),
    unitId: bigint('unit_id', { mode: 'number' })
      .notNull()
      .references(() => units.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'set null' }),
    isEligible: boolean('is_eligible').notNull().default(true),
    ineligibilityReason: text('ineligibility_reason'),
    snapshotAt: timestamp('snapshot_at', { withTimezone: true }).notNull().defaultNow(),
    // NO updatedAt, NO deletedAt — append-only / immutable snapshot
  },
  (table) => [
    index('idx_election_eligibility_election').on(table.electionId),
    uniqueIndex('uq_election_eligibility_unit').on(table.electionId, table.unitId),
  ],
);
