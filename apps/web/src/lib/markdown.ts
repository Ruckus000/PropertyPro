/**
 * Lightweight markdown-to-HTML renderer for static legal content.
 *
 * Supports: headings (h1-h6), paragraphs, bold, links, unordered lists,
 * horizontal rules, and inline code. This is intentionally minimal --
 * it covers the subset of markdown used in the legal content files.
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

function processInline(text: string): string {
  let result = escapeHtml(text);

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_ (but not inside bold)
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // Links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-content-link underline hover:text-interactive">$1</a>',
  );

  return result;
}

const HEADING_STYLES: Record<number, string> = {
  1: 'text-3xl font-semibold text-content mt-8 mb-4',
  2: 'text-2xl font-semibold text-content mt-8 mb-3',
  3: 'text-xl font-medium text-content mt-6 mb-2',
  4: 'text-lg font-medium text-content mt-4 mb-2',
  5: 'text-base font-medium text-content-secondary mt-4 mb-1',
  6: 'text-sm font-medium text-content-secondary mt-4 mb-1',
};

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

    // Blank line
    if (isBlankLine(line)) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      i++;
      continue;
    }

    // Horizontal rule: --- or ***
    if (isHorizontalRule(line)) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push('<hr class="my-8 border-edge" />');
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      const level = (headingMatch[1] ?? '#').length;
      const text = processInline(headingMatch[2] ?? '');
      const style = HEADING_STYLES[level] ?? 'text-3xl font-semibold text-content mt-8 mb-4';
      htmlParts.push(`<h${level} class="${style}">${text}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list items: - item
    const listMatch = line.match(/^- (.+)$/);
    if (listMatch) {
      if (!inList) {
        htmlParts.push('<ul class="list-disc pl-8 my-4 space-y-2 text-content-secondary">');
        inList = true;
      }
      htmlParts.push(`<li>${processInline(listMatch[1] ?? '')}</li>`);
      i++;
      continue;
    }

    // Paragraph: collect consecutive non-blank, non-special lines
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
      `<p class="my-4 text-content-secondary leading-relaxed">${processInline(paragraphText)}</p>`,
    );
  }

  if (inList) {
    htmlParts.push('</ul>');
  }

  return htmlParts.join('\n');
}
