import { createScopedClient, notificationDigestQueue } from '@propertypro/db';
import type { EmailFrequency } from '../utils/email-preferences';

export type DigestSourceType =
  | 'meeting'
  | 'maintenance'
  | 'document'
  | 'announcement'
  | 'compliance';

export interface EnqueueDigestItemInput {
  communityId: number;
  userId: string;
  frequency: Extract<EmailFrequency, 'daily_digest' | 'weekly_digest'>;
  sourceType: DigestSourceType;
  sourceId: string;
  eventType: string;
  eventTitle: string;
  eventSummary?: string | null;
  actionUrl?: string | null;
}

export interface EnqueueDigestResult {
  enqueued: boolean;
}

// DELIBERATELY DIVERGENT from `@/lib/db/postgres-error` (SVC-06): the
// `instanceof Error` gate plus the `/unique/i` message regex mean a message-only
// failure counts as a duplicate here, so collapsing this onto the shared
// predicate would turn `enqueueDigestItem`'s throw into a silent
// `{ enqueued: false }` — a dropped digest nobody sees. Pending a policy decision.
function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const asRecord = error as Error & { code?: string };
  return asRecord.code === '23505' || /unique/i.test(error.message);
}

export async function enqueueDigestItem(
  input: EnqueueDigestItemInput,
): Promise<EnqueueDigestResult> {
  const scoped = createScopedClient(input.communityId);
  try {
    await scoped.insert(notificationDigestQueue, {
      userId: input.userId,
      frequency: input.frequency,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      eventType: input.eventType,
      eventTitle: input.eventTitle,
      eventSummary: input.eventSummary ?? null,
      actionUrl: input.actionUrl ?? null,
      status: 'pending',
      attemptCount: 0,
      nextAttemptAt: new Date(),
    });
    return { enqueued: true };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { enqueued: false };
    }
    throw error;
  }
}

export async function enqueueDigestItems(
  items: EnqueueDigestItemInput[],
): Promise<{ enqueued: number; duplicates: number }> {
  let enqueued = 0;
  let duplicates = 0;
  for (const item of items) {
    const result = await enqueueDigestItem(item);
    if (result.enqueued) enqueued += 1;
    else duplicates += 1;
  }
  return { enqueued, duplicates };
}
