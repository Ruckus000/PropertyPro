import sanitizeHtml from 'sanitize-html';

/**
 * Sanitize the HTML body of a received support email.
 *
 * ── The threat ──
 *
 * `support_inbox_messages.html_body` is stored RAW, exactly as received. It is
 * written by whoever emailed support@ — an anonymous party on the public
 * internet — so it is attacker-controlled markup that will be rendered inside
 * the platform admin console, the single most privileged surface in the
 * product. A stored XSS here runs with a `super_admin` session.
 *
 * Sanitizing at WRITE time was rejected: it would destroy the only copy of what
 * was actually received, which matters when the message is evidence (a
 * statutory records request, an abuse report). So sanitizing is the reader's
 * job, every time, and this module is that job — kept separate from
 * `inbox.ts` because it is a different responsibility from data access and is
 * the piece most likely to need changing on its own.
 *
 * ── Defence in depth ──
 *
 * This is only the FIRST layer. The output is still rendered inside an iframe
 * with `sandbox=""` (see `HtmlMessageFrame.tsx`), and the console defaults to
 * showing `text_body` rather than HTML at all. Any one of the three failing
 * should not be enough.
 */

/**
 * Tags dropped along with their CONTENTS, not merely unwrapped.
 *
 * Without this, sanitize-html discards the tag but keeps its text, so
 * `<form>transfer $500</form>` renders as the bare words "transfer $500" inside
 * what looks like a genuine support message from us.
 *
 * NOTE: supplying this REPLACES sanitize-html's default list
 * (`script`, `style`, `textarea`, `option`) rather than extending it, so all
 * four must be repeated here or their contents start leaking through.
 */
const DISCARDED = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'option',
  'select',
  'link',
  'meta',
  'base',
  'noscript',
];

/**
 * Remote images in an inbound email are read receipts. An operator opening a
 * `privacy@` thread should not silently confirm to the sender that a human read
 * it — that is a disclosure the sender was never granted, and on a privacy
 * mailbox it is exactly the wrong default.
 *
 * So `src` is REMOVED outright rather than swapped for a placeholder: an
 * element with no `src` issues no request, and a `data:` placeholder would mean
 * re-admitting the `data:` scheme this sanitizer deliberately excludes. The
 * original is preserved in `data-blocked-src` so a "Load images" control can
 * restore it deliberately, and so the UI can style `img[data-blocked-src]`
 * rather than showing a bare broken-image icon.
 */

export interface SanitizeInboundHtmlOptions {
  /** Restore remote image sources. Only ever set from an explicit operator action. */
  allowRemoteImages?: boolean;
}

export function sanitizeInboundHtml(
  html: string | null,
  options: SanitizeInboundHtmlOptions = {},
): string {
  if (!html) return '';

  return sanitizeHtml(html, {
    allowedTags: [
      'p', 'br', 'hr', 'div', 'span', 'blockquote', 'pre', 'code',
      'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'small',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
      'a', 'img',
    ],
    // An explicit allowlist, so no `on*` handler can survive: they are not
    // listed, and a wildcard would have admitted every one of them.
    allowedAttributes: {
      // `rel`/`target` must be listed here or the transformTags hardening
      // below is silently filtered straight back out.
      a: ['href', 'title', 'rel', 'target'],
      img: ['src', 'alt', 'title', 'width', 'height', 'data-blocked-src'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan', 'scope'],
      '*': ['dir', 'lang'],
    },
    // `data:` is deliberately ABSENT. The repo allows it for img in
    // compile-template.ts, which is fine for operator-authored templates and
    // is not fine here: `data:text/html` is a navigation-based XSS vector.
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    // Strip the contents too — otherwise `<script>alert(1)</script>` leaves the
    // literal text `alert(1)` sitting in the rendered message.
    nonTextTags: DISCARDED,
    disallowedTagsMode: 'discard',
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          // `noopener` blocks window.opener access; `nofollow` avoids lending
          // our domain's reputation to whatever a spammer linked.
          rel: 'noopener noreferrer nofollow',
          target: '_blank',
        },
      }),
      img: (tagName, attribs) => {
        if (options.allowRemoteImages) return { tagName, attribs };
        const { src, ...rest } = attribs;
        return {
          tagName,
          attribs: { ...rest, ...(src ? { 'data-blocked-src': src } : {}) },
        };
      },
    },
  });
}
