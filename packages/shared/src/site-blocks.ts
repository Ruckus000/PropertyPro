/**
 * Block content type definitions for the public site builder.
 * Each block type has a specific content schema stored as JSONB.
 */

export const BLOCK_TYPES = [
  'hero', 'announcements', 'documents', 'meetings', 'contact', 'text', 'image',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export interface HeroBlockContent {
  headline: string;                    // max 120 chars
  subheadline: string;                 // max 300 chars
  ctaLabel: string;                    // max 40 chars
  ctaHref: string;
  backgroundImageUrl?: string;
}

export interface AnnouncementsBlockContent {
  title: string;                       // default "Announcements"
  limit: number;                       // 1-10, default 5
}

export interface DocumentsBlockContent {
  title: string;                       // default "Documents"
  categoryIds: number[];               // empty = all
}

export interface MeetingsBlockContent {
  title: string;                       // default "Upcoming Meetings"
}

export interface ContactBlockContent {
  boardEmail: string;
  managementCompany?: string;
  phone?: string;
  address?: string;
}

export interface TextBlockContent {
  body: string;                        // plain text or markdown, max 5000 chars
}

export interface ImageBlockContent {
  url: string;
  alt: string;                         // max 200 chars
  caption?: string;                    // max 300 chars
}

export type BlockContent =
  | HeroBlockContent
  | AnnouncementsBlockContent
  | DocumentsBlockContent
  | MeetingsBlockContent
  | ContactBlockContent
  | TextBlockContent
  | ImageBlockContent;

/**
 * Maps block type to its content interface for type-safe usage.
 */
export interface BlockContentMap {
  hero: HeroBlockContent;
  announcements: AnnouncementsBlockContent;
  documents: DocumentsBlockContent;
  meetings: MeetingsBlockContent;
  contact: ContactBlockContent;
  text: TextBlockContent;
  image: ImageBlockContent;
}

/**
 * Validate block content against its type's constraints.
 * Returns an error message or null if valid.
 */
export function validateBlockContent(type: BlockType, content: unknown): string | null {
  if (!content || typeof content !== 'object') return 'Content must be an object';

  switch (type) {
    case 'hero': {
      const c = content as HeroBlockContent;
      if (!c.headline || c.headline.length > 120) return 'Headline required, max 120 chars';
      if (!c.subheadline || c.subheadline.length > 300) return 'Subheadline required, max 300 chars';
      if (!c.ctaLabel || c.ctaLabel.length > 40) return 'CTA label required, max 40 chars';
      if (!c.ctaHref) return 'CTA href required';
      return null;
    }
    case 'announcements': {
      const c = content as AnnouncementsBlockContent;
      if (typeof c.limit === 'number' && (c.limit < 1 || c.limit > 10)) return 'Limit must be 1-10';
      return null;
    }
    case 'documents':
      return null; // categoryIds validated separately
    case 'meetings':
      return null;
    case 'contact': {
      const c = content as ContactBlockContent;
      if (!c.boardEmail) return 'Board email required';
      return null;
    }
    case 'text': {
      const c = content as TextBlockContent;
      if (!c.body) return 'Body text required';
      if (c.body.length > 5000) return 'Body text max 5000 chars';
      return null;
    }
    case 'image': {
      const c = content as ImageBlockContent;
      if (!c.url) return 'Image URL required';
      if (!c.alt || c.alt.length > 200) return 'Alt text required, max 200 chars';
      if (c.caption && c.caption.length > 300) return 'Caption max 300 chars';
      return null;
    }
    default:
      return `Unknown block type: ${type}`;
  }
}
