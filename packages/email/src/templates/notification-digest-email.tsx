import { Link } from '@react-email/components';
import { EmailLayout } from '../components/email-layout';
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
import type { BaseEmailProps } from '../types';

export interface NotificationDigestItem {
  title: string;
  summary?: string | null;
  actionUrl?: string | null;
}

export interface NotificationDigestEmailProps extends BaseEmailProps {
  recipientName: string;
  frequency: 'daily_digest' | 'weekly_digest';
  items: NotificationDigestItem[];
  portalUrl: string;
}

function getDigestLabel(frequency: NotificationDigestEmailProps['frequency']): string {
  return frequency === 'weekly_digest' ? 'Weekly' : 'Daily';
}

/**
 * Layout A8 · Digest — replace a run of separate emails with one read. The
 * one photographic band in the system sits here, where the mail is a pleasure
 * rather than a task. Items carry no type today, so there is no kind column.
 */
export function NotificationDigestEmail({
  branding,
  previewText,
  recipientName,
  frequency,
  items,
  portalUrl,
}: NotificationDigestEmailProps) {
  const digestLabel = getDigestLabel(frequency);
  const count = `${items.length} update${items.length === 1 ? '' : 's'}`;
  const rows: ItemRow[] = items.map((item) => ({
    title: item.actionUrl ? (
      <Link href={item.actionUrl} style={{ color: emailTheme.ink, textDecoration: 'none' }}>
        {item.title}
      </Link>
    ) : (
      item.title
    ),
    detail: item.summary || undefined,
  }));

  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? `${digestLabel} digest from ${branding.communityName} (${items.length} updates)`}
      mastheadContext={`${digestLabel} digest`}
      mastheadChip={{ label: count, tone: 'coral' }}
    >
      <PhotoBand image="band-records.jpg" alt={branding.communityName} height={120} />
      <CategoryMark icon="bell-slate" label={`${digestLabel} digest`} tone="meta" />
      <Headline
        lede={
          <>
            Hi {recipientName} — here is what happened at <Strong>{branding.communityName}</Strong> since your last
            digest.
          </>
        }
      >
        Your {digestLabel.toLowerCase()} digest
      </Headline>
      <ItemRows items={rows} />
      <ActionRow href={portalUrl} label="Open portal" />
      <FinePrint>
        You received this digest based on your notification preferences. You can update them in your account settings.
      </FinePrint>
    </EmailLayout>
  );
}
