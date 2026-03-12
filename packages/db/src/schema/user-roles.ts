/**
 * User-Community role junction table.
 *
 * Hybrid 4-role model: resident | manager | pm_admin.
 * - `role` uses the simplified user_role_v2 enum (after migration 0093 column swap)
 * - `isUnitOwner` distinguishes owner vs tenant within 'resident'
 * - `permissions` JSONB stores per-resource access for 'manager' role
 * - `presetKey` links to preset bundles (board_president, board_member, cam, site_manager)
 * - `roleLegacy` preserved for rollback safety (dropped by migration 0095)
 *
 * ADR-001: exactly one active canonical role per (user_id, community_id).
 */
import { bigint, bigserial, boolean, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
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
    /** Simplified role: resident | manager | pm_admin. Post-migration 0093 primary role column. */
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
    /** Last update timestamp for role/permissions changes. */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('user_roles_user_community_unique').on(
      table.userId,
      table.communityId,
    ),
  ],
);
