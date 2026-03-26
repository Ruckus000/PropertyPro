/**
 * Conversion event emission helper.
 *
 * Wraps conversion_events inserts with best-effort semantics:
 * awaited (not fire-and-forget), but non-fatal on failure.
 * Uses ON CONFLICT DO NOTHING for idempotent dedupe.
 */
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { conversionEvents } from '@propertypro/db';

export type ConversionEventType =
  | 'demo_created'
  | 'demo_entered'
  | 'conversion_initiated'
  | 'checkout_completed'
  | 'checkout_session_expired'
  | 'founding_user_created'
  | 'grace_started'
  | 'demo_soft_deleted'
  | 'self_service_upgrade_started';

export type ConversionEventSource = 'admin_app' | 'web_app' | 'stripe_webhook' | 'cron';

interface EmitEventParams {
  demoId?: number | null;
  communityId?: number | null;
  eventType: ConversionEventType;
  source: ConversionEventSource;
  dedupeKey: string;
  occurredAt?: Date;
  userId?: string | null;
  stripeEventId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Emit a conversion event (awaited best-effort).
 * Non-fatal: primary operation succeeds regardless.
 */
export async function emitConversionEvent(params: EmitEventParams): Promise<void> {
  try {
    const db = createUnscopedClient();
    await db
      .insert(conversionEvents)
      .values({
        demoId: params.demoId ?? null,
        communityId: params.communityId ?? null,
        eventType: params.eventType,
        source: params.source,
        dedupeKey: params.dedupeKey,
        occurredAt: params.occurredAt ?? new Date(),
        userId: params.userId ?? null,
        stripeEventId: params.stripeEventId ?? null,
        metadata: params.metadata ?? {},
      })
      .onConflictDoNothing();
  } catch (err) {
    console.warn('[conversion-events] failed to record event:', err);
  }
}
