import { Heading, Text, Section, Hr, Link } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

/** One line in a digest section. `date` is a pre-formatted human string. */
export interface SnowbirdDigestItem {
  title: string;
  detail?: string;
  date?: string;
  actionUrl: string;
}

export interface SnowbirdDigestEmailProps extends BaseEmailProps {
  recipientName: string;
  cadenceLabel: string;
  boardDecisions: SnowbirdDigestItem[];
  newDocuments: SnowbirdDigestItem[];
  upcoming: SnowbirdDigestItem[];
  complianceNote: string | null;
  portalUrl: string;
  /** Absolute URL that flips the recipient's cadence to `off` without login. */
  unsubscribeUrl: string;
}

const sectionHeading: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 700,
  color: emailColors.textPrimary,
  margin: '20px 0 8px',
};

const itemRow: React.CSSProperties = {
  padding: '8px 0',
  borderBottom: `1px solid ${emailColors.border}`,
};

function DigestSection({ heading, items }: { heading: string; items: SnowbirdDigestItem[] }) {
  if (items.length === 0) return null;
  return (
    <Section>
      <Text style={sectionHeading}>{heading}</Text>
      {items.map((item, index) => (
        <div key={`${item.title}-${index}`} style={itemRow}>
          <Link href={item.actionUrl} style={{ color: emailColors.textPrimary, textDecoration: 'none' }}>
            <strong>{item.title}</strong>
          </Link>
          <Text style={{ ...styles.small, margin: '2px 0 0' }}>
            {[item.detail, item.date].filter(Boolean).join(' · ')}
          </Text>
        </div>
      ))}
    </Section>
  );
}

/**
 * Auto-generated activity recap for seasonal/absentee owners. Compiled from
 * platform data; the footer makes clear it is a courtesy summary, not an
 * official notice, and offers one-click cadence control.
 */
export function SnowbirdDigestEmail({
  branding,
  previewText,
  recipientName,
  cadenceLabel,
  boardDecisions,
  newDocuments,
  upcoming,
  complianceNote,
  portalUrl,
  unsubscribeUrl,
}: SnowbirdDigestEmailProps) {
  const total = boardDecisions.length + newDocuments.length + upcoming.length;
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? `Your ${cadenceLabel} recap from ${branding.communityName} (${total} updates)`}
    >
      <Heading as="h1" style={styles.heading}>
        Your {cadenceLabel} in review
      </Heading>
      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        Here's what happened at <strong>{branding.communityName}</strong> while you were away.
      </Text>

      <DigestSection heading="Board decisions" items={boardDecisions} />
      <DigestSection heading="New documents" items={newDocuments} />
      <DigestSection heading="Coming up" items={upcoming} />

      {complianceNote && (
        <Section>
          <Text style={sectionHeading}>Compliance</Text>
          <Text style={styles.body}>{complianceNote}</Text>
        </Section>
      )}

      <Section style={styles.buttonSection}>
        <EmailButton href={portalUrl}>Open the portal</EmailButton>
      </Section>

      <Hr style={{ borderColor: emailColors.border, margin: '24px 0 12px' }} />
      <Text style={styles.small}>
        This is a courtesy summary of recent activity — not an official notice under Florida law.
        Official notices are sent separately. You're receiving this because you own a unit at{' '}
        {branding.communityName}.
      </Text>
      <Text style={styles.small}>
        <Link href={unsubscribeUrl} style={{ color: emailColors.textSecondary }}>
          Unsubscribe or change how often you get this
        </Link>
        .
      </Text>
    </EmailLayout>
  );
}
