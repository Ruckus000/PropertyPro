import { Heading, Text } from '@react-email/components';
import { EmailLayout } from '../components/email-layout';
import { EmailCard } from '../components/email-card';
import { emailColors } from '@propertypro/tokens/email';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface OtpVerificationEmailProps extends BaseEmailProps {
  recipientName: string;
  otpCode: string;
  expiresInMinutes?: number;
}

export function OtpVerificationEmail({
  branding,
  previewText,
  recipientName,
  otpCode,
  expiresInMinutes = 10,
}: OtpVerificationEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? 'Your verification code'}
    >
      <Heading as="h1" style={styles.heading}>
        Verification code
      </Heading>
      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>Enter the code below to verify your identity:</Text>
      <EmailCard
        style={{
          margin: '20px 0',
          textAlign: 'center',
        }}
      >
        <span
          style={{
            fontSize: '32px',
            fontWeight: 'bold',
            color: emailColors.foreground,
            letterSpacing: '12px',
            fontFamily: "'Courier New', Courier, monospace",
          }}
        >
          {otpCode}
        </span>
      </EmailCard>
      <Text style={styles.body}>
        This code expires in {expiresInMinutes} minute{expiresInMinutes !== 1 ? 's' : ''}.
      </Text>
      <Text style={styles.small}>
        If you didn&apos;t request this, you can safely ignore this email.
      </Text>
    </EmailLayout>
  );
}
