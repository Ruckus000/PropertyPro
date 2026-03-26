import { Heading, Text } from '@react-email/components';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface InvitationEmailProps extends BaseEmailProps {
  inviteeName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
  expiresInDays?: number;
}

export function InvitationEmail({
  branding,
  previewText,
  inviteeName,
  inviterName,
  role,
  inviteUrl,
  expiresInDays = 7,
}: InvitationEmailProps) {
  const expirationText = `${expiresInDays} day${expiresInDays !== 1 ? 's' : ''}`;

  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `You've been invited to join ${branding.communityName}`
      }
    >
      <Heading as="h1" style={styles.heading}>
        You&apos;ve been invited
      </Heading>
      <Text style={styles.body}>Hi {inviteeName},</Text>
      <Text style={styles.body}>
        {inviterName} has invited you to join{' '}
        <strong>{branding.communityName}</strong> as a{' '}
        <strong>{role}</strong>.
      </Text>
      <div style={styles.buttonSection}>
        <EmailButton href={inviteUrl}>Accept invitation</EmailButton>
      </div>
      <Text style={styles.smallSpaced}>
        This invitation expires in {expirationText}. If you did not expect this
        invitation, you can safely ignore this email.
      </Text>
    </EmailLayout>
  );
}
