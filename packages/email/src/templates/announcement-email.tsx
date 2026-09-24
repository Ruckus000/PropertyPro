import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, Headline, MultilineText, Paragraph, PhotoBand, Signature } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface AnnouncementEmailProps extends BaseEmailProps {
  recipientName: string;
  announcementTitle: string;
  announcementBody: string;
  authorName: string;
  portalUrl: string;
  isPinned?: boolean;
  /** Optional: the author's role, shown under their name in the signature. */
  authorRole?: string;
  /** Optional: show the community photo band. Off by default — photography is rationed. */
  showPhoto?: boolean;
}

/** Layout A2 · Announcement — what's happening, in the board's voice, with a human sender. */
export function AnnouncementEmail({
  branding,
  previewText,
  recipientName,
  announcementTitle,
  announcementBody,
  authorName,
  portalUrl,
  isPinned = false,
  authorRole,
  showPhoto = false,
}: AnnouncementEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? `New announcement from ${branding.communityName}: ${announcementTitle}`}
      mastheadContext="Community announcement"
      mastheadChip={isPinned ? { label: 'Pinned', tone: 'coral' } : undefined}
      footerReason={`You receive announcements as a member of ${branding.communityName}.`}
    >
      {showPhoto && <PhotoBand image="photo-condo.jpg" alt={`${branding.communityName}`} />}
      <CategoryMark
        icon={isPinned ? 'megaphone-coral' : 'megaphone-slate'}
        label={isPinned ? 'Important announcement' : 'New announcement'}
        tone={isPinned ? 'coral' : 'meta'}
      />
      <Headline>{announcementTitle}</Headline>
      <Paragraph tight>Hi {recipientName},</Paragraph>
      <Paragraph>
        <MultilineText text={announcementBody} />
      </Paragraph>
      <ActionRow href={portalUrl} label="Read in the portal" />
      <Signature name={authorName} role={authorRole ?? branding.communityName} />
    </EmailLayout>
  );
}
