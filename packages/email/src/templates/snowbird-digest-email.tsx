import { Link } from '@react-email/components';
import { EmailLayout } from '../components/email-layout';
import { EmailAlert } from '../components/email-alert';
import {
  ActionRow,
  CategoryMark,
  FinePrint,
  Headline,
  ItemRows,
  PhotoBand,
  Strong,
  type ItemRow,
} from '../components/email-blocks';
import { emailTheme } from '../components/theme';
import type { BaseEmailProps, CommunityBranding } from '../types';

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

function toRows(items: SnowbirdDigestItem[], kind: string): ItemRow[] {
  return items.map((item) => {
    const detail = [item.detail, item.date].filter(Boolean).join(' · ');
    return {
      kind,
      title: (
        <Link href={item.actionUrl} style={{ color: emailTheme.ink, textDecoration: 'none' }}>
          {item.title}
        </Link>
      ),
      detail: detail || undefined,
    };
  });
}

/**
 * Layout A8 · Digest (snowbird variant) — auto-generated activity recap for
 * seasonal/absentee owners, compiled from platform data. Type chips in the left
 * column replace the old per-section headings. The fine print makes clear it
 * is a courtesy summary, not an official notice; the one-click cadence control
 * is the layout footer's single unsubscribe link (merged into `branding`, a
 * caller-supplied `branding.unsubscribeUrl` winning).
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
  const rows: ItemRow[] = [
    ...toRows(boardDecisions, 'Decision'),
    ...toRows(newDocuments, 'Document'),
    ...toRows(upcoming, 'Coming up'),
  ];
  const footerBranding: CommunityBranding = {
    ...branding,
    unsubscribeUrl: branding.unsubscribeUrl ?? unsubscribeUrl,
    unsubscribeLabel: branding.unsubscribeLabel ?? 'Unsubscribe or change how often you get this',
  };

  return (
    <EmailLayout
      branding={footerBranding}
      previewText={previewText ?? `Your ${cadenceLabel} recap from ${branding.communityName} (${total} updates)`}
      mastheadContext={`Your ${cadenceLabel} recap`}
      mastheadChip={{ label: `${total} update${total === 1 ? '' : 's'}`, tone: 'coral' }}
      footerReason={`You're receiving this because you own a unit at ${branding.communityName}.`}
    >
      <PhotoBand image="band-records.jpg" alt={branding.communityName} height={120} />
      <CategoryMark icon="bell-slate" label="Owner recap" tone="meta" />
      <Headline
        lede={
          <>
            Hi {recipientName} — here&apos;s what happened at <Strong>{branding.communityName}</Strong> while you were
            away.
          </>
        }
      >
        Your {cadenceLabel} in review
      </Headline>
      <ItemRows items={rows} />
      {complianceNote && (
        <EmailAlert variant="info" title="Compliance">
          {complianceNote}
        </EmailAlert>
      )}
      <ActionRow href={portalUrl} label="Open the portal" />
      <FinePrint>
        This is a courtesy summary of recent activity — not an official notice under Florida law. Official notices are
        sent separately.
      </FinePrint>
    </EmailLayout>
  );
}
