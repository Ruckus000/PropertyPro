import { Heading, Text, Section, Hr, Link } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

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
 * Board-facing renewal/expiry alert for the insurance hub (wind-mit report or
 * master policy). Non-transactional under CAN-SPAM: it carries the association's
 * postal address and a one-click unsubscribe. Copy is factual and reused from
 * the attorney-gated insurance disclaimers — no premium promises, no advice.
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
  return (
    <EmailLayout branding={branding} previewText={previewText ?? intro}>
      <Heading as="h1" style={styles.heading}>
        {heading}
      </Heading>
      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>{intro}</Text>
      {body.map((line, index) => (
        <Text key={index} style={styles.body}>
          {line}
        </Text>
      ))}

      <Section style={styles.buttonSection}>
        <EmailButton href={portalUrl}>Open the insurance hub</EmailButton>
      </Section>

      <Hr style={{ borderColor: emailColors.border, margin: '24px 0 12px' }} />
      <Text style={styles.small}>{disclaimer}</Text>

      {/* CAN-SPAM sender postal address — the association's own mailing address. */}
      <Text style={{ ...styles.small, margin: '12px 0 0' }}>
        {branding.communityName}
        {senderAddressLines.map((line, index) => (
          <span key={index}>
            <br />
            {line}
          </span>
        ))}
      </Text>

      <Text style={{ ...styles.small, margin: '8px 0 0' }}>
        You're receiving this because you help manage {branding.communityName}.{' '}
        <Link href={unsubscribeUrl} style={{ color: emailColors.textSecondary }}>
          Unsubscribe from insurance alerts
        </Link>
        .
      </Text>
    </EmailLayout>
  );
}
