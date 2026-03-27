import { bigserial, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { communityTypeEnum } from './enums';
import { users } from './users';

/**
 * Global public-site template library for demo creation.
 * Platform-level table — not tenant-scoped.
 *
 * Canonical TypeScript interfaces for the JSONB columns (thumbnail_descriptor,
 * published_snapshot) live in apps/admin/src/lib/templates/types.ts.
 */
export const publicSiteTemplates = pgTable(
  'public_site_templates',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    slug: text('slug').notNull(),
    communityType: communityTypeEnum('community_type').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    name: text('name').notNull(),
    summary: text('summary').notNull().default(''),
    tags: jsonb('tags').notNull().$type<string[]>().default([]),
    thumbnailDescriptor: jsonb('thumbnail_descriptor').notNull(),
    draftJsxSource: text('draft_jsx_source').notNull(),
    publishedSnapshot: jsonb('published_snapshot'),
    version: integer('version').notNull().default(0),
    publishedPayloadHash: text('published_payload_hash'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [
    unique('public_site_templates_slug_unique').on(table.slug),
    unique('public_site_templates_type_sort_unique').on(table.communityType, table.sortOrder),
  ],
);
