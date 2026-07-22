/**
 * Wind-mitigation reports — building-level Florida wind-mitigation inspection
 * records (Wave 1 differentiation).
 *
 * The board uploads the building's inspection report once; every owner can
 * download it to hand to their own HO-6/wind insurer, which Florida insurers
 * must consider for mitigation credits (§627.0629). Forms are valid ~5 years,
 * so each row carries an expiry that drives re-inspection alerts.
 *
 * This table is METADATA OVER a library document: the PDF itself lives in the
 * `documents` table / `documents` bucket (Insurance category), so version
 * history, search, signed downloads, and soft-delete all come from the
 * documents subsystem. `documentId` is the join.
 *
 * Insurance-hub features are compliance-community-only (condo_718/hoa_720).
 * Gate via CommunityFeatures.hasInsuranceHub, not a direct type check.
 * Dates stored as UTC date strings (AGENTS #16-17). All queries through the
 * scoped client (AGENTS #13).
 */
import { bigint, bigserial, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';
import { documents } from './documents';
import { users } from './users';

/**
 * Wind-mitigation form families.
 *
 * Modeled as CHECK-constrained text rather than a pgEnum: Florida OIR revises
 * these forms on its own cadence (a new OIR-B1-1802 took effect 2026-04-01),
 * and text + CHECK lets us track that churn without an enum migration.
 *
 * - `oir_b1_1802`  — OIR-B1-1802, buildings 1-3 stories
 * - `mit_bt_ii`    — Citizens MIT-BT II, buildings 4+ stories
 * - `mit_bt_iii`   — Citizens MIT-BT III, buildings 4+ stories
 */
export const WIND_MITIGATION_FORM_TYPES = ['oir_b1_1802', 'mit_bt_ii', 'mit_bt_iii'] as const;
export type WindMitigationFormType = (typeof WIND_MITIGATION_FORM_TYPES)[number];

/**
 * Form revision. `pre_2026` is the long-standing form; `2026_04` is the
 * revision effective 2026-04-01 per the 2024 Residential Wind-Loss Mitigation
 * Study. Displayed to boards so an obsolete revision is never labeled current.
 */
export const WIND_MITIGATION_FORM_VERSIONS = ['pre_2026', '2026_04'] as const;
export type WindMitigationFormVersion = (typeof WIND_MITIGATION_FORM_VERSIONS)[number];

/** Expiry-alert bands. Persisted per row to dedupe cron alerts. */
export const WIND_MITIGATION_ALERT_BANDS = ['180_days', '90_days', '30_days', 'expired'] as const;
export type WindMitigationAlertBand = (typeof WIND_MITIGATION_ALERT_BANDS)[number];

export const windMitigationReports = pgTable(
  'wind_mitigation_reports',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /** The uploaded inspection PDF in the document library. */
    documentId: bigint('document_id', { mode: 'number' })
      .notNull()
      .references(() => documents.id, { onDelete: 'restrict' }),
    /** Form family — see WIND_MITIGATION_FORM_TYPES (CHECK-constrained). */
    formType: text('form_type').notNull(),
    /** Form revision — see WIND_MITIGATION_FORM_VERSIONS (CHECK-constrained). */
    formVersion: text('form_version').notNull().default('pre_2026'),
    /** Optional building identifier for multi-building communities. */
    buildingLabel: text('building_label'),
    /** Date the inspection was performed. */
    inspectedAt: date('inspected_at', { mode: 'string' }).notNull(),
    /** Form validity end. Defaults in UI to inspectedAt + 5 years; editable. */
    expiresAt: date('expires_at', { mode: 'string' }).notNull(),
    inspectorName: text('inspector_name'),
    inspectorLicense: text('inspector_license'),
    notes: text('notes'),
    /**
     * Last expiry band an alert was sent for. Null = no alert sent yet.
     * Lets the daily cron fire once per band transition without a separate
     * alert-log table. See WIND_MITIGATION_ALERT_BANDS.
     */
    lastAlertBand: text('last_alert_band'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Community listing + the cron's expiry scan.
    index('wind_mitigation_reports_community_expires_idx').on(table.communityId, table.expiresAt),
  ],
);
