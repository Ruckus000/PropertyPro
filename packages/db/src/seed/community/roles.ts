/** Role rows (v3 storage mapping) and per-member notification preferences. */
import { sql } from '../../filters';
import { isBoardPresident, type BoardDesignation } from '@propertypro/shared';
import { db } from './context';
import type { SeedRole } from './types';

/**
 * v3 end-state storage mapping (role-simplification §3.4).
 *
 * Seeds emit the END-STATE shape: `property_manager` (uniform) + `designation`
 * (board marker) + `resident` (isUnitOwner). No `presetKey`, no stored
 * permissions — seeded managers resolve perms via checkPermissionV2's
 * matrix-fallback (full operational). This INTENTIONALLY diverges from prod,
 * where board members retain preset-restricted perms until a later widening
 * migration. Divergence accepted per spec §3.4.
 */
interface SeedStorageMapping {
  role: 'resident' | 'property_manager';
  isUnitOwner: boolean;
  designation: BoardDesignation | null;
  displayTitle: string;
}

function mapSeedRoleToStorage(cfg: {
  role: SeedRole;
  designation?: BoardDesignation;
}): SeedStorageMapping {
  // A board seat is valid on any role (role-v3 §3.2), residents included.
  const designation = cfg.designation ?? null;
  const boardTitle = designation ? (isBoardPresident(designation) ? 'Board President' : 'Board Member') : null;
  if (cfg.role === 'owner') {
    return { role: 'resident', isUnitOwner: true, designation, displayTitle: boardTitle ?? 'Owner' };
  }
  if (cfg.role === 'tenant') {
    return { role: 'resident', isUnitOwner: false, designation, displayTitle: boardTitle ?? 'Tenant' };
  }
  return { role: 'property_manager', isUnitOwner: false, designation, displayTitle: boardTitle ?? 'Property Manager' };
}

/** Announcement authors are the seeded managers (property_manager rows). */
export function isAnnouncementAuthorRole(role: SeedRole): boolean {
  return role === 'property_manager';
}

/**
 * Upsert seeded role rows.
 *
 * `unitId` is optional. When it is omitted (or null) the conflict clause KEEPS
 * whatever `unit_id` the row already has — `coalesce(excluded.unit_id,
 * user_roles.unit_id)` — so a reseed or a cross-community re-assignment never
 * wipes a resident's unit link. It used to be `unit_id = excluded.unit_id`
 * with a literal NULL, which unlinked every demo resident on every reseed, and
 * every unit-scoped feature (`listActorUnitIds`) then saw them as unit-less.
 */
export async function seedRoles(
  assignments: Array<{
    communityId: number;
    userId: string;
    role: SeedRole;
    designation?: BoardDesignation;
    unitId?: number | null;
  }>,
): Promise<void> {
  if (assignments.length === 0) {
    return;
  }

  const values = sql.join(
    assignments.map((a) => {
      const m = mapSeedRoleToStorage({ role: a.role, designation: a.designation });
      // v3 end-state: seeded managers resolve perms via checkPermissionV2's
      // matrix-fallback (spec §3.4). No permissions/preset_key/legacy_role columns.
      return sql`(${a.userId}, ${a.communityId}, ${m.role}, ${a.unitId ?? null}::bigint, ${m.isUnitOwner}, ${m.designation}, ${m.displayTitle})`;
    }),
    sql`, `,
  );
  await db.execute(sql`
    insert into user_roles (
      user_id,
      community_id,
      role,
      unit_id,
      is_unit_owner,
      designation,
      display_title
    )
    values ${values}
    on conflict (user_id, community_id) do update
    set role = excluded.role,
        unit_id = coalesce(excluded.unit_id, user_roles.unit_id),
        is_unit_owner = excluded.is_unit_owner,
        designation = excluded.designation,
        display_title = excluded.display_title,
        updated_at = now()
  `);
}

export async function ensureNotificationPreference(communityId: number, userId: string): Promise<void> {
  await db.execute(sql`
    insert into notification_preferences (
      community_id,
      user_id,
      email_frequency,
      email_announcements,
      email_meetings,
      in_app_enabled
    )
    values (${communityId}, ${userId}, 'immediate', true, true, true)
    on conflict (user_id, community_id) do update
    set email_frequency = excluded.email_frequency,
        email_announcements = excluded.email_announcements,
        email_meetings = excluded.email_meetings,
        in_app_enabled = excluded.in_app_enabled,
        updated_at = now()
  `);
}
