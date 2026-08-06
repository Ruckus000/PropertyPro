import { bigint, bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { communities } from './communities';

/**
 * Append-only audit trail for PLATFORM-level admin actions (`apps/admin`).
 *
 * ## Why a new table rather than `compliance_audit_log`
 *
 * `compliance_audit_log.community_id` and `support_access_log.community_id` are
 * both NOT NULL, so neither can represent an action that has no community at
 * all — granting or revoking platform-admin access being the obvious case.
 * Before this table existed there was simply no record of who granted admin,
 * who deleted a tenant, or who un-deleted one.
 *
 * `compliance_audit_log` also serves a different purpose: it is the statutory,
 * tenant-visible record required by §718.111(12). Platform-operator actions do
 * not belong in a tenant's compliance trail, and mixing them would put
 * cross-tenant operator activity in front of tenants.
 *
 * ## Column choices that are deliberate
 *
 * - `communityId` is NULLABLE with `ON DELETE SET NULL`. Nullable because
 *   platform-level actions have no community; SET NULL because the demo
 *   hard-delete destroys the community it is reporting on, and the audit entry
 *   must outlive its subject.
 * - `adminUserId` has NO foreign key, mirroring `support_access_log`. Platform
 *   admins live in `platform_admin_users`, which does not require a
 *   `public.users` row; `compliance_audit_log.user_id` carries an
 *   `onDelete: 'restrict'` FK to `users.id` that would reject such an actor.
 * - `adminEmail` is denormalized so the trail stays readable after the acting
 *   account is gone.
 * - `action` is `text`, typed as a union in TypeScript rather than a pg enum,
 *   so adding an action does not require a migration.
 *
 * ## Append-only
 *
 * The migration grants service_role only SELECT and INSERT — no UPDATE or
 * DELETE — and installs a trigger that raises on either. RLS is enabled and
 * FORCED with zero policies (the deny-everyone default), and anon/authenticated
 * are REVOKEd, matching the platform-table posture established in 0035/0037/0038.
 */
export const platformAdminAuditLog = pgTable(
  'platform_admin_audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    adminUserId: uuid('admin_user_id').notNull(),
    adminEmail: text('admin_email'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    communityId: bigint('community_id', { mode: 'number' }).references(() => communities.id, {
      onDelete: 'set null',
    }),
    oldValues: jsonb('old_values').$type<Record<string, unknown>>(),
    newValues: jsonb('new_values').$type<Record<string, unknown>>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_platform_admin_audit_log_created_at').on(table.createdAt.desc()),
    index('idx_platform_admin_audit_log_admin_user_id').on(table.adminUserId),
    index('idx_platform_admin_audit_log_community_id').on(table.communityId),
  ],
);

export type PlatformAdminAuditLogEntry = typeof platformAdminAuditLog.$inferSelect;
export type NewPlatformAdminAuditLogEntry = typeof platformAdminAuditLog.$inferInsert;
