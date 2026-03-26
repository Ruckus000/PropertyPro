import { Button, Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import type { BaseEmailProps } from '../types';

export interface FreeAccessExpiringEmailProps extends BaseEmailProps {
  recipientName: string;
  communityName: string;
  daysRemaining: number;
  subscribeUrl: string;
}

export function FreeAccessExpiringEmail({
  branding,
  previewText,
  recipientName,
  communityName,
  daysRemaining,
  subscribeUrl,
}: FreeAccessExpiringEmailProps) {
  const dayLabel = `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`;

  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `Your free access to ${communityName} ends in ${dayLabel}`
      }
    >
      <Heading as="h1" style={headingStyle}>
        Your Free Access Is Ending Soon
      </Heading>

      <Text style={textStyle}>Hi {recipientName},</Text>

      <Text style={textStyle}>
        Your free access to <strong>{communityName}</strong> ends in{' '}
        <strong>{dayLabel}</strong>. Subscribe now to continue uninterrupted
        access to your community portal.
      </Text>

      <Button style={buttonStyle(branding.accentColor)} href={subscribeUrl}>
        Subscribe Now
      </Button>

      <Text style={smallTextStyle}>
        If you have questions about our subscription plans, reply to this email
        and we will be happy to help.
      </Text>
    </EmailLayout>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const headingStyle: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: emailColors.textPrimary,
  margin: '0 0 16px 0',
};

const textStyle: React.CSSProperties = {
  fontSize: '16px',
  color: emailColors.textSecondary,
  lineHeight: '24px',
  margin: '0 0 16px 0',
};

function buttonStyle(accent?: string): React.CSSProperties {
  return {
    backgroundColor: accent ?? emailColors.interactivePrimary,
    color: emailColors.textInverse,
    padding: '12px 24px',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: 'bold',
    textDecoration: 'none',
    display: 'inline-block',
    margin: '8px 0 24px 0',
  };
}

const smallTextStyle: React.CSSProperties = {
  fontSize: '14px',
  color: emailColors.textDisabled,
  lineHeight: '20px',
  margin: '0',
};
