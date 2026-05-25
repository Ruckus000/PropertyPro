/**
 * Permissive HTML sanitizer for in-app authored documents.
 *
 * Used by the document-drafts editor pipeline. Allows images, tables,
 * alignment, and underline in addition to the narrow announcement allowlist.
 *
 * Strict guarantees:
 *   - <img src> must be a relative `/storage/...` path or a URL whose host
 *     matches the configured Supabase Storage host. data: and external URLs
 *     are stripped.
 *   - <a href> may use http, https, mailto, or tel only.
 *   - All event handlers, scripts, iframes, styles, and form elements are
 *     stripped by DOMPurify defaults.
 *   - Editor-internal alignment is expressed as data-text-align="left|center|right"
 *     and rendered to inline text-align via the print template — we do NOT
 *     allow style="" attributes through.
 */
import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p',
  'br',
  'b',
  'strong',
  'i',
  'em',
  'u',
  'a',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'code',
  'pre',
  'hr',
  'img',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'span',
  'div',
];

const ALLOWED_ATTRS = [
  'href',
  'target',
  'rel',
  'src',
  'alt',
  'width',
  'height',
  'colspan',
  'rowspan',
  'data-text-align',
  'data-document-link-id',
  'data-document-link-title',
  'data-document-link-category',
  'class',
];

const ALLOWED_URI_SCHEMES_RE = /^(?:https?|mailto|tel):/i;

const SUPABASE_HOST = (() => {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
})();

/**
 * Image src allowlist:
 *  - relative paths under /storage/ (Supabase proxy)
 *  - absolute URLs whose host matches SUPABASE_URL host
 * Everything else (including data: and protocol-relative //evil.com) is rejected.
 */
function isAllowedImageSrc(src: string): boolean {
  if (!src) return false;
  const trimmed = src.trim();
  if (trimmed.startsWith('/storage/')) return true;
  try {
    const u = new URL(trimmed);
    if (!SUPABASE_HOST) return false;
    return u.host === SUPABASE_HOST && (u.protocol === 'https:' || u.protocol === 'http:');
  } catch {
    return false;
  }
}

/**
 * data-text-align allowed values.
 */
const ALLOWED_ALIGN = new Set(['left', 'center', 'right', 'justify']);

/**
 * Class allowlist for editor-emitted classes (TipTap link / table / image
 * styling). Everything else is stripped.
 */
const ALLOWED_CLASSES = new Set([
  'editor-link',
  'editor-image',
  'editor-table',
  'editor-document-link',
  'editor-blockquote',
  'editor-code-block',
]);

/**
 * Numeric attribute clamp — width/height/colspan/rowspan must be positive
 * integers within sane bounds.
 */
function clampNumeric(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const n = parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 1 || n > max) return null;
  return String(n);
}

let authoredSanitizerDepth = 0;

// Hooks register once at module load because DOMPurify is a shared singleton.
// They only mutate attributes while sanitizeAuthoredHtml is actively running,
// which keeps this stricter authored-document policy from leaking into other
// server-side sanitizers such as help article rendering.
DOMPurify.addHook('uponSanitizeAttribute', (node, hookEvent) => {
  if (authoredSanitizerDepth === 0) return;

  const tagName = node.nodeName.toLowerCase();
  const attrName = hookEvent.attrName.toLowerCase();
  const attrValue = String(hookEvent.attrValue ?? '');

  // <a> URI scheme guard
  if (tagName === 'a' && attrName === 'href') {
    if (!ALLOWED_URI_SCHEMES_RE.test(attrValue)) {
      hookEvent.keepAttr = false;
      return;
    }
  }

  // <img src> allowlist
  if (tagName === 'img' && attrName === 'src') {
    if (!isAllowedImageSrc(attrValue)) {
      hookEvent.keepAttr = false;
      return;
    }
  }

  // data-text-align value guard
  if (attrName === 'data-text-align') {
    if (!ALLOWED_ALIGN.has(attrValue)) {
      hookEvent.keepAttr = false;
      return;
    }
  }

  // class attribute: keep only known editor classes
  if (attrName === 'class') {
    const filtered = attrValue
      .split(/\s+/)
      .filter((c) => ALLOWED_CLASSES.has(c))
      .join(' ');
    if (!filtered) {
      hookEvent.keepAttr = false;
    } else {
      hookEvent.attrValue = filtered;
    }
    return;
  }

  // Numeric clamps
  if (attrName === 'width' || attrName === 'height') {
    const clamped = clampNumeric(attrValue, 4096);
    if (clamped === null) {
      hookEvent.keepAttr = false;
    } else {
      hookEvent.attrValue = clamped;
    }
    return;
  }
  if (attrName === 'colspan' || attrName === 'rowspan') {
    const clamped = clampNumeric(attrValue, 64);
    if (clamped === null) {
      hookEvent.keepAttr = false;
    } else {
      hookEvent.attrValue = clamped;
    }
    return;
  }

  // <a target> normalization
  if (tagName === 'a' && attrName === 'target') {
    if (attrValue !== '_blank') {
      hookEvent.keepAttr = false;
    }
    return;
  }
});

// Force any <a target="_blank"> to also carry rel="noopener noreferrer"
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (authoredSanitizerDepth === 0) return;

  if (node.nodeName === 'A') {
    const el = node as Element;
    if (el.getAttribute('target') === '_blank') {
      el.setAttribute('rel', 'noopener noreferrer');
    }
  }
});

/**
 * Sanitize editor-produced HTML for storage in document_drafts.body_html and
 * for the published HTML artifact archived alongside the PDF.
 *
 * URI filtering: relies on DOMPurify's default IS_ALLOWED_URI (rejects
 * javascript:/vbscript:, permits http(s)/mailto/tel/relative paths). The
 * uponSanitizeAttribute hook above adds the strict per-tag allowlist:
 * <a href> must match http/https/mailto/tel; <img src> must be /storage/
 * or the configured Supabase host. Setting ALLOWED_URI_REGEXP to a
 * scheme-only regex here would strip relative /storage/ paths *before* the
 * hook runs, so we don't.
 */
export function sanitizeAuthoredHtml(dirty: string): string {
  authoredSanitizerDepth += 1;
  try {
    return DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: ALLOWED_ATTRS,
      ALLOW_DATA_ATTR: false,
      FORBID_ATTR: ['style', 'on*'],
      FORBID_TAGS: [
        'script',
        'iframe',
        'object',
        'embed',
        'form',
        'input',
        'style',
        'link',
        'meta',
      ],
      KEEP_CONTENT: true,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
    }) as string;
  } finally {
    authoredSanitizerDepth -= 1;
  }
}
