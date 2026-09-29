/**
 * E-sign service — Consent management.
 *
 * Moved verbatim from `esign-service.ts` (SVC-08), which remains the public
 * entry point and re-exports this module's public names. Import from
 * `@/lib/services/esign-service`, not from here.
 */
import { createScopedClient, esignConsent, logAuditEvent } from '@propertypro/db';
import { and, eq, isNull } from '@propertypro/db/filters';

// ---------------------------------------------------------------------------
// Consent management
// ---------------------------------------------------------------------------

export async function getConsentStatus(
  communityId: number,
  userId: string,
): Promise<{ hasActiveConsent: boolean; givenAt: Date | null }> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom(
    esignConsent,
    {},
    and(eq(esignConsent.userId, userId), isNull(esignConsent.revokedAt)),
  );

  if (rows.length === 0) {
    return { hasActiveConsent: false, givenAt: null };
  }

  const row = rows[0] as Record<string, unknown>;
  return {
    hasActiveConsent: true,
    givenAt: row.givenAt as Date | null,
  };
}

export async function revokeConsent(
  communityId: number,
  userId: string,
  requestId?: string | null,
): Promise<void> {
  const scoped = createScopedClient(communityId);

  await scoped.update(
    esignConsent,
    { revokedAt: new Date() },
    and(eq(esignConsent.userId, userId), isNull(esignConsent.revokedAt)),
  );

  await logAuditEvent({
    userId,
    action: 'esign_consent_revoked',
    resourceType: 'esign_consent',
    resourceId: userId,
    communityId,
    metadata: { requestId: requestId ?? null },
  });
}
