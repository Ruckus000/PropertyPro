/**
 * Storm-damage reports — post-storm damage intake for the association
 * (Wave 1 differentiation).
 *
 * After a named storm, a resident/owner records damage they observed (location,
 * category, severity, description, optional photo references) so the association
 * has a single log of building/common-area damage. The board and management see
 * every report and move it through a lightweight status.
 *
 * ⚠️ This is a DAMAGE RECORD FOR THE ASSOCIATION, NOT an insurance claim.
 * PropertyPro does not file, adjust, or settle claims and is not a public
 * adjuster (Fla. Stat. §626.854). The user-facing framing lives in the
 * attorney-gated copy at `apps/web/src/lib/constants/storm-disclaimers.ts`.
 *
 * Storm tools are gated behind CommunityFeatures.hasStormTools (see AGENTS #34);
 * check the flag, never a raw community-type comparison. All queries run through
 * the scoped client (AGENTS #13).
 *
 * `reported_by` is the resident who filed the report; RLS scopes non-admin reads
 * to that column (tenant_user_scoped family — mirrors insurance_certificate_requests
 * and maintenance_requests). `photo_document_ids` is a jsonb array of ids into the
 * existing `documents` library, so photos reuse the document subsystem's storage,
 * signed downloads, and soft-delete rather than a new upload path.
 */
import { bigint, bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { units } from './units';
import { users } from './users';

/**
 * Damage categories (CHECK-constrained text, not a pgEnum: the set may evolve
 * as the feature learns which buckets boards actually use, and text + CHECK lets
 * that happen without an enum-rebuild migration).
 */
export const STORM_DAMAGE_CATEGORIES = [
  'roof',
  'water',
  'structural',
  'exterior',
  'common_area',
  'other',
] as const;
export type StormDamageCategory = (typeof STORM_DAMAGE_CATEGORIES)[number];

/** Severity bands the reporter selects. */
export const STORM_DAMAGE_SEVERITIES = ['minor', 'moderate', 'severe'] as const;
export type StormDamageSeverity = (typeof STORM_DAMAGE_SEVERITIES)[number];

/**
 * Report lifecycle. Deliberately minimal for the MVP: a resident submits,
 * an admin acknowledges receipt, and the record is closed once handled.
 */
export const STORM_DAMAGE_STATUSES = ['submitted', 'acknowledged', 'closed'] as const;
export type StormDamageStatus = (typeof STORM_DAMAGE_STATUSES)[number];

export const stormDamageReports = pgTable(
  'storm_damage_reports',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /** Optional unit this damage is associated with. */
    unitId: bigint('unit_id', { mode: 'number' }).references(() => units.id, {
      onDelete: 'set null',
    }),
    /** The resident who filed the report. RLS scopes non-admin reads to this column. */
    reportedBy: uuid('reported_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** When the damage occurred, if the reporter knows. Nullable. */
    occurredAt: timestamp('occurred_at', { withTimezone: true }),
    /** Free-text location, e.g. "Building B — 3rd floor hallway", "North pool deck". */
    locationLabel: text('location_label').notNull(),
    /** See STORM_DAMAGE_CATEGORIES (CHECK-constrained). */
    category: text('category').notNull(),
    /** See STORM_DAMAGE_SEVERITIES (CHECK-constrained). */
    severity: text('severity').notNull(),
    description: text('description').notNull(),
    /**
     * jsonb array of `documents.id` values for photos the reporter already
     * uploaded to the document library. Empty array = no photos. Kept as ids,
     * not blobs — the documents subsystem owns the files.
     */
    photoDocumentIds: jsonb('photo_document_ids').notNull().default([]),
    /** See STORM_DAMAGE_STATUSES (CHECK-constrained). Default 'submitted'. */
    status: text('status').notNull().default('submitted'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Community listing, newest-first, scoped by reporter for the RLS own-rows read.
    index('storm_damage_reports_community_reported_by_idx').on(
      table.communityId,
      table.reportedBy,
    ),
  ],
);
