import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize server-rendered help MDX before it is sent to the client modal.
 *
 * Help content is repo-controlled, but the modal uses `dangerouslySetInnerHTML`
 * to avoid client-side MDX eval under production CSP, so we still strip script,
 * style, form, and event-handler surfaces as defense in depth.
 */
export function sanitizeHelpHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['section', 'article', 'nav', 'aside', 'figure', 'figcaption'],
    ADD_ATTR: [
      'aria-hidden',
      'aria-label',
      'class',
      'decoding',
      'height',
      'id',
      'loading',
      'role',
      'sizes',
      'srcset',
      'title',
      'width',
    ],
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
  }) as string;
}
