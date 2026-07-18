import { Text } from '@react-email/components';
import { EmailLayout } from '../components/email-layout';
import * as styles from '../components/shared-styles';

export interface CertificateRequestEmailProps {
  /** Pre-composed, attorney-reviewed body (newline-separated). */
  body: string;
  /** Optional branding; defaults to a neutral PropertyPro shell. */
  communityName?: string;
}

/**
 * Thin renderer for the certificate-request relay + confirmation emails. The
 * exact wording is composed by `buildCertificateRequestEmail` (attorney-gated
 * in insurance-disclaimers.ts) and passed in as `body`; this template only
 * wraps it in the standard email shell, preserving line breaks.
 */
export function CertificateRequestEmail({ body, communityName }: CertificateRequestEmailProps) {
  return (
    <EmailLayout branding={{ communityName: communityName ?? 'PropertyPro' }} previewText={body.slice(0, 120)}>
      {body.split('\n').map((line, index) =>
        line.length === 0 ? (
          <Text key={index} style={{ ...styles.body, margin: '0 0 8px' }}>
            &nbsp;
          </Text>
        ) : (
          <Text key={index} style={{ ...styles.body, margin: '0 0 4px' }}>
            {line}
          </Text>
        ),
      )}
    </EmailLayout>
  );
}
