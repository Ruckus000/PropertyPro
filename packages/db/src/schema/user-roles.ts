/**
 * User-Community role junction table.
 *
 * v3 transition window: `role` holds both generations — v2 values
 * (resident | manager | pm_admin) and v3 values (property_manager |
 * root_manager) — until the v3 cleanup migration retires the v2 pair.
 * - `isUnitOwner` distinguishes owner vs tenant within 'resident'
 * - `permissions` JSONB stores per-resource access for manager-generation rows
 * - `presetKey` links to preset bundles (board_president, board_member, cam, site_manager)
 * - `legacyRole` preserves the original 7-role name as text (analytics/rollback)
 * - `designation` marks statutory board members independent of role
 *
 * ADR-001 + spec docs/superpowers/specs/2026-06-10-root-manager-role-simplification-design.md:
 * exactly one active role per (user_id, community_id); ≤1 root_manager and
 * ≤1 board_president designation per community (partial unique indexes).
 */
import { bigint, bigserial, boolean, check, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';
import { communities } from './communities';
import { units } from './units';
import { userRoleV2Enum } from './enums';

export const userRoles = pgTable(
  'user_roles',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    communityId: bigint('community_id', { mode: 'number' })
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    /** Simplified role enum — both generations during the v3 transition window. */
    role: userRoleV2Enum('role').notNull(),
    unitId: bigint('unit_id', { mode: 'number' }).references(() => units.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** True if this resident is a unit owner (only meaningful when role = 'resident'). */
    isUnitOwner: boolean('is_unit_owner').notNull().default(false),
    /** JSONB manager permissions (only set when role = 'manager'). */
    permissions: jsonb('permissions'),
    /** Preset key for managers: 'board_president', 'board_member', 'cam', 'site_manager', or null for custom. */
    presetKey: text('preset_key'),
    /** Human-readable title: 'Owner', 'Board President', 'Community Association Manager', etc. */
    displayTitle: text('display_title'),
    /** Stores the original role name as text for analytics. */
    legacyRole: text('legacy_role'),
    /**
     * v3 board designation: 'board_president' | 'board_member' | null.
     * Statutory features check this via requireBoardDesignation(); general
     * permissions never read it. CHECK constraint enforced in-schema below.
     */
    designation: text('designation'),
    /** Last update timestamp for role/permissions changes. */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('user_roles_user_community_unique').on(
      table.userId,
      table.communityId,
    ),
    // ≤1 root per community. user_roles has NO deleted_at (hard deletes) — no soft-delete predicate.
    uniqueIndex('user_roles_one_root_per_community')
      .on(table.communityId)
      .where(sql`role = 'root_manager'`),
    // ≤1 board president per community.
    uniqueIndex('user_roles_one_board_president_per_community')
      .on(table.communityId)
      .where(sql`designation = 'board_president'`),
    check(
      'user_roles_designation_check',
      sql`designation IS NULL OR designation IN ('board_president', 'board_member')`,
    ),
  ],
);
