/**
 * A minimal HTML page that sends the browser on to `target`, for responses
 * that must be a 200 rather than a 307 (demo-login's preview branch: browsers
 * drop Set-Cookie on a 307 inside a cross-origin iframe).
 *
 * The target is written into two contexts, and each is escaped for its own
 * context instead of trusting URL serialisation to have removed the dangerous
 * characters:
 * - the `<meta http-equiv="refresh">` attribute value, HTML-attribute escaped;
 * - the inline `<script>`, as a JS string literal with every character that
 *   can end a script element or a string (`<`, `>`, `&`, U+2028, U+2029)
 *   written as a `\uXXXX` escape.
 *
 * Only http(s) targets are accepted, so a `javascript:` URL can never reach
 * either sink.
 */

const ATTRIBUTE_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '"': '&quot;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;',
};

/** Escape a value for a double- or single-quoted HTML attribute. */
export function escapeHtmlAttribute(value: string): string {
  return value.replace(/[&"'<>]/g, (ch) => ATTRIBUTE_ESCAPES[ch]!);
}

/**
 * A JS string literal safe to place inside an inline `<script>`: JSON quoting,
 * plus `\uXXXX` for the characters that could close the element, open an HTML
 * comment, or (pre-ES2019) terminate the string.
 */
export function toInlineScriptString(value: string): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

export function buildClientRedirectHtml(target: URL): string {
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    throw new Error(`Refusing a client redirect to a ${target.protocol} URL`);
  }
  const href = target.href;
  return (
    '<!DOCTYPE html><html><head>' +
    `<meta http-equiv="refresh" content="0;url=${escapeHtmlAttribute(href)}">` +
    `<script>window.location.replace(${toInlineScriptString(href)})</script>` +
    '</head><body></body></html>'
  );
}
