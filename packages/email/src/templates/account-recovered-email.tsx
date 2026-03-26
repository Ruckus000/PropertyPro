import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import type { BaseEmailProps } from '../types';

export interface AccountRecoveredEmailProps extends BaseEmailProps {
  recipientName: string;
}

export function AccountRecoveredEmail({
  branding,
  previewText,
  recipientName,
}: AccountRecoveredEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? 'Your account has been restored — you can sign in again'}
    >
      <Heading as="h1" style={headingStyle}>
        Your Account Has Been Restored
      </Heading>

      <Text style={textStyle}>Hi {recipientName},</Text>

      <Text style={textStyle}>
        Great news — your account has been successfully restored. You can sign
        in again using your previous credentials.
      </Text>

      <Text style={textStyle}>
        Everything is back to the way it was. If you notice anything missing or
        have questions, please contact our support team and we will be glad to
        help.
      </Text>

      <Text style={smallTextStyle}>
        If you did not request account recovery, please contact support
        immediately so we can secure your account.
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

const smallTextStyle: React.CSSProperties = {
  fontSize: '14px',
  color: emailColors.textDisabled,
  lineHeight: '20px',
  margin: '0',
};
