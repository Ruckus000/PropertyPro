import { Img } from '@react-email/components';
import { EmailLayout } from '../components/email-layout';
import { FinePrint, Headline, MultilineText, Paragraph, Strong } from '../components/email-blocks';
import { emailIconUrl } from '../components/email-assets';
import { emailTheme, toneFill, type EmailTone } from '../components/theme';
import type { BaseEmailProps } from '../types';

export type EmergencyAlertSeverity = 'emergency' | 'urgent' | 'info';

export interface EmergencyAlertEmailProps extends BaseEmailProps {
  recipientName: string;
  alertTitle: string;
  alertBody: string;
  severity: EmergencyAlertSeverity;
  sentAt: string;
}

const SEVERITY: Record<EmergencyAlertSeverity, { label: string; tone: EmailTone }> = {
  emergency: { label: 'Emergency alert', tone: 'red' },
  urgent: { label: 'Urgent alert', tone: 'amber' },
  info: { label: 'Community alert', tone: 'teal' },
};

/**
 * Layout A6 · Emergency alert — read at 5am, on a lock screen, by someone half
 * awake. The only layout with a filled band above the masthead and no imagery;
 * severity picks the band's colour and label. Body copy is full-strength ink.
 */
export function EmergencyAlertEmail({
  branding,
  previewText,
  recipientName,
  alertTitle,
  alertBody,
  severity,
  sentAt,
}: EmergencyAlertEmailProps) {
  const level = SEVERITY[severity];

  return (
    <EmailLayout
      branding={branding}
      tone={level.tone}
      previewText={previewText ?? `Emergency Alert: ${alertTitle} — ${branding.communityName}`}
      mastheadSize="compact"
      mastheadMeta={<>Sent {sentAt}</>}
      banner={<SeverityBand label={level.label} tone={level.tone} />}
    >
      <Headline>{alertTitle}</Headline>
      <Paragraph ink tight>
        Hi {recipientName} — this is an emergency notification from <Strong>{branding.communityName}</Strong>.
      </Paragraph>
      <Paragraph ink>
        <MultilineText text={alertBody} />
      </Paragraph>
      <FinePrint>Emergency notifications cannot be unsubscribed.</FinePrint>
    </EmailLayout>
  );
}

/** The filled band above the masthead: white glyph + uppercase severity label. */
function SeverityBand({ label, tone }: { label: string; tone: EmailTone }) {
  return (
    <tr>
      <td style={{ backgroundColor: toneFill(tone), padding: '15px 30px', textAlign: 'center' }}>
        <Img
          src={emailIconUrl('alert-white')}
          width={22}
          height={22}
          alt=""
          style={{ display: 'inline-block', verticalAlign: '-6px', marginRight: '11px', width: '22px', height: '22px' }}
        />
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: emailTheme.onFill,
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      </td>
    </tr>
  );
}
