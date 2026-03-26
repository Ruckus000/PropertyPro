import { Heading, Text, Section } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import { EmailCard } from '../components/email-card';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface DocumentPostedEmailProps extends BaseEmailProps {
  recipientName: string;
  documentTitle: string;
  documentCategory?: string;
  uploadedByName: string;
  portalUrl: string;
}

export function DocumentPostedEmail({
  branding,
  previewText,
  recipientName,
  documentTitle,
  documentCategory,
  uploadedByName,
  portalUrl,
}: DocumentPostedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `${branding.communityName}: New document posted`
      }
    >
      <Heading as="h1" style={styles.heading}>
        New document posted
      </Heading>
      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        A new document has been posted at{' '}
        <strong>{branding.communityName}</strong>.
      </Text>

      <EmailCard>
        <p style={cardTitleStyle}>{documentTitle}</p>
        <table
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ borderCollapse: 'collapse', marginTop: '8px' }}
        >
          <tbody>
            {documentCategory && (
              <tr>
                <td style={metaLabelCell}>Category</td>
                <td style={metaValueCell}>{documentCategory}</td>
              </tr>
            )}
            <tr>
              <td style={metaLabelCell}>Uploaded by</td>
              <td style={metaValueCell}>{uploadedByName}</td>
            </tr>
          </tbody>
        </table>
      </EmailCard>

      <Section style={styles.buttonSection}>
        <EmailButton href={portalUrl} variant="default">
          View document
        </EmailButton>
      </Section>

      <Text style={styles.smallSpaced}>
        Per Florida Statute &sect;718.111(12)(g), association documents must be
        available to unit owners through the association&apos;s website.
      </Text>
    </EmailLayout>
  );
}

const cardTitleStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  color: emailColors.foreground,
  margin: '0 0 4px 0',
};

const metaLabelCell: React.CSSProperties = {
  ...styles.labelCell,
  fontSize: '13px',
};

const metaValueCell: React.CSSProperties = {
  ...styles.valueCell,
  fontSize: '13px',
};
