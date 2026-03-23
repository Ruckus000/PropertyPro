import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from '../components/email-layout';
import type { BaseEmailProps } from '../types';

export interface FreeAccessExpiredEmailProps extends BaseEmailProps {
  recipientName: string;
  communityName: string;
  subscribeUrl: string;
  graceDaysRemaining: number;
}

export function FreeAccessExpiredEmail({
  branding,
  previewText,
  recipientName,
  communityName,
  subscribeUrl,
  graceDaysRemaining,
}: FreeAccessExpiredEmailProps) {
  const dayLabel = `${graceDaysRemaining} day${graceDaysRemaining !== 1 ? 's' : ''}`;

  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `Your free access to ${communityName} has ended — subscribe to keep access`
      }
    >
      <Heading as="h1" style={headingStyle}>
        Your Free Access Has Ended
      </Heading>

      <Text style={textStyle}>Hi {recipientName},</Text>

      <Text style={textStyle}>
        Your free access to <strong>{communityName}</strong> has ended. You have{' '}
        <strong>{dayLabel}</strong> to subscribe before your access is locked.
      </Text>

      <Text style={textStyle}>
        Subscribe now to restore full access and continue managing your
        community without interruption.
      </Text>

      <Button style={buttonStyle(branding.accentColor)} href={subscribeUrl}>
        Subscribe to Keep Access
      </Button>

      <Text style={smallTextStyle}>
        After the grace period your account will be locked. Your data will be
        retained and you can reactivate at any time by subscribing.
      </Text>
    </EmailLayout>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const headingStyle: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#111827',
  margin: '0 0 16px 0',
};

const textStyle: React.CSSProperties = {
  fontSize: '16px',
  color: '#374151',
  lineHeight: '24px',
  margin: '0 0 16px 0',
};

function buttonStyle(accent?: string): React.CSSProperties {
  return {
    backgroundColor: accent ?? '#2563eb',
    color: '#ffffff',
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
  color: '#6b7280',
  lineHeight: '20px',
  margin: '0',
};
