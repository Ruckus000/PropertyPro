/**
 * Marketing lead capture.
 *
 * Wraps the two public capture endpoints — the compliance checker
 * (`/api/v1/public/leads`) and the portfolio inquiry form
 * (`/api/v1/public/pm-inquiries`). Both are unauthenticated and rate-limited per
 * IP; see docs/gtm/03-LAUNCH-READINESS.md items B1 and B3.
 *
 * Marketing components must route through here rather than calling `fetch`
 * directly (ADR-003, enforced by `guard:component-api-calls`).
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

export interface PmInquiryPayload {
  email: string;
  contactName?: string;
  companyName?: string;
  communityCount?: number;
  unitCount?: number;
  message?: string;
}

export async function captureLead(payload: CaptureLeadPayload): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/v1/public/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function submitPmInquiry(payload: PmInquiryPayload): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/v1/public/pm-inquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
