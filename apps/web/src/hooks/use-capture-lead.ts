/**
 * Marketing lead capture hook.
 *
 * Wraps `POST /api/v1/public/leads` for the public compliance checker. The
 * endpoint is unauthenticated and rate-limited per IP; see
 * docs/gtm/03-LAUNCH-READINESS.md item B1.
 */
import { requestJson } from '@/lib/api/request-json';

export interface CaptureLeadPayload {
  email: string;
  associationName?: string;
  contactName?: string;
  associationType?: 'condo' | 'hoa';
  unitCount?: number;
  obligationRequired?: boolean;
}

export async function captureLead(payload: CaptureLeadPayload): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/v1/public/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
