import { Heading, Section, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import { EmailCard } from '../components/email-card';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface EsignInvitationEmailProps extends BaseEmailProps {
  signerName: string;
  senderName: string;
  documentName: string;
  signingUrl: string;
  expiresAt?: string;
  messageBody?: string;
}

export function EsignInvitationEmail({
  branding,
  previewText,
  signerName,
  senderName,
  documentName,
  signingUrl,
  expiresAt,
  messageBody,
}: EsignInvitationEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      accentColor={emailColors.accentViolet}
      previewText={
        previewText ??
        `${senderName} has requested your signature on "${documentName}"`
      }
    >
      <Heading as="h1" style={styles.heading}>
        Signature requested
      </Heading>

      <Text style={styles.body}>Hi {signerName},</Text>
      <Text style={styles.body}>
        {senderName} from <strong>{branding.communityName}</strong> has asked
        you to sign a document.
      </Text>

      <EmailCard>
        <Text
          style={{
            fontSize: '15px',
            fontWeight: 600,
            color: emailColors.foreground,
            margin: '0',
          }}
        >
          {documentName}
        </Text>
        {messageBody && (
          <Text
            style={{
              fontSize: '13px',
              color: emailColors.mutedForeground,
              fontStyle: 'italic',
              margin: '8px 0 0 0',
              lineHeight: '1.5',
            }}
          >
            "{messageBody}"
          </Text>
        )}
      </EmailCard>

      <Section style={styles.buttonSection}>
        <EmailButton href={signingUrl} variant="violet">
          Review &amp; sign
        </EmailButton>
      </Section>

      <Text style={styles.smallSpaced}>
        {expiresAt && <>This signing request expires on {expiresAt}. </>}
        If you did not expect this request, you can safely ignore this email.
      </Text>
    </EmailLayout>
  );
}

export default EsignInvitationEmail;
