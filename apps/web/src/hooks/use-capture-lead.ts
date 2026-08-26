/**
 * Marketing lead capture — the portfolio inquiry form
 * (`/api/v1/public/pm-inquiries`). Unauthenticated, rate-limited per IP; see
 * docs/gtm/03-LAUNCH-READINESS.md item B3.
 *
 * This used to also wrap `/api/v1/public/leads` for the compliance checker
 * (item B1). The v6 landing page removed that capture on purpose — "No email
 * required" is part of the checker's pitch — so the route, its contract, and
 * `captureLead()` were deleted rather than left as an unauthenticated write
 * endpoint with no caller. `marketing_leads` rows with source
 * `compliance_checker` predate that removal and are still valid data.
 *
 * Marketing components must route through here rather than calling `fetch`
 * directly (ADR-003, enforced by `guard:component-api-calls`).
 */
import { requestJson } from '@/lib/api/request-json';

export interface PmInquiryPayload {
  email: string;
  contactName?: string;
  companyName?: string;
  communityCount?: number;
  unitCount?: number;
  message?: string;
}

export async function submitPmInquiry(payload: PmInquiryPayload): Promise<void> {
  await requestJson<{ ok: boolean }>('/api/v1/public/pm-inquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
