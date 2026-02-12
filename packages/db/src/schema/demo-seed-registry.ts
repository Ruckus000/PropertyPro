import { bigint, bigserial, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { communities } from './communities';

export const demoSeedRegistry = pgTable(
  'demo_seed_registry',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    entityType: text('entity_type').notNull(),
    seedKey: text('seed_key').notNull(),
    entityId: text('entity_id').notNull(),
    communityId: bigint('community_id', { mode: 'number' }).references(() => communities.id, {
      onDelete: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('demo_seed_registry_entity_seed_unique').on(table.entityType, table.seedKey),
  ],
);
