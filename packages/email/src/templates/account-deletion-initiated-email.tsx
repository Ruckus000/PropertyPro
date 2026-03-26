import { Button, Heading, Text } from '@react-email/components';
import { emailColors, primitiveColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import type { BaseEmailProps } from '../types';

export interface AccountDeletionInitiatedEmailProps extends BaseEmailProps {
  recipientName: string;
  coolingEndDate: string;
  purgeDate: string;
  cancelUrl: string;
}

export function AccountDeletionInitiatedEmail({
  branding,
  previewText,
  recipientName,
  coolingEndDate,
  purgeDate,
  cancelUrl,
}: AccountDeletionInitiatedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        'Account deletion has been initiated — you can cancel within 30 days'
      }
    >
      <Heading as="h1" style={headingStyle}>
        Account Deletion Initiated
      </Heading>

      <Text style={textStyle}>Hi {recipientName},</Text>

      <Text style={textStyle}>
        We have received a request to delete your account. Here is what happens
        next:
      </Text>

      <div style={timelineBoxStyle}>
        <Text style={timelineItemStyle}>
          <strong>30-day cooling-off period</strong> — Your account is
          deactivated but not yet deleted. You can cancel this request any time
          before <strong>{coolingEndDate}</strong>.
        </Text>
        <Text style={timelineItemStyle}>
          <strong>6-month recovery window</strong> — After the cooling period
          your account enters a recovery state. Contact support to restore your
          account before <strong>{purgeDate}</strong>.
        </Text>
        <Text style={timelineItemStyle}>
          <strong>Permanent PII purge</strong> — On <strong>{purgeDate}</strong>{' '}
          all personally identifiable information will be permanently and
          irreversibly deleted from our systems.
        </Text>
      </div>

      <Text style={textStyle}>
        Changed your mind? Cancel the deletion request now — your account will
        be restored immediately.
      </Text>

      <Button style={cancelButtonStyle} href={cancelUrl}>
        Cancel Deletion Request
      </Button>

      <Text style={smallTextStyle}>
        If you did not request account deletion, please cancel immediately and
        contact support. This action was initiated from your account settings.
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

const timelineBoxStyle: React.CSSProperties = {
  backgroundColor: emailColors.warningBackground,
  border: `1px solid ${emailColors.warningBorder}`,
  borderLeft: `4px solid ${emailColors.warningForeground}`,
  borderRadius: '8px',
  padding: '16px',
  margin: '0 0 24px 0',
};

const timelineItemStyle: React.CSSProperties = {
  fontSize: '15px',
  color: primitiveColors.gray[800],
  lineHeight: '24px',
  margin: '0 0 12px 0',
};

const cancelButtonStyle: React.CSSProperties = {
  backgroundColor: primitiveColors.red[600],
  color: emailColors.textInverse,
  padding: '12px 24px',
  borderRadius: '6px',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  display: 'inline-block',
  margin: '8px 0 24px 0',
};

const smallTextStyle: React.CSSProperties = {
  fontSize: '14px',
  color: emailColors.textDisabled,
  lineHeight: '20px',
  margin: '0',
};
