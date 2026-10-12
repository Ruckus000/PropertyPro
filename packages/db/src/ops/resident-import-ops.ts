/**
 * Resident CSV import — one row, all or nothing.
 *
 * A row is up to four writes: the platform `users` row (only for a new
 * account), the `user_roles` membership, the `notification_preferences` row,
 * and the `compliance_audit_log` entry. The import used to make them as
 * separate statements and write every audit entry after the whole file, so a
 * failure part-way left a `users` row with no membership, and a request that
 * died at row 900 left 899 imported residents with no audit trail at all
 * (onboarding audit F2, docs/audits/2026-10-05-onboarding/01-evidence-brief.md).
 *
 * Here they share one transaction: a row is either fully imported and audited,
 * or nothing of it exists. A re-run of the same file then finds the saved rows
 * already members and imports only what is left.
 *
 * Exposed only through `@propertypro/db/unsafe` (it opens a transaction on the
 * unscoped client). Writes inside it go through a scoped client bound to the
 * transaction, so `community_id` is still injected for the tenant tables.
 */
import { eq } from 'drizzle-orm';
import { db } from '../drizzle';
import { createScopedClient } from '../scoped-client';
import { notificationPreferences } from '../schema/notification-preferences';
import { units } from '../schema/units';
import { userRoles } from '../schema/user-roles';
import { users } from '../schema/users';
import { logAuditEvent } from '../utils/audit-logger';

export interface ImportResidentRowOpParams {
  communityId: number;
  /** The manager running the import; recorded as the audit actor. */
  actorUserId: string;
  /** The row's (lower-cased) email; recorded on the audit row either way. */
  email: string;
  /**
   * Exactly one of these. `newUser` creates the platform account in the same
   * transaction; `existingUserId` attaches an account the caller has ALREADY
   * cleared through the cross-tenant attach guard.
   */
  newUser?: { fullName: string };
  existingUserId?: string;
  /** Resident tier only; anything else is refused (role-v3 invariant 3). */
  role: 'resident';
  isUnitOwner: boolean;
  unitId: number | null;
  displayTitle: string;
  /** Extra audit metadata (e.g. the import's size). Never row contents. */
  auditMetadata?: Record<string, unknown>;
  /** The CSV's role word, kept on the audit row as before. */
  legacyRole: string;
}

/**
 * Import one planned resident row in a single transaction. Returns the user id.
 * Throws — and writes nothing — if any statement fails.
 */
export async function importResidentRowOp(params: ImportResidentRowOpParams): Promise<string> {
  const { communityId, actorUserId, newUser, existingUserId } = params;

  if (Boolean(newUser) === Boolean(existingUserId)) {
    throw new Error('importResidentRowOp needs exactly one of newUser or existingUserId');
  }
  // Defence in depth: the import path can only ever mint resident-tier rows.
  if (params.role !== 'resident') {
    throw new Error(`importResidentRowOp refuses role '${String(params.role)}'`);
  }

  return db.transaction(async (tx) => {
    const scoped = createScopedClient(
      communityId,
      tx as unknown as Parameters<typeof createScopedClient>[1],
    );

    let userId = existingUserId ?? null;
    if (newUser) {
      const inserted = (await scoped.insert(users, {
        id: crypto.randomUUID(),
        email: params.email,
        fullName: newUser.fullName,
        phone: null,
      })) as Array<Record<string, unknown>>;
      const id = inserted[0]?.['id'];
      if (typeof id !== 'string') {
        throw new Error('importResidentRowOp: users insert returned no id');
      }
      userId = id;
    }
    if (!userId) throw new Error('importResidentRowOp: no user id');

    // `user_roles.unit_id` is a plain FK with no community check, so a unit id
    // from another association would be accepted by the database. The caller
    // takes it from this community's units; confirm it here, through the
    // scoped client, rather than trust it.
    if (params.unitId !== null) {
      const unit = (await scoped.selectFrom(units, { id: units.id }, eq(units.id, params.unitId))) as unknown[];
      if (unit.length === 0) {
        throw new Error('importResidentRowOp: unit is not in this community');
      }
    }

    await scoped.insert(userRoles, {
      userId,
      role: params.role,
      unitId: params.unitId,
      isUnitOwner: params.isUnitOwner,
      displayTitle: params.displayTitle,
    });

    // ON CONFLICT DO NOTHING: removing a resident deletes only their
    // membership, so a person re-imported after removal may still have a
    // preferences row here — theirs, and kept. A plain insert would fail the
    // whole row on the unique (user, community) key, every time. The scoped
    // client has no upsert, so this one write goes through the transaction
    // handle with the community stated explicitly.
    await tx
      .insert(notificationPreferences)
      .values({ userId, communityId })
      .onConflictDoNothing({
        target: [notificationPreferences.userId, notificationPreferences.communityId],
      });

    await logAuditEvent(
      {
        userId: actorUserId,
        action: 'user_invited',
        resourceType: 'resident',
        resourceId: userId,
        communityId,
        newValues: {
          email: params.email,
          role: params.role,
          legacyRole: params.legacyRole,
        },
        metadata: { ...params.auditMetadata, attachedExistingAccount: !newUser },
      },
      tx,
    );

    return userId;
  });
}
