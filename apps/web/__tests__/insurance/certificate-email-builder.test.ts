/**
 * Locks the attorney-reviewed framing of the certificate-request relay copy:
 * PropertyPro relays a request and does NOT issue certificates; the agent
 * issues them; the owner is told the agent replies directly.
 */
import { describe, expect, it } from 'vitest';
import { buildCertificateRequestEmail } from '../../src/lib/constants/insurance-disclaimers';

const base = {
  communityName: 'Sunset Condos',
  carrierName: 'Citizens',
  policyNumber: 'ABC-123',
  unitLabel: '4B',
  requesterName: 'Olivia Owner',
  requesterEmail: 'olivia@owner.example',
  recipientName: 'Acme Lender',
  recipientEmail: 'lender@acme.example',
  loanNumber: 'L-9',
};

describe('buildCertificateRequestEmail', () => {
  it('frames the agent email as a relay, not a PropertyPro-issued certificate', () => {
    const { agentBody } = buildCertificateRequestEmail(base);
    expect(agentBody).toContain('PropertyPro is relaying this request');
    expect(agentBody).toContain('please issue the certificate directly to the recipient');
    // carries the identities the agent needs
    expect(agentBody).toContain('Acme Lender (lender@acme.example)');
    expect(agentBody).toContain('Olivia Owner (olivia@owner.example)');
    expect(agentBody).toContain('Loan / reference number: L-9');
  });

  it('omits the loan line when absent', () => {
    const { agentBody } = buildCertificateRequestEmail({ ...base, loanNumber: null });
    expect(agentBody).not.toContain('Loan / reference number');
  });

  it("tells the owner the agent — not PropertyPro — issues the certificate", () => {
    const { confirmationBody } = buildCertificateRequestEmail(base);
    expect(confirmationBody).toContain('agent — not PropertyPro — issues the certificate');
    expect(confirmationBody).toContain('reply to you directly');
  });
});
