/**
 * Guards the legal-review redlines to the agent-email builder (findings #1/#5).
 * The email is PropertyPro-authored, so it must carry the validity/expiry date,
 * warn when the form is expired, and not presuppose a personal credit
 * entitlement. These assertions lock that wording in place.
 */
import { describe, expect, it } from 'vitest';
import { buildWindMitigationAgentEmail } from '../../src/lib/constants/insurance-disclaimers';

const base = {
  communityName: 'Sunset Condos',
  buildingLabel: 'Tower A',
  inspectedAt: 'January 10, 2026',
  expiresAt: 'January 10, 2031',
};

describe('buildWindMitigationAgentEmail', () => {
  it('carries the inspection and validity dates', () => {
    const { body } = buildWindMitigationAgentEmail({ ...base, isExpired: false });
    expect(body).toContain('inspection dated January 10, 2026');
    expect(body).toContain('validity date of January 10, 2031');
  });

  it('does not presuppose a personal credit entitlement', () => {
    const { body } = buildWindMitigationAgentEmail({ ...base, isExpired: false });
    // The pre-redline copy asked "whether any wind-mitigation credits apply to
    // my policy" — a presupposition the review flagged. It must be gone.
    expect(body).not.toContain('credits apply to my policy');
    expect(body).toContain('policy insuring the structure');
    expect(body).toContain('Any wind-mitigation credit depends on your own policy and insurer.');
  });

  it('adds an explicit expiry warning only when expired', () => {
    const current = buildWindMitigationAgentEmail({ ...base, isExpired: false });
    expect(current.body).not.toContain('NOTE: this report expired');

    const expired = buildWindMitigationAgentEmail({ ...base, isExpired: true });
    expect(expired.body).toContain('NOTE: this report expired on January 10, 2031');
    expect(expired.body).toContain('Insurers may not accept an expired form');
  });
});
