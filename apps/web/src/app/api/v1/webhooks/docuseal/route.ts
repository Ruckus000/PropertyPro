import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { verifyWebhookSecret } from '@/lib/services/docuseal-client';
import * as esignService from '@/lib/services/esign-service';

/**
 * DocuSeal webhook handler.
 *
 * This endpoint is token-authenticated (webhook secret header),
 * not session-authenticated. It's registered in middleware's
 * TOKEN_AUTH_ROUTES list.
 */

const webhookPayloadSchema = z.object({
  event_type: z.string(),
  timestamp: z.string(),
  data: z.record(z.unknown()),
});

export async function POST(req: NextRequest) {
  // Verify webhook secret
  const secret = req.headers.get('x-docuseal-webhook-secret');
  if (!verifyWebhookSecret(secret)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid webhook secret' } },
      { status: 401 },
    );
  }

  // Validate payload
  let payload;
  try {
    const body = await req.json();
    const parsed = webhookPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } },
        { status: 400 },
      );
    }
    payload = parsed.data;
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON' } },
      { status: 400 },
    );
  }

  // Replay protection: reject events older than 5 minutes
  const eventTime = new Date(payload.timestamp).getTime();
  const now = Date.now();
  if (Math.abs(now - eventTime) > 5 * 60 * 1000) {
    return NextResponse.json(
      { error: { code: 'STALE_EVENT', message: 'Event timestamp too old' } },
      { status: 422 },
    );
  }

  const data = payload.data;
  const webhookEventId = String(data.id ?? '');

  try {
    switch (payload.event_type) {
      case 'form.completed': {
        // Individual signer completed
        const submitterId = Number(data.id);
        const externalId = String(data.external_id ?? '');
        const communityId = parseCommunityIdFromExternalId(externalId);
        if (communityId && submitterId) {
          const values = (data.values ?? {}) as Record<string, unknown>;
          await esignService.processFormCompleted(
            communityId,
            submitterId,
            values,
            webhookEventId,
          );
        }
        break;
      }

      case 'submission.completed': {
        // All signers completed
        const submissionId = Number(data.id);
        const submitters = data.submitters as Array<Record<string, unknown>> | undefined;
        const firstExternalId = submitters?.[0]?.external_id;
        const communityId = parseCommunityIdFromExternalId(String(firstExternalId ?? ''));
        if (communityId && submissionId) {
          await esignService.processSubmissionCompleted(
            communityId,
            submissionId,
            webhookEventId,
          );
        }
        break;
      }

      default:
        // Unknown event type — acknowledge without processing
        break;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[webhooks/docuseal] Error processing webhook:', error);
    return NextResponse.json(
      { error: { code: 'PROCESSING_ERROR', message: 'Webhook processing failed' } },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}

/**
 * Extract communityId from an external_id like "community:123:signer:uuid"
 */
function parseCommunityIdFromExternalId(externalId: string): number | null {
  const match = externalId.match(/^community:(\d+):/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isNaN(id) ? null : id;
}
