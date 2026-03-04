import { bigint, bigserial, index, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { communityTypeEnum } from './enums';

export const demoInstances = pgTable(
  'demo_instances',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    templateType: communityTypeEnum('template_type').notNull(),
    prospectName: text('prospect_name').notNull(),
    slug: text('slug').notNull(),
    theme: jsonb('theme').notNull(),
    seededCommunityId: bigint('seeded_community_id', { mode: 'number' }).references(
      () => communities.id,
      { onDelete: 'set null' },
    ),
    demoResidentUserId: text('demo_resident_user_id'),
    demoBoardUserId: text('demo_board_user_id'),
    demoResidentEmail: text('demo_resident_email').notNull(),
    demoBoardEmail: text('demo_board_email').notNull(),
    authTokenSecret: text('auth_token_secret').notNull(),
    externalCrmUrl: text('external_crm_url'),
    prospectNotes: text('prospect_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('demo_instances_slug_unique').on(table.slug),
    index('idx_demo_instances_slug').on(table.slug),
  ],
);
