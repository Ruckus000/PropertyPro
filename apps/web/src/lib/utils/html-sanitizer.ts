/**
 * Server-safe HTML sanitizer for announcement / FAQ bodies.
 *
 * Uses isomorphic-dompurify so the same sanitizer runs on the server
 * write path and the client / RSC read path. Configured with a strict
 * allowlist of tags + attributes appropriate for rich-text announcements.
 */

import DOMPurify from 'isomorphic-dompurify';

export const ALLOWED_TAGS = [
  'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre',
];
export const ALLOWED_ATTRS = ['href', 'target', 'rel'];

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ALLOWED_ATTRS,
    // DOMPurify already blocks javascript:, data:, vbscript: schemes by
    // default in href/src attributes — no extra allowlist needed.
  });
}
