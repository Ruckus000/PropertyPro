/**
 * Print template — wraps editor-emitted HTML in a self-contained, print-ready
 * document. The output is fed to Chromium for HTML→PDF rendering.
 *
 * Strict rules:
 *   - No external CSS or JS (everything inline).
 *   - System font stack only (no @font-face, no Google Fonts) to avoid
 *     Chromium font-loading flakiness on Vercel.
 *   - All <img> URLs in the body should already be Supabase Storage URLs
 *     (the editor's image upload + sanitizer enforce this).
 *   - The HTML passed in is ALREADY sanitized; this helper only wraps.
 */

export interface AuthoredDocumentTemplateInput {
  /** Sanitized body HTML produced by the editor. */
  bodyHtml: string;
  /** Document title shown in the header / cover sheet. */
  title: string;
  /** Community display name for the header / cover sheet. */
  communityName: string;
  /** Public URL for the community logo (or null if absent). */
  communityLogoUrl: string | null;
  /** Author display name for the cover sheet. */
  authorName: string | null;
  /** Document publish timestamp (ISO string) for footer + cover sheet. */
  generatedAt: Date;
  /** Cover sheet toggle. */
  coverSheetEnabled: boolean;
  /** Letterhead toggles: header and/or footer chrome. */
  letterhead: {
    header?: boolean;
    footer?: boolean;
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDateTime(d: Date): string {
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function renderHeader(input: AuthoredDocumentTemplateInput): string {
  if (input.letterhead.header === false) return '';
  const logo = input.communityLogoUrl
    ? `<img src="${escapeHtml(input.communityLogoUrl)}" alt="" />`
    : '';
  return `
    <header class="pp-header">
      <div class="pp-header-inner">
        ${logo}
        <span class="pp-header-name">${escapeHtml(input.communityName)}</span>
      </div>
    </header>
  `;
}

function renderFooter(input: AuthoredDocumentTemplateInput): string {
  if (input.letterhead.footer === false) return '';
  const ts = escapeHtml(formatDateTime(input.generatedAt));
  return `
    <footer class="pp-footer">
      <span class="pp-footer-left">${escapeHtml(input.communityName)}</span>
      <span class="pp-footer-right">Generated ${ts}</span>
    </footer>
  `;
}

function renderCoverSheet(input: AuthoredDocumentTemplateInput): string {
  if (!input.coverSheetEnabled) return '';
  const author = input.authorName ? `Prepared by ${escapeHtml(input.authorName)}` : '';
  return `
    <section class="pp-cover">
      <h1 class="pp-cover-title">${escapeHtml(input.title)}</h1>
      <p class="pp-cover-community">${escapeHtml(input.communityName)}</p>
      <p class="pp-cover-date">${escapeHtml(formatDate(input.generatedAt))}</p>
      ${author ? `<p class="pp-cover-author">${author}</p>` : ''}
    </section>
    <div class="pp-page-break"></div>
  `;
}

const STYLE = `
  @page { size: A4; margin: 1in; }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    color: #111827;
    background: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 12pt;
    line-height: 1.55;
  }

  body { padding: 0; }

  h1, h2, h3, h4, h5, h6 {
    color: #0f172a;
    margin: 1.2em 0 0.5em;
    line-height: 1.3;
    page-break-after: avoid;
  }
  h1 { font-size: 22pt; }
  h2 { font-size: 16pt; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25em; }
  h3 { font-size: 13pt; }
  h4 { font-size: 12pt; }

  p { margin: 0 0 0.7em; }

  a {
    color: #1d4ed8;
    text-decoration: underline;
  }

  ul, ol {
    margin: 0 0 0.7em 1.4em;
    padding: 0;
  }
  li { margin: 0.15em 0; }

  blockquote.editor-blockquote, blockquote {
    margin: 0.7em 0;
    padding: 0.4em 1em;
    border-left: 3px solid #cbd5e1;
    background: #f8fafc;
    color: #334155;
    page-break-inside: avoid;
  }

  code {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    background: #f1f5f9;
    padding: 0 4px;
    border-radius: 3px;
    font-size: 0.95em;
  }
  pre.editor-code-block, pre {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    background: #f1f5f9;
    color: #0f172a;
    padding: 0.7em 1em;
    border-radius: 4px;
    font-size: 10.5pt;
    line-height: 1.45;
    overflow-wrap: anywhere;
    page-break-inside: avoid;
  }
  pre code { background: transparent; padding: 0; }

  img.editor-image, img {
    max-width: 100%;
    height: auto;
    page-break-inside: avoid;
  }

  table.editor-table, table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.7em 0;
    page-break-inside: avoid;
    font-size: 11pt;
  }
  table th, table td {
    border: 1px solid #cbd5e1;
    padding: 6pt 8pt;
    vertical-align: top;
  }
  table th {
    background: #f1f5f9;
    text-align: left;
    font-weight: 600;
  }

  a.editor-document-link {
    display: inline-block;
    padding: 2pt 8pt;
    margin: 0 2pt;
    background: #f1f5f9;
    border: 1px solid #cbd5e1;
    border-radius: 12pt;
    color: #0f172a;
    text-decoration: none;
    font-size: 10.5pt;
  }

  /* Editor alignment is expressed via data-text-align (see sanitizer) */
  [data-text-align="left"]   { text-align: left; }
  [data-text-align="center"] { text-align: center; }
  [data-text-align="right"]  { text-align: right; }
  [data-text-align="justify"]{ text-align: justify; }

  .pp-header {
    width: 100%;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 8pt;
    margin-bottom: 18pt;
  }
  .pp-header-inner {
    display: flex;
    align-items: center;
    gap: 12pt;
  }
  .pp-header img {
    max-height: 32pt;
    max-width: 140pt;
  }
  .pp-header-name {
    font-size: 12pt;
    color: #475569;
    letter-spacing: 0.02em;
  }

  .pp-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 8pt 0;
    border-top: 1px solid #e5e7eb;
    color: #64748b;
    font-size: 9pt;
    display: flex;
    justify-content: space-between;
  }

  .pp-cover {
    text-align: center;
    padding: 100pt 0 40pt;
  }
  .pp-cover-title {
    font-size: 28pt;
    border: none;
    margin: 0 0 24pt;
  }
  .pp-cover-community {
    font-size: 14pt;
    color: #475569;
    margin: 0 0 8pt;
  }
  .pp-cover-date {
    font-size: 12pt;
    color: #64748b;
    margin: 0 0 24pt;
  }
  .pp-cover-author {
    font-size: 11pt;
    color: #64748b;
    margin: 0;
  }
  .pp-page-break {
    page-break-after: always;
  }
`;

/**
 * Wrap the editor's sanitized HTML in a print-ready, self-contained shell.
 * The result is what's fed to renderHtmlToPdf().
 */
export function renderAuthoredHtml(input: AuthoredDocumentTemplateInput): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.title)}</title>
  <style>${STYLE}</style>
</head>
<body>
  ${renderHeader(input)}
  ${renderCoverSheet(input)}
  <main class="pp-body">
    ${input.bodyHtml}
  </main>
  ${renderFooter(input)}
</body>
</html>`;
}
