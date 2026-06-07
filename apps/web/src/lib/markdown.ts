/**
 * Lightweight markdown-to-HTML renderer for static legal content.
 *
 * Supports: headings (h1-h6), paragraphs, bold, italic, links, unordered
 * lists, and horizontal rules. Intentionally minimal — it covers the subset
 * of markdown used in the legal content files.
 *
 * Two output variants:
 *  - 'app' (default): Tailwind app-token classes (unchanged legacy output).
 *  - 'marketing': class-less semantic HTML, styled by the `.mk-prose` block
 *    in the marketing theme.
 *
 * For more complex markdown needs, consider adding `remark` + `remark-html`.
 */

type MarkdownVariant = 'app' | 'marketing';

interface RenderMarkdownOptions {
  variant?: MarkdownVariant;
}

interface VariantClasses {
  heading: Record<number, string>;
  hr: string;
  ul: string;
  paragraph: string;
  link: string;
}

const APP_CLASSES: VariantClasses = {
  heading: {
    1: 'text-3xl font-semibold text-content mt-8 mb-4',
    2: 'text-2xl font-semibold text-content mt-8 mb-3',
    3: 'text-xl font-medium text-content mt-6 mb-2',
    4: 'text-lg font-medium text-content mt-4 mb-2',
    5: 'text-base font-medium text-content-secondary mt-4 mb-1',
    6: 'text-sm font-medium text-content-secondary mt-4 mb-1',
  },
  hr: 'my-8 border-edge',
  ul: 'list-disc pl-8 my-4 space-y-2 text-content-secondary',
  paragraph: 'my-4 text-content-secondary leading-relaxed',
  link: 'text-content-link underline hover:text-interactive',
};

const MARKETING_CLASSES: VariantClasses = {
  heading: { 1: '', 2: '', 3: '', 4: '', 5: '', 6: '' },
  hr: '',
  ul: '',
  paragraph: '',
  link: '',
};

function classesFor(variant: MarkdownVariant): VariantClasses {
  return variant === 'marketing' ? MARKETING_CLASSES : APP_CLASSES;
}

function classAttr(cls: string): string {
  return cls ? ` class="${cls}"` : '';
}

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

function processInline(text: string, linkClass: string): string {
  let result = escapeHtml(text);

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_ (but not inside bold)
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // Links: [text](url) — href sanitized, variant-specific class.
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, label: string, url: string) =>
      `<a href="${sanitizeHref(url)}"${classAttr(linkClass)}>${label}</a>`,
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

export function renderMarkdown(markdown: string, options?: RenderMarkdownOptions): string {
  const variant: MarkdownVariant = options?.variant ?? 'app';
  const classes = classesFor(variant);

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
      htmlParts.push(`<hr${classAttr(classes.hr)} />`);
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
      const text = processInline(headingMatch[2] ?? '', classes.link);
      const headingClass = classes.heading[level] ?? classes.heading[1] ?? '';
      htmlParts.push(`<h${level}${classAttr(headingClass)}>${text}</h${level}>`);
      i++;
      continue;
    }

    const listMatch = line.match(/^- (.+)$/);
    if (listMatch) {
      if (!inList) {
        htmlParts.push(`<ul${classAttr(classes.ul)}>`);
        inList = true;
      }
      htmlParts.push(`<li>${processInline(listMatch[1] ?? '', classes.link)}</li>`);
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
    htmlParts.push(
      `<p${classAttr(classes.paragraph)}>${processInline(paragraphText, classes.link)}</p>`,
    );
  }

  if (inList) {
    htmlParts.push('</ul>');
  }

  return htmlParts.join('\n');
}
