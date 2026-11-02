import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, FinePrint, Headline, Paragraph, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface ResidentNoticeEmailProps extends BaseEmailProps {
  recipientName: string;
  /** Short label for what this is about, e.g. "Package delivery". */
  category: string;
  title: string;
  description: string;
  actionUrl: string;
  /** Verb-first button text, e.g. "View my packages". */
  actionLabel: string;
  /** `warning` marks something the resident should act on (a violation, a denial, an expiring pass). */
  severity: 'info' | 'warning';
}

/**
 * Layout A2 · Announcement (resident variant) — a one-off notice about the
 * recipient's own home: a package, a visitor, a violation on their unit, a
 * decision on their ARC request. The compliance alert is the board-and-manager
 * counterpart; residents must never receive that one.
 */
export function ResidentNoticeEmail({
  branding,
  previewText,
  recipientName,
  category,
  title,
  description,
  actionUrl,
  actionLabel,
  severity,
}: ResidentNoticeEmailProps) {
  const warning = severity === 'warning';
  return (
    <EmailLayout branding={branding} previewText={previewText ?? title} mastheadContext={category}>
      <CategoryMark
        icon={warning ? 'warn-amber' : 'bell-slate'}
        label={category}
        tone={warning ? 'amber' : 'meta'}
      />
      <Headline>{title}</Headline>
      <Paragraph tight>Hi {recipientName},</Paragraph>
      <Paragraph>{description}</Paragraph>
      <ActionRow href={actionUrl} label={actionLabel} />
      <FinePrint>
        You received this because it concerns you or your home at <Strong>{branding.communityName}</Strong>.
      </FinePrint>
    </EmailLayout>
  );
}
