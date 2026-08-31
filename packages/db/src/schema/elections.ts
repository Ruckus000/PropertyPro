/**
 * Elections tables — statutory e-voting per Florida §718.128 (condos) and §720.317 (HOAs).
 *
 * Tables:
 * - elections: Election/ballot measure definitions with lifecycle status
 * - election_candidates: Candidates or options on a ballot
 * - election_ballot_submissions: Immutable logical ballot submissions (one per unit per election)
 * - election_ballots: Immutable append-only vote records (one per selected candidate)
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
// election_ballot_submissions (append-only — NO updatedAt, NO deletedAt)
// ---------------------------------------------------------------------------

export const electionBallotSubmissions = pgTable(
  'election_ballot_submissions',
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
    submittedByUserId: uuid('submitted_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    submissionFingerprint: text('submission_fingerprint').notNull(),
    voterHash: text('voter_hash').notNull(),
    /**
     * Digest of the sorted candidate-id selection.
     *
     * Exists so a duplicate submission can be recognised as *the same* ballot
     * without reading the ballot rows back. That read-back was the only reason
     * `election_ballots` needed a `submission_id`, and that column was the link
     * that made the ballot table traceable to a unit and a voter. Moving the
     * comparison here is what lets the ballot table become genuinely secret.
     *
     * Nullable: submissions recorded before this column existed have none, and
     * back-filling would require exactly the ballot→submission join being
     * removed. The comparison falls back to a straight 409 in that case.
     */
    selectionDigest: text('selection_digest'),
    isAbstention: boolean('is_abstention').notNull().default(false),
    isProxyVote: boolean('is_proxy_vote').notNull().default(false),
    proxyId: bigint('proxy_id', { mode: 'number' }).references(() => electionProxies.id, {
      onDelete: 'set null',
    }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_election_ballot_submissions_election').on(table.electionId, table.submittedAt),
    index('idx_election_ballot_submissions_unit').on(table.electionId, table.unitId),
    uniqueIndex('uq_election_ballot_submissions_unit').on(table.electionId, table.unitId),
  ],
);

// ---------------------------------------------------------------------------
// election_ballots (append-only — NO updatedAt, NO deletedAt)
// ---------------------------------------------------------------------------

/**
 * A cast vote, and nothing that identifies who cast it.
 *
 * ── §718.128 secret ballot ──
 *
 * This table used to carry `unit_id`, `voter_hash`, `submission_id`,
 * `is_proxy_vote` and `proxy_id` — every one of them a direct or one-join path
 * from a vote to the unit and the person who cast it. A secret ballot that
 * records who voted for whom is not a secret ballot; it is a tallied roll call
 * with extra steps, and anyone with database access could read the election.
 *
 * All five are gone. What remains is: this election, this candidate, one vote.
 *
 * ── Where the integrity guarantees moved ──
 *
 * - **One ballot per unit** is enforced by `uq_election_ballot_submissions_unit`
 *   on the SUBMISSION table, which already existed. The old
 *   `uq_election_ballots_unit_candidate` was a second, weaker copy of the same
 *   rule that happened to require the identifying column.
 * - **Duplicate-submission idempotency** compares
 *   `election_ballot_submissions.selection_digest` instead of reading these rows
 *   back — see that column.
 * - **Turnout and eligibility** are answered from the submission table, which is
 *   where per-unit facts belong.
 *
 * ⚠️ The consequence, stated plainly: a cast vote can no longer be traced to a
 * submission, so an individual ballot cannot be retracted or recounted
 * per-voter. That is what a secret ballot means. Do not add a column here to
 * make some future feature easier without understanding that it re-opens this.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-08.
 */
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
    isAbstention: boolean('is_abstention').notNull().default(false),
    castAt: timestamp('cast_at', { withTimezone: true }).notNull().defaultNow(),
    // NO updatedAt, NO deletedAt — append-only / immutable
  },
  (table) => [
    index('idx_election_ballots_election').on(table.electionId),
    index('idx_election_ballots_candidate').on(table.electionId, table.candidateId),
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
