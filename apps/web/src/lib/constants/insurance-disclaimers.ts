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
  'This report describes the building as inspected on the date shown. Florida insurers must offer ' +
  'wind-mitigation discounts, so sharing it with your insurer may reduce the wind portion of your ' +
  'premium — but any credit depends on your own policy and insurer. PropertyPro does not provide ' +
  'insurance advice.';

/**
 * Shown next to the form-family picker. This is documentation-in-the-interface:
 * the rule that decides which form a building needs (and why the board may have
 * the wrong one) is where the board makes the choice, not in a help article.
 */
export const WIND_MITIGATION_FORM_FAMILY_HINT =
  'Buildings 1–3 stories use the Florida OIR uniform form (OIR-B1-1802). Buildings 4+ stories use ' +
  'the Citizens MIT-BT forms, which a home inspector cannot complete.';

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
}): { subject: string; body: string } {
  const building = params.buildingLabel ? ` (${params.buildingLabel})` : '';

  return {
    subject: `Wind-mitigation inspection report — ${params.communityName}${building}`,
    body: [
      `Hello,`,
      ``,
      `My association, ${params.communityName}${building}, has a wind-mitigation inspection report ` +
        `for our building, inspected on ${params.inspectedAt}. I've attached it to this email.`,
      ``,
      `Please review it and let me know whether any wind-mitigation credits apply to my policy.`,
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
