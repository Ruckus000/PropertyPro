/**
 * Allowlist-based HTML sanitizer (server-safe, no DOM needed).
 *
 * Shared across announcement routes to avoid duplication.
 */

export const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre',
]);
export const ALLOWED_ATTRS = new Set(['href', 'target', 'rel']);

export function sanitizeHtml(dirty: string): string {
  // Replace HTML tags: keep allowed tags with allowed attrs, strip everything else
  return dirty.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)?\/?>/g, (match, tag: string, attrs: string) => {
    const lowerTag = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(lowerTag)) return '';

    // Self-closing tags
    if (match.startsWith('</')) return `</${lowerTag}>`;

    // Filter attributes to allowed set
    const cleanAttrs: string[] = [];
    if (attrs) {
      const attrRegex = /([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrs)) !== null) {
        const attrName = attrMatch[1]!.toLowerCase();
        const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
        if (!ALLOWED_ATTRS.has(attrName)) continue;
        // Block javascript: URLs in href
        if (attrName === 'href' && /^\s*javascript\s*:/i.test(attrValue)) continue;
        cleanAttrs.push(`${attrName}="${attrValue.replace(/"/g, '&quot;')}"`);
      }
    }

    const attrStr = cleanAttrs.length > 0 ? ' ' + cleanAttrs.join(' ') : '';
    const selfClose = match.endsWith('/>') ? ' /' : '';
    return `<${lowerTag}${attrStr}${selfClose}>`;
  });
}
