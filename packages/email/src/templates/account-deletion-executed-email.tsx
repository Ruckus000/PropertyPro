import { Heading, Text } from '@react-email/components';
import { emailColors, primitiveColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import type { BaseEmailProps } from '../types';

export interface AccountDeletionExecutedEmailProps extends BaseEmailProps {
  recipientName: string;
  purgeDate: string;
}

export function AccountDeletionExecutedEmail({
  branding,
  previewText,
  recipientName,
  purgeDate,
}: AccountDeletionExecutedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? 'Your account has been deleted'}
    >
      <Heading as="h1" style={headingStyle}>
        Your Account Has Been Deleted
      </Heading>

      <Text style={textStyle}>Hi {recipientName},</Text>

      <Text style={textStyle}>
        Your account has been deleted as requested. You can no longer sign in
        with your previous credentials.
      </Text>

      <div style={infoBoxStyle}>
        <Text style={infoTextStyle}>
          <strong>Recovery window:</strong> Your anonymised account record is
          retained until <strong>{purgeDate}</strong>. If you deleted your
          account by mistake, contact our support team before that date to
          request recovery.
        </Text>
        <Text style={infoTextStyle}>
          <strong>After {purgeDate}:</strong> All personally identifiable
          information will be permanently purged and recovery will no longer be
          possible.
        </Text>
      </div>

      <Text style={textStyle}>
        To reach support, reply to this email or visit our help centre. Please
        have this email on hand as proof of your identity.
      </Text>

      <Text style={smallTextStyle}>
        Thank you for using {branding.communityName}. We are sorry to see you
        go.
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

const infoBoxStyle: React.CSSProperties = {
  backgroundColor: emailColors.surfaceMuted,
  border: `1px solid ${emailColors.borderStrong}`,
  borderLeft: `4px solid ${emailColors.textDisabled}`,
  borderRadius: '8px',
  padding: '16px',
  margin: '0 0 24px 0',
};

const infoTextStyle: React.CSSProperties = {
  fontSize: '15px',
  color: primitiveColors.gray[800],
  lineHeight: '24px',
  margin: '0 0 12px 0',
};

const smallTextStyle: React.CSSProperties = {
  fontSize: '14px',
  color: emailColors.textDisabled,
  lineHeight: '20px',
  margin: '0',
};
