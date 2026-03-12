import {
  bigint,
  bigserial,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { polls } from './polls';
import { users } from './users';

export const pollVotes = pgTable(
  'poll_votes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    pollId: bigint('poll_id', { mode: 'number' })
      .notNull()
      .references(() => polls.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    selectedOptions: jsonb('selected_options').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('poll_votes_unique_poll_user').on(table.pollId, table.userId),
  ],
);
