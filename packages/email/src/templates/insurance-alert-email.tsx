import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, FinePrint, Headline, Paragraph } from '../components/email-blocks';
import type { BaseEmailProps, CommunityBranding } from '../types';

export interface InsuranceAlertEmailProps extends BaseEmailProps {
  /** Board member / manager receiving the alert. */
  recipientName: string;
  heading: string;
  intro: string;
  /** Factual next-step lines. */
  body: string[];
  /** Attorney-reviewed no-advice / no-promise line. */
  disclaimer: string;
  portalUrl: string;
  /**
   * The association's physical postal address, one line per entry. Required by
   * CAN-SPAM: the sender here is the association, so this is the community's own
   * mailing address, not PropertyPro's.
   */
  senderAddressLines: string[];
  /** Absolute URL that turns off this recipient's insurance alerts without login. */
  unsubscribeUrl: string;
}

/**
 * Layout A4 · Compliance alert (insurance variant) — board-facing renewal /
 * expiry alert for the insurance hub (wind-mit report or master policy).
 *
 * Non-transactional under CAN-SPAM: it carries the association's postal
 * address and a one-click unsubscribe. Both live in the layout footer — the
 * props are merged into `branding` so there is exactly ONE unsubscribe link,
 * with a caller-supplied `branding` value winning. Copy is factual and reused
 * from the attorney-gated insurance disclaimers — no premium promises, no advice.
 */
export function InsuranceAlertEmail({
  branding,
  previewText,
  recipientName,
  heading,
  intro,
  body,
  disclaimer,
  portalUrl,
  senderAddressLines,
  unsubscribeUrl,
}: InsuranceAlertEmailProps) {
  const footerBranding: CommunityBranding = {
    ...branding,
    postalAddressLines: branding.postalAddressLines ?? senderAddressLines,
    unsubscribeUrl: branding.unsubscribeUrl ?? unsubscribeUrl,
    unsubscribeLabel: branding.unsubscribeLabel ?? 'Unsubscribe from insurance alerts',
  };

  return (
    <EmailLayout
      branding={footerBranding}
      tone="red"
      previewText={previewText ?? intro}
      mastheadContext="Board & manager notice"
      footerReason={`You're receiving this because you help manage ${branding.communityName}.`}
    >
      <CategoryMark icon="alert-red" label="Insurance alert" tone="red" />
      <Headline
        lede={
          <>
            Hi {recipientName} — {intro}
          </>
        }
      >
        {heading}
      </Headline>
      {body.map((line, index) => (
        <Paragraph key={index} tight={index < body.length - 1}>
          {line}
        </Paragraph>
      ))}
      <ActionRow href={portalUrl} label="Open the insurance hub" variant="destructive" />
      <FinePrint>{disclaimer}</FinePrint>
    </EmailLayout>
  );
}
