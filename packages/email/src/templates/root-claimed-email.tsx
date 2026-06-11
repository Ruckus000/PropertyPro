import { Heading, Text } from '@react-email/components';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface RootClaimedEmailProps extends BaseEmailProps {
  claimantName: string;
  communityName: string;
  disputeUrl: string;
}

export function RootClaimedEmail({
  branding,
  previewText,
  claimantName,
  communityName,
  disputeUrl,
}: RootClaimedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ?? `${claimantName} is now the root manager of ${communityName}`
      }
    >
      <Heading as="h1" style={styles.heading}>
        Root manager claimed for {communityName}
      </Heading>
      <Text style={styles.body}>
        <strong>{claimantName}</strong> is now the root manager of{' '}
        <strong>{communityName}</strong>. The root manager has full administrative
        control over this community.
      </Text>
      <Text style={styles.body}>
        If this isn&apos;t right, you can dispute the claim below.
      </Text>
      <div style={styles.buttonSection}>
        <EmailButton href={disputeUrl}>Dispute this claim</EmailButton>
      </div>
      <Text style={styles.smallSpaced}>
        If you have questions, reply to this email or contact PropertyPro support.
      </Text>
    </EmailLayout>
  );
}
