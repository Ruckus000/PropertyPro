import {
  bigint,
  bigserial,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';

export type AccountingProvider = 'quickbooks' | 'xero';

export interface AccountingMappingConfig {
  [category: string]: string;
}

export const accountingConnections = pgTable('accounting_connections', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  communityId: bigint('community_id', { mode: 'number' })
    .notNull()
    .references(() => communities.id, { onDelete: 'cascade' }),
  provider: text('provider').$type<AccountingProvider>().notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token').notNull(),
  tenantId: text('tenant_id').notNull(),
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  mappingConfig: jsonb('mapping_config')
    .$type<AccountingMappingConfig>()
    .notNull()
    .default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
