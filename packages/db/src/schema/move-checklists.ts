import { bigint, bigserial, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { communities } from './communities';
import { leases } from './leases';
import { units } from './units';
import { users } from './users';

// Import types for use in table definition
import type { MoveChecklistType, ChecklistData } from '../constants/move-checklists';

// Re-export constants from client-safe module for backwards compatibility
export {
  MOVE_IN_STEPS,
  MOVE_OUT_STEPS,
  STEP_LABELS,
  ACTIONABLE_STEPS,
  type MoveChecklistType,
  type ChecklistStepData,
  type ChecklistData,
} from '../constants/move-checklists';

export const moveChecklists = pgTable(
  'move_checklists',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    leaseId: bigint('lease_id', { mode: 'number' })
      .notNull()
      .references(() => leases.id, { onDelete: 'cascade' }),
    unitId: bigint('unit_id', { mode: 'number' })
      .notNull()
      .references(() => units.id, { onDelete: 'restrict' }),
    residentId: uuid('resident_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    type: text('type').$type<MoveChecklistType>().notNull(),
    checklistData: jsonb('checklist_data').$type<ChecklistData>().notNull().default({}),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: uuid('completed_by')
      .references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('idx_move_checklists_lease_type')
      .on(table.leaseId, table.type)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
);
