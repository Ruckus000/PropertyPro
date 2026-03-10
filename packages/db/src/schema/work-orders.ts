import {
  bigint,
  bigserial,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { units } from './units';
import { users } from './users';
import { vendors } from './vendors';

export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'urgent';
export type WorkOrderStatus = 'created' | 'assigned' | 'in_progress' | 'completed' | 'closed';

export const workOrders = pgTable('work_orders', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  unitId: bigint('unit_id', { mode: 'number' }).references(() => units.id, { onDelete: 'set null' }),
  vendorId: bigint('vendor_id', { mode: 'number' }).references(() => vendors.id, { onDelete: 'set null' }),
  assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  priority: text('priority').$type<WorkOrderPriority>().notNull().default('medium'),
  status: text('status').$type<WorkOrderStatus>().notNull().default('created'),
  slaResponseHours: integer('sla_response_hours'),
  slaCompletionHours: integer('sla_completion_hours'),
  assignedAt: timestamp('assigned_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
