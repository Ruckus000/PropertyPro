import { createScopedClient, notificationDigestQueue } from '@propertypro/db';
import type { EmailFrequency } from '../utils/email-preferences';
import { isUniqueConstraintError as isUniqueViolationInChain } from '../db/postgres-error';

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

// A 23505 anywhere in the cause chain (drizzle wraps it — see
// `@/lib/db/postgres-error`), OR a message mentioning "unique". The message arm
// is a wider net than the shared predicate and is kept pending a policy
// decision; it rarely fires on drizzle paths, whose message is "Failed query: …".
function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return isUniqueViolationInChain(error) || /unique/i.test(error.message);
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
