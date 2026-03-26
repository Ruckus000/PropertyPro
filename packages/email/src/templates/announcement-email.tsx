import { Heading, Text, Section } from '@react-email/components';
import { emailColors, primitiveColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import { EmailCard } from '../components/email-card';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface AnnouncementEmailProps extends BaseEmailProps {
  recipientName: string;
  announcementTitle: string;
  announcementBody: string;
  authorName: string;
  portalUrl: string;
  isPinned?: boolean;
}

export function AnnouncementEmail({
  branding,
  previewText,
  recipientName,
  announcementTitle,
  announcementBody,
  authorName,
  portalUrl,
  isPinned = false,
}: AnnouncementEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `New announcement from ${branding.communityName}: ${announcementTitle}`
      }
    >
      <Heading as="h1" style={styles.heading}>
        {isPinned ? 'Important announcement' : 'New announcement'}
      </Heading>
      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        A new announcement has been posted at{' '}
        <strong>{branding.communityName}</strong>.
      </Text>

      <EmailCard>
        <p style={cardTitleStyle}>{announcementTitle}</p>
        <p style={cardBodyStyle}>{announcementBody}</p>
        <p style={cardAuthorStyle}>Posted by {authorName}</p>
      </EmailCard>

      <Section style={styles.buttonSection}>
        <EmailButton href={portalUrl} variant="default">
          View in portal
        </EmailButton>
      </Section>

      <Text style={styles.smallSpaced}>
        You are receiving this as a member of {branding.communityName}.
      </Text>
    </EmailLayout>
  );
}

const cardTitleStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  color: emailColors.foreground,
  margin: '0 0 8px 0',
};

const cardBodyStyle: React.CSSProperties = {
  fontSize: '14px',
  color: primitiveColors.zinc[700],
  lineHeight: '1.6',
  margin: '0 0 10px 0',
};

const cardAuthorStyle: React.CSSProperties = {
  fontSize: '13px',
  color: emailColors.mutedForeground,
  margin: '0',
};
