/**
 * Lightweight markdown-to-HTML renderer for static legal content.
 *
 * Supports: headings (h1-h6), paragraphs, bold, italic, links, unordered
 * lists, and horizontal rules. Intentionally minimal — it covers the subset
 * of markdown used in the legal content files.
 *
 * Emits class-less semantic HTML; styling is owned by the `.mk-prose` block in
 * the marketing theme. The legal pages and the footer modal both render the
 * output inside `.marketing-theme`, so no per-element classes are needed here.
 *
 * For more complex markdown needs, consider adding `remark` + `remark-html`.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Allow root-relative, fragment, http(s), and mailto URLs only. Anything
 *  else (e.g. `javascript:`) collapses to `#`.
 *
 *  NOTE: the only caller (processInline) has ALREADY run escapeHtml over the
 *  whole text, so `url` arrives HTML-escaped. We must NOT escape again or `&`
 *  in query strings double-encodes to `&amp;amp;`. */
function sanitizeHref(url: string): string {
  const trimmed = url.trim();
  if (/^(\/|#)/.test(trimmed)) return trimmed;
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  return '#';
}

function processInline(text: string): string {
  let result = escapeHtml(text);

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic: *text* only. Single-underscore _text_ is intentionally left
  // literal (not used in the legal content and ambiguous with snake_case).
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // Links: [text](url) — href sanitized.
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, label: string, url: string) => `<a href="${sanitizeHref(url)}">${label}</a>`,
  );

  return result;
}

function isBlankLine(line: string): boolean {
  return line.trim() === '';
}

function isHorizontalRule(line: string): boolean {
  const trimmed = line.trim();
  return /^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed);
}

function isHeading(line: string): boolean {
  return /^#{1,6}\s/.test(line);
}

function isListItem(line: string): boolean {
  return /^- /.test(line);
}

function isSpecialLine(line: string): boolean {
  return isBlankLine(line) || isHorizontalRule(line) || isHeading(line) || isListItem(line);
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.split('\n');
  const htmlParts: string[] = [];
  let inList = false;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (isBlankLine(line)) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      i++;
      continue;
    }

    if (isHorizontalRule(line)) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push('<hr />');
      i++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      const level = (headingMatch[1] ?? '#').length;
      const text = processInline(headingMatch[2] ?? '');
      htmlParts.push(`<h${level}>${text}</h${level}>`);
      i++;
      continue;
    }

    const listMatch = line.match(/^- (.+)$/);
    if (listMatch) {
      if (!inList) {
        htmlParts.push('<ul>');
        inList = true;
      }
      htmlParts.push(`<li>${processInline(listMatch[1] ?? '')}</li>`);
      i++;
      continue;
    }

    if (inList) {
      htmlParts.push('</ul>');
      inList = false;
    }

    const paragraphLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const nextLine = lines[i] ?? '';
      if (isSpecialLine(nextLine)) {
        break;
      }
      paragraphLines.push(nextLine);
      i++;
    }

    const paragraphText = paragraphLines.map((l) => l.trim()).join(' ');
    htmlParts.push(`<p>${processInline(paragraphText)}</p>`);
  }

  if (inList) {
    htmlParts.push('</ul>');
  }

  return htmlParts.join('\n');
}
