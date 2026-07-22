/**
 * No-login snowbird unsubscribe write.
 *
 * Runs without a session (reached from the one-click email link), so it uses
 * the unscoped/privileged client. Callers MUST have verified the signed
 * unsubscribe token first — the token authorizes the write and confines it to
 * the exact (communityId, userId) it encodes.
 */
import { snowbirdDigestSubscriptions } from '@propertypro/db';
import { and, eq, isNull } from '@propertypro/db/filters';
// AUTHZ: no-session token-authorized write; confined to the token's (communityId, userId).
import { createUnscopedClient } from '@propertypro/db/unsafe';

export async function applySnowbirdUnsubscribe(payload: {
  communityId: number;
  userId: string;
}): Promise<void> {
  const db = createUnscopedClient();
  const existing = await db
    .select({ id: snowbirdDigestSubscriptions.id })
    .from(snowbirdDigestSubscriptions)
    .where(
      and(
        eq(snowbirdDigestSubscriptions.communityId, payload.communityId),
        eq(snowbirdDigestSubscriptions.userId, payload.userId),
        isNull(snowbirdDigestSubscriptions.deletedAt),
      ),
    );

  if (existing.length > 0) {
    await db
      .update(snowbirdDigestSubscriptions)
      .set({ cadence: 'off', updatedAt: new Date() })
      .where(eq(snowbirdDigestSubscriptions.id, existing[0]!.id));
  } else {
    await db.insert(snowbirdDigestSubscriptions).values({
      communityId: payload.communityId,
      userId: payload.userId,
      cadence: 'off',
    });
  }
}
