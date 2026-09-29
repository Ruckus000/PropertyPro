/**
 * E-sign service — My-pending: user-scoped pending signers (dashboard widget / non-admin view).
 *
 * Moved verbatim from `esign-service.ts` (SVC-08), which remains the public
 * entry point and re-exports this module's public names. Import from
 * `@/lib/services/esign-service`, not from here.
 */
import {
  createScopedClient,
  esignSigners,
  esignSubmissions,
  esignTemplates,
  users,
} from '@propertypro/db';
import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  or,
} from '@propertypro/db/filters';
import { type EsignSubmissionRecord, type EsignTemplateRecord } from './types';

// ---------------------------------------------------------------------------
// My-pending: user-scoped pending signers (for dashboard widget / non-admin view)
// ---------------------------------------------------------------------------

export interface MyPendingSignerRecord {
  signerId: number;
  signerStatus: string;
  submissionId: number;
  submissionExternalId: string;
  messageSubject: string | null;
  templateName: string;
  templateType: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  slug: string | null;
}

/**
 * Returns pending signing requests for a specific user (by userId or email).
 * Used by the dashboard "Documents to Sign" widget and the /api/v1/esign/my-pending endpoint.
 */
export async function listMyPendingSigners(
  communityId: number,
  userId: string,
  userEmail: string,
): Promise<MyPendingSignerRecord[]> {
  const scoped = createScopedClient(communityId);

  // 1. Find signers matching the user that are still pending/opened
  const signerRows = await scoped.selectFrom(
    esignSigners,
    {},
    and(
      or(eq(esignSigners.userId, userId), eq(esignSigners.email, userEmail.toLowerCase())),
      or(eq(esignSigners.status, 'pending'), eq(esignSigners.status, 'opened')),
      isNull(esignSigners.deletedAt),
    ),
  );

  if (signerRows.length === 0) return [];

  // 2. Get associated submissions that are still pending and not expired
  const submissionIds = [
    ...new Set(signerRows.map((r) => r['submissionId'] as number)),
  ];
  const subRows = await scoped.selectFrom(
    esignSubmissions,
    {},
    and(
      inArray(esignSubmissions.id, submissionIds),
      eq(esignSubmissions.status, 'pending'),
      or(
        isNull(esignSubmissions.expiresAt),
        gte(esignSubmissions.expiresAt, new Date()),
      ),
      isNull(esignSubmissions.deletedAt),
    ),
  );

  if (subRows.length === 0) return [];

  const subsById = new Map(
    subRows.map((r) => [r['id'] as number, r as EsignSubmissionRecord]),
  );

  // 3. Get template names for those submissions
  const templateIds = [
    ...new Set(subRows.map((r) => r['templateId'] as number)),
  ];
  const templateRows = await scoped.selectFrom(
    esignTemplates,
    {},
    inArray(esignTemplates.id, templateIds),
  );
  const templatesById = new Map(
    templateRows.map((r) => [r['id'] as number, r as EsignTemplateRecord]),
  );

  // 4. Map, filter to valid submissions, sort, limit
  const results: MyPendingSignerRecord[] = [];
  for (const signer of signerRows) {
    const subId = signer['submissionId'] as number;
    const sub = subsById.get(subId);
    if (!sub) continue; // submission was filtered out (expired/cancelled/deleted)

    const template = sub.templateId != null ? templatesById.get(sub.templateId) : undefined;
    results.push({
      signerId: signer['id'] as number,
      signerStatus: signer['status'] as string,
      submissionId: subId,
      submissionExternalId: sub.externalId,
      messageSubject: sub.messageSubject,
      templateName: template?.name ?? 'Unknown Template',
      templateType: template?.templateType ?? null,
      expiresAt: sub.expiresAt ? new Date(sub.expiresAt as unknown as string) : null,
      createdAt: new Date(signer['createdAt'] as unknown as string),
      slug: (signer['slug'] as string) ?? null,
    });
  }

  // Sort by createdAt descending, limit to 10
  results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return results.slice(0, 10);
}

/**
 * Convenience wrapper for the `/api/v1/esign/my-pending` route: looks up the
 * actor's email from the users table, then delegates to
 * `listMyPendingSigners`. Lets the route avoid importing the `users` table
 * directly (Plan A3 third-boundary-guard compliance).
 *
 * The email lookup falls through to an empty string if the user has no
 * email on file (rare — a few legacy accounts predate email-required
 * onboarding). `listMyPendingSigners` then matches no signer rows on email
 * and returns the userId-only matches (or empty if none).
 */
export async function listMyPendingForActor(
  communityId: number,
  actorUserId: string,
): Promise<MyPendingSignerRecord[]> {
  const scoped = createScopedClient(communityId);
  // Targeted single-row lookup (eq on PK + limit 1). Pre-#244 this was
  // `scoped.query(users)` + JS `.find()` — a global-table scan that loaded
  // every user in the platform into memory just to read one email.
  const userRows = await scoped
    .selectFrom<{ id: string; email: string | null }>(
      users,
      {},
      eq(users.id, actorUserId),
    )
    .limit(1);
  const userEmail = typeof userRows[0]?.email === 'string' ? userRows[0].email : '';

  return listMyPendingSigners(communityId, actorUserId, userEmail);
}
