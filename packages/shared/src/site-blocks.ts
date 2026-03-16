/**
 * Block content type definitions for the public site builder.
 * Each block type has a specific content schema stored as JSONB.
 */

export const BLOCK_TYPES = [
  'hero', 'announcements', 'documents', 'meetings', 'contact', 'text', 'image', 'jsx_template',
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export const TEMPLATE_VARIANTS = ['public', 'mobile'] as const;
export type TemplateVariant = (typeof TEMPLATE_VARIANTS)[number];

export interface HeroBlockContent {
  headline: string;                    // max 120 chars
  subheadline?: string;                // max 300 chars, optional
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
  format?: 'plain' | 'markdown';       // defaults to 'plain' for backward compat
}

export interface ImageBlockContent {
  url: string;
  alt: string;                         // max 200 chars
  caption?: string;                    // max 300 chars
}

export interface JsxTemplateBlockContent {
  jsxSource: string;                   // raw JSX source, max 100,000 chars
  compiledHtml?: string;               // server-compiled static HTML
  compiledAt?: string;                 // ISO timestamp of last compilation
}

export type BlockContent =
  | HeroBlockContent
  | AnnouncementsBlockContent
  | DocumentsBlockContent
  | MeetingsBlockContent
  | ContactBlockContent
  | TextBlockContent
  | ImageBlockContent
  | JsxTemplateBlockContent;

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
  jsx_template: JsxTemplateBlockContent;
}

// ---------------------------------------------------------------------------
// URL safety helpers
// ---------------------------------------------------------------------------

/** Protocols considered safe for general href attributes. */
const SAFE_URL_PROTOCOLS = ['https:', 'http:', 'mailto:', 'tel:'];

/**
 * Returns true if `url` uses a safe protocol (https, http, mailto, tel)
 * or is a relative path / fragment. Rejects javascript:, data:, vbscript:, etc.
 */
export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return true;
  try {
    const parsed = new URL(trimmed);
    return SAFE_URL_PROTOCOLS.includes(parsed.protocol);
  } catch {
    // If URL() throws, it's likely a relative path — but guard against
    // cases like "javascript:alert(1)" where the constructor may not throw.
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx >= 0) {
      const slashIdx = trimmed.indexOf('/');
      if (slashIdx < 0 || colonIdx < slashIdx) return false;
    }
    return true;
  }
}

/**
 * Returns true if `url` is safe for use as an image src.
 * Allows https, http, relative paths, and data:image/* URIs.
 */
export function isSafeImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return true;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return true;
    if (parsed.protocol === 'data:' && trimmed.startsWith('data:image/')) return true;
    return false;
  } catch {
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx >= 0) {
      const slashIdx = trimmed.indexOf('/');
      if (slashIdx < 0 || colonIdx < slashIdx) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// Block content validation
// ---------------------------------------------------------------------------

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
      if (c.subheadline && c.subheadline.length > 300) return 'Subheadline cannot exceed 300 characters';
      if (!c.ctaLabel || c.ctaLabel.length > 40) return 'CTA label required, max 40 chars';
      if (!c.ctaHref) return 'CTA href required';
      if (!isSafeUrl(c.ctaHref)) return 'CTA href must use a safe protocol (https, http, mailto, tel, or relative path)';
      if (c.backgroundImageUrl && !isSafeImageUrl(c.backgroundImageUrl)) {
        return 'Background image URL must use a safe protocol';
      }
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
      if (c.format !== undefined && c.format !== 'plain' && c.format !== 'markdown') {
        return 'Format must be "plain" or "markdown"';
      }
      return null;
    }
    case 'image': {
      const c = content as ImageBlockContent;
      if (!c.url) return 'Image URL required';
      if (!isSafeImageUrl(c.url)) return 'Image URL must use a safe protocol';
      if (!c.alt || c.alt.length > 200) return 'Alt text required, max 200 chars';
      if (c.caption && c.caption.length > 300) return 'Caption max 300 chars';
      return null;
    }
    case 'jsx_template': {
      const c = content as JsxTemplateBlockContent;
      if (typeof c.jsxSource !== 'string') return 'jsxSource must be a string';
      if (c.jsxSource.length > 100_000) return 'jsxSource max 100,000 chars';
      return null;
    }
    default:
      return `Unknown block type: ${type}`;
  }
}

/**
 * Returns sensible default content for a new block of the given type.
 */
export function getDefaultBlockContent(type: BlockType): BlockContent {
  switch (type) {
    case 'hero':
      return { headline: '', subheadline: '', ctaLabel: 'Learn More', ctaHref: '/auth/login' };
    case 'announcements':
      return { title: 'Announcements', limit: 5 };
    case 'documents':
      return { title: 'Documents', categoryIds: [] };
    case 'meetings':
      return { title: 'Upcoming Meetings' };
    case 'contact':
      return { boardEmail: '' };
    case 'text':
      return { body: '', format: 'plain' };
    case 'image':
      return { url: '', alt: '' };
    case 'jsx_template':
      return { jsxSource: '' };
  }
}
