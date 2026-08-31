import {
  bigint,
  bigserial,
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { ledgerEntries } from './ledger-entries';
import { users } from './users';
import { violations } from './violations';

export type ViolationFineStatus = 'pending' | 'paid' | 'waived';

/**
 * Who approved a fine, captured at the moment of imposition.
 *
 * A SNAPSHOT, not a foreign key. §718.303(3) requires the fine to be approved
 * by a committee of members who are not officers, directors, or their
 * relatives; if that is ever disputed, the question is who sat on the committee
 * *then* — and a join to `user_roles` answers who sits on it *now*. Committee
 * membership turns over; the record of a decision must not.
 */
export interface FiningCommitteeMember {
  /** Free text: a committee member need not be a platform user. */
  name: string;
  /** Present when the approver does have an account. */
  userId?: string;
}

export const violationFines = pgTable('violation_fines', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  violationId: bigint('violation_id', { mode: 'number' })
    .notNull()
    .references(() => violations.id, { onDelete: 'cascade' }),
  amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  ledgerEntryId: bigint('ledger_entry_id', { mode: 'number' }).references(() => ledgerEntries.id, {
    onDelete: 'set null',
  }),
  status: text('status').$type<ViolationFineStatus>().notNull().default('pending'),
  /**
   * §718.303(3) / §720.305(2): a fine may not be imposed without the approval
   * of a fining committee. Required `true` at the contract layer for new fines;
   * nullable here because rows predating this column have no answer, and
   * back-filling `false` would assert something about historical fines that we
   * do not know.
   */
  approvedByCommittee: boolean('approved_by_committee'),
  /** Snapshot of the approving committee — see FiningCommitteeMember. */
  committeeMembers: jsonb('committee_members').$type<FiningCommitteeMember[]>(),
  committeeApprovedAt: timestamp('committee_approved_at', { withTimezone: true }),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  waivedAt: timestamp('waived_at', { withTimezone: true }),
  waivedByUserId: uuid('waived_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
