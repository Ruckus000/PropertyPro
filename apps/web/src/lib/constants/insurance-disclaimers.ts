/**
 * Insurance-hub disclaimer copy — SINGLE SOURCE OF TRUTH.
 *
 * ⚠️ ATTORNEY-REVIEW GATE (blocking before prod enablement)
 * ---------------------------------------------------------------------------
 * Every string in this file must be reviewed by Florida counsel before the
 * insurance hub is enabled in production, and must not be edited afterwards
 * without re-review. They live here — not inline in components — so the
 * reviewed wording cannot drift per-page.
 *
 * REVISED 2026-07-17 per the attorney-panel legal review (verdict:
 * enable-after-required-redlines). These strings now implement the panel's
 * redlines for findings #2/#4/#5/#6: statute-tracking §627.0629 language,
 * the structural-scope (master-policy vs HO-6/renters) fact, a broadened
 * no-advice clause naming both parties, a non-prescriptive form-family hint,
 * and an agent email that carries the validity/expiry date. The redlines are
 * decision-support and still require confirmation by licensed Florida counsel
 * before the feature is enabled.
 *
 * The constraints these strings encode (from the feature research):
 *
 * 1. NO SAVINGS PROMISES. Wind-mitigation credits are insurer- and
 *    policy-dependent; some HO-6 policies see little benefit because dwelling
 *    coverage is small. Florida law requires insurers to OFFER mitigation
 *    discounts (§627.0629), which is not the same as any given owner saving a
 *    given amount. Say "may reduce", never a number.
 * 2. NO ADVICE. PropertyPro does not provide insurance, legal, or financial
 *    advice — the same posture the SIRS transparency pages already take
 *    (factual data only, no adequacy assessment).
 * 3. NO IMPLIED CURRENCY. A posted form can be superseded or expire; the UI
 *    labels every record with its inspection and expiry dates and never
 *    asserts that a document is accepted by any insurer.
 *
 * See docs/superpowers/specs/2026-07-17-wave1-wind-mitigation-locker-design.md.
 */

/**
 * Standing disclaimer under the wind-mitigation section. Hedged by design —
 * "may qualify" / "may reduce", no amounts, no guarantee of acceptance.
 */
export const WIND_MITIGATION_DISCLAIMER =
  "This report describes the association's building as inspected on the date shown. Florida law " +
  'requires insurers to file wind-mitigation discounts for qualifying construction features ' +
  '(§627.0629). Those credits generally apply to the policy that insures the building’s ' +
  'structure — often the association’s master policy. Whether sharing this report affects your ' +
  'own HO-6 or renters premium depends on what your policy insures, and some policies see little or ' +
  'no credit. Neither PropertyPro nor your association provides insurance, legal, or financial ' +
  'advice, or can promise any premium reduction.';

/**
 * Shown next to the form-family picker. This is documentation-in-the-interface:
 * the rule that decides which form a building needs (and why the board may have
 * the wrong one) is where the board makes the choice, not in a help article.
 */
export const WIND_MITIGATION_FORM_FAMILY_HINT =
  'This is general information, not legal, engineering, or insurance advice — requirements depend ' +
  'on your building and insurer. Buildings 1–3 stories generally use the Florida OIR uniform form ' +
  '(OIR-B1-1802); a licensed home inspector may complete it only if licensed under §468.8314 with ' +
  'the required hurricane-mitigation training and proficiency exam (contractors, building-code ' +
  'inspectors, architects, and engineers may also sign). If your building is insured by Citizens, ' +
  '4+ story buildings use the Citizens MIT-BT II & III form (which a home inspector cannot ' +
  'complete); other insurers may require a different high-rise form or accept the OIR-B1-1802. ' +
  'Confirm the correct form and a qualified inspector with your insurer before ordering an inspection.';

/**
 * Shown where a board sets the expiry date. Explains the default without
 * asserting a universal rule (validity is the insurer's call).
 */
export const WIND_MITIGATION_EXPIRY_HINT =
  'Wind-mitigation forms are generally accepted for about five years from the inspection date. ' +
  'We default to five years — adjust it if your inspector or insurer states otherwise.';

/**
 * Subject + body for the owner's "send to my insurance agent" mailto.
 *
 * The owner sends this from their own mail client to their own agent, so
 * PropertyPro is not communicating with the owner's insurer — it is handing the
 * owner a pre-written message. The body asks the agent to consider credits; it
 * never asserts entitlement to any.
 */
export function buildWindMitigationAgentEmail(params: {
  communityName: string;
  buildingLabel: string | null;
  inspectedAt: string;
  expiresAt: string;
  /** When 'expired', the body carries an explicit staleness warning. */
  isExpired: boolean;
}): { subject: string; body: string } {
  const building = params.buildingLabel ? ` (${params.buildingLabel})` : '';

  return {
    subject: `Wind-mitigation inspection report — ${params.communityName}${building}`,
    body: [
      `Hello,`,
      ``,
      `My association, ${params.communityName}${building}, has a wind-mitigation inspection report ` +
        `for our building. It reflects an inspection dated ${params.inspectedAt} and shows a ` +
        `validity date of ${params.expiresAt}. I've attached it to this email.`,
      ...(params.isExpired
        ? ['', `NOTE: this report expired on ${params.expiresAt}. Insurers may not accept an expired form.`]
        : []),
      ``,
      `Please let me know whether this building report affects any wind-mitigation credit on the ` +
        `policy insuring the structure, and whether it has any bearing on my own policy's premium. ` +
        `Please also confirm the report is current for underwriting.`,
      ``,
      `Any wind-mitigation credit depends on your own policy and insurer.`,
      ``,
      `Thank you.`,
      ``,
      `---`,
      `Attach the report PDF you downloaded from PropertyPro before sending.`,
    ].join('\n'),
  };
}

/**
 * Board-facing note on the expiry alert email and the admin form. Frames
 * re-inspection as an owner benefit without promising one.
 */
export const WIND_MITIGATION_REINSPECTION_NOTE =
  'When this form expires, a new inspection lets every owner ask their insurer about ' +
  'wind-mitigation credits again.';

/**
 * One-line disclaimer repeated inside each report card so the no-advice /
 * no-promise hedge travels with the download + send actions, not just the
 * section header (legal-review finding #6).
 */
export const WIND_MITIGATION_CARD_DISCLAIMER =
  'Neither PropertyPro nor your association provides insurance advice or can promise a premium ' +
  'reduction. Any credit depends on your own policy and insurer.';

/**
 * Interstitial shown before Download / Send when a report is expired
 * (legal-review blocker #1). The warning must reach the user at the point of
 * transmission — the on-screen badge alone does not travel with the PDF/email.
 */
export const WIND_MITIGATION_EXPIRED_WARNING = (expiresAt: string): string =>
  `This inspection report expired on ${expiresAt}. Insurers may not accept an expired form — ` +
  `confirm with your inspector whether a current inspection is needed before sending. Continue anyway?`;

/**
 * Caption under the expiry date. 'Valid until' asserted insurer-acceptance
 * fact; this reframes the date as a guideline, not a rule (finding #7).
 */
export const WIND_MITIGATION_EXPIRY_CAPTION =
  'Insurers decide whether to accept a form — dates shown are a typical guideline, not a rule.';

/**
 * Inline helper under the free-text notes field. The notes are shown to every
 * owner, so board authors must not enter resident personal data
 * (legal-review blocker #3, §718.111(12)(c) / §720.303(5)).
 */
export const WIND_MITIGATION_NOTES_REDACTION_HINT =
  'This note is visible to everyone who can see this report. Do not enter personal information ' +
  'about owners or residents (SSNs, driver-license or account numbers, phone numbers, e-mail ' +
  'addresses, or home addresses), as required by Fla. Stat. §718.111(12)(c) / §720.303(5).';

/**
 * Upload-time attestation the board must confirm before posting a report
 * members-wide (legal-review blocker #3, behavior change).
 */
export const WIND_MITIGATION_REDACTION_ATTESTATION =
  'I have removed personal information about owners and residents from this report and its notes ' +
  'before posting it where members can see it.';

// ---------------------------------------------------------------------------
// Insurance summary + certificate request relay (spec #3) — same attorney gate.
// ---------------------------------------------------------------------------

/**
 * Standing disclaimer under the master-policy summary. The bright line from the
 * legal research: PropertyPro shows a factual summary but the agent-issued
 * documents control, and the summary confers no rights (no reliance).
 */
export const INSURANCE_SUMMARY_DISCLAIMER =
  'This is a summary of the association’s master policy for convenience only. The insurer’s ' +
  'policy and any certificate your agent issues control — this summary confers no coverage and no ' +
  'rights, and may not reflect the latest policy. Confirm details with the agent of record.';

/**
 * Shown on the certificate-request action. Makes clear PropertyPro relays a
 * request to the agent and does NOT issue certificates (the §626.854
 * public-adjuster / agent-licensing line).
 */
export const INSURANCE_CERTIFICATE_REQUEST_HINT =
  'PropertyPro sends your request to the association’s insurance agent, who issues all ' +
  'certificates. We don’t issue certificates or determine coverage.';

/** Danger banner when the posted policy has expired. */
export const INSURANCE_POLICY_EXPIRED_BANNER = (expiresAt: string): string =>
  `This summary may be out of date — the policy on file expired ${expiresAt}. Confirm current ` +
  `coverage with the agent of record.`;

/**
 * Build the certificate-request relay email (to the agent of record) plus the
 * requester's confirmation copy.
 *
 * Reply-To is the OWNER: the agent replies straight to the owner and
 * PropertyPro exits the loop. The agent email carries the attorney-reviewed
 * framing that PropertyPro is relaying a request, not issuing a certificate.
 */
export function buildCertificateRequestEmail(params: {
  communityName: string;
  carrierName: string;
  policyNumber: string | null;
  unitLabel: string;
  requesterName: string;
  requesterEmail: string;
  recipientName: string;
  recipientEmail: string;
  loanNumber: string | null;
}): { agentSubject: string; agentBody: string; confirmationSubject: string; confirmationBody: string } {
  const policyLine = params.policyNumber
    ? `${params.carrierName} (policy ${params.policyNumber})`
    : params.carrierName;

  return {
    agentSubject: `Certificate of insurance request — ${params.communityName}, unit ${params.unitLabel}`,
    agentBody: [
      `Hello,`,
      ``,
      `A unit owner at ${params.communityName} requests a certificate of insurance for the ` +
        `recipient below. PropertyPro is relaying this request on the association’s behalf; ` +
        `please issue the certificate directly to the recipient.`,
      ``,
      `Master policy: ${policyLine}`,
      `Unit: ${params.unitLabel}`,
      `Requesting owner: ${params.requesterName} (${params.requesterEmail})`,
      `Certificate recipient (lender / title): ${params.recipientName} (${params.recipientEmail})`,
      ...(params.loanNumber ? [`Loan / reference number: ${params.loanNumber}`] : []),
      ``,
      `This message was relayed by PropertyPro; reply to reach the owner directly.`,
    ].join('\n'),
    confirmationSubject: `We sent your certificate request — ${params.communityName}`,
    confirmationBody: [
      `Hi ${params.requesterName},`,
      ``,
      `We sent your certificate-of-insurance request to the association’s insurance agent for ` +
        `unit ${params.unitLabel}. The agent — not PropertyPro — issues the certificate and ` +
        `typically responds within a few business days; they’ll reply to you directly.`,
      ``,
      `Forward the certificate to your lender or title company (${params.recipientName}) once you ` +
        `receive it.`,
    ].join('\n'),
  };
}
