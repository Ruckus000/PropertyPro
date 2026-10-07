/**
 * Owner consent to electronic notice (§718.112(2)(d), §720.303).
 *
 * A record only: nothing here, or anywhere, decides notice delivery from it.
 * Every give and every withdrawal writes a `compliance_audit_log` row, so the
 * association's record of who consented, when and to what survives even a
 * later repair to `notice_consent` itself.
 *
 * Callers authorize. These functions act on exactly the `userId` they are
 * given and never check that the user is an owner — the invitation route and
 * `/api/v1/notice-consent` do that before calling.
 */
import { createScopedClient, logAuditEvent, noticeConsent, users } from '@propertypro/db';
import { and, eq, isNull } from '@propertypro/db/filters';
import { NOTICE_CONSENT_VERSION, noticeConsentText } from '@propertypro/shared';
import { isNamedUniqueViolation } from '@/lib/db/postgres-error';

const ACTIVE_INDEX = 'notice_consent_active_uq';

export interface NoticeConsentState {
  consented: boolean;
  givenAt: string | null;
  version: string | null;
  email: string | null;
}

interface ConsentRow {
  id: number;
  email: string;
  consentVersion: string;
  givenAt: Date;
}

async function findActive(communityId: number, userId: string): Promise<ConsentRow | null> {
  const rows = await createScopedClient(communityId).selectFrom(
    noticeConsent,
    {},
    and(eq(noticeConsent.userId, userId), isNull(noticeConsent.revokedAt)),
  );
  return (rows[0] as ConsentRow | undefined) ?? null;
}

export async function getNoticeConsent(communityId: number, userId: string): Promise<NoticeConsentState> {
  const row = await findActive(communityId, userId);
  return row
    ? { consented: true, givenAt: row.givenAt.toISOString(), version: row.consentVersion, email: row.email }
    : { consented: false, givenAt: null, version: null, email: null };
}

/**
 * Records consent at `email`. Already consented at that address: no-op.
 * Consented at a different address: the old consent is withdrawn and a new one
 * recorded, because a consent names the address it covers.
 */
export async function giveNoticeConsent(params: {
  communityId: number;
  userId: string;
  email: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<NoticeConsentState> {
  const { communityId, userId, email } = params;
  const existing = await findActive(communityId, userId);
  if (existing && existing.email === email) return getNoticeConsent(communityId, userId);
  if (existing) await withdrawNoticeConsent(communityId, userId, { reason: 'email_changed' });

  try {
    await createScopedClient(communityId).insert(noticeConsent, {
      userId,
      email,
      consentText: noticeConsentText(email),
      consentVersion: NOTICE_CONSENT_VERSION,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  } catch (error) {
    // A concurrent give won the race; its row is the record.
    if (isNamedUniqueViolation(error, ACTIVE_INDEX)) return getNoticeConsent(communityId, userId);
    throw error;
  }

  await logAuditEvent({
    userId,
    action: 'notice_consent_given',
    resourceType: 'notice_consent',
    resourceId: userId,
    communityId,
    newValues: { email, consentVersion: NOTICE_CONSENT_VERSION },
    metadata: { ipAddress: params.ipAddress, userAgent: params.userAgent },
  });
  return getNoticeConsent(communityId, userId);
}

/**
 * The user's current sign-in email, which is the address a consent given from
 * Settings covers. `users` is global; the scoped client applies only
 * `deleted_at IS NULL` to it (see `getUserForInvitation`).
 */
export async function getConsentEmail(communityId: number, userId: string): Promise<string | null> {
  const rows = (await createScopedClient(communityId).selectFrom(
    users,
    { email: users.email },
    eq(users.id, userId),
  )) as Array<{ email: unknown }>;
  const email = rows[0]?.email;
  return typeof email === 'string' ? email : null;
}

/** Withdraws the active consent, if any. Returns whether there was one. */
export async function withdrawNoticeConsent(
  communityId: number,
  userId: string,
  metadata: Record<string, unknown> = {},
): Promise<boolean> {
  const rows = await createScopedClient(communityId).update(
    noticeConsent,
    { revokedAt: new Date() },
    and(eq(noticeConsent.userId, userId), isNull(noticeConsent.revokedAt)),
  );
  if (rows.length === 0) return false;

  const row = rows[0] as unknown as ConsentRow;
  await logAuditEvent({
    userId,
    action: 'notice_consent_withdrawn',
    resourceType: 'notice_consent',
    resourceId: userId,
    communityId,
    oldValues: { email: row.email, consentVersion: row.consentVersion },
    metadata,
  });
  return true;
}

/** The users in a community with an active consent. For the manager-only residents view. */
export async function listNoticeConsentUserIds(communityId: number): Promise<Set<string>> {
  const rows = await createScopedClient(communityId).selectFrom(
    noticeConsent,
    { userId: noticeConsent.userId },
    isNull(noticeConsent.revokedAt),
  );
  return new Set((rows as Array<{ userId: string }>).map((r) => r.userId));
}
