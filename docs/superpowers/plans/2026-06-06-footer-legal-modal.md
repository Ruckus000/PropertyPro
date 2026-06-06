# Footer Legal Modal + Homepage-Themed Legal Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Footer legal links open a themed modal (close button, no navigation), and the standalone `/legal/*` pages are restyled to match the "Florida Modern" homepage.

**Architecture:** Move `app/legal/*` into the `(marketing)` route group so the pages inherit the marketing theme + Fraunces font. Add a `'marketing'` variant to `renderMarkdown` (default behavior unchanged) that emits class-less semantic HTML styled by a new `.mk-prose` block. A shared `getLegalDocs()` reads + renders both docs. The synchronous `MarketingFooter` takes an optional `legalDocs` prop fed by the server pages; a client `FooterLegalLinks` renders the real `<a href>` links but intercepts unmodified clicks to open a Radix Dialog, portaled into the themed subtree.

**Tech Stack:** Next.js 15 App Router, React 19, `@radix-ui/react-dialog`, `lucide-react`, Vitest + Testing Library (jsdom), scoped CSS in `marketing-theme.css`.

**Spec:** `docs/superpowers/specs/2026-06-06-footer-legal-modal-design.md`

---

## File Structure

**New**
- `apps/web/src/lib/legal-content.ts` — sync helpers `getLegalDoc(key)` / `getLegalDocs()` returning marketing-variant HTML.
- `apps/web/src/components/marketing/footer-legal-links.tsx` — client links + Radix Dialog modal.
- `apps/web/src/app/(marketing)/legal/layout.tsx` — nav + themed prose container + footer; title template.
- `apps/web/src/app/(marketing)/legal/terms/page.tsx` — moved, marketing variant.
- `apps/web/src/app/(marketing)/legal/privacy/page.tsx` — moved, marketing variant.
- `apps/web/__tests__/marketing/footer-legal-links.test.tsx` — modal behavior tests.

**Modified**
- `apps/web/src/lib/markdown.ts` — `variant` option + href sanitization.
- `apps/web/src/app/(marketing)/marketing-theme.css` — `.mk-prose` + `.mk-modal-*`.
- `apps/web/src/components/marketing/footer.tsx` — optional `legalDocs` prop, uses `FooterLegalLinks`.
- `apps/web/src/app/(marketing)/page.tsx` — pass `getLegalDocs()` to footer.
- `apps/web/src/app/(marketing)/transparency/page.tsx` — pass `getLegalDocs()` to footer.
- `apps/web/__tests__/legal/legal-pages.test.tsx` — add marketing-variant + sanitization tests.
- `apps/web/src/app/sitemap.ts` — (optional) add legal URLs.

**Deleted**
- `apps/web/src/app/legal/` (terms, privacy, layout).

All commands run from repo root: `/Users/jphilistin/Documents/Coding/PropertyPro/.claude/worktrees/hardcore-shaw-709c28`.

---

## Task 1: `renderMarkdown` variant + href sanitization

**Files:**
- Modify: `apps/web/src/lib/markdown.ts`
- Test: `apps/web/__tests__/legal/legal-pages.test.tsx` (append new describe blocks)

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/__tests__/legal/legal-pages.test.tsx` (after the existing `describe('renderMarkdown', …)` block, before the "Legal content file tests" comment):

```tsx
describe('renderMarkdown — marketing variant', () => {
  it('emits class-less semantic headings', () => {
    const html = renderMarkdown('# H1\n\n## H2', { variant: 'marketing' });
    expect(html).toContain('<h1>H1</h1>');
    expect(html).toContain('<h2>H2</h2>');
    expect(html).not.toContain('class=');
  });

  it('emits class-less paragraphs and links', () => {
    const html = renderMarkdown('See [site](https://example.com).', { variant: 'marketing' });
    expect(html).toContain('<a href="https://example.com">site</a>');
    expect(html).toContain('<p>');
    expect(html).not.toContain('text-content');
  });

  it('emits class-less lists and horizontal rules', () => {
    const html = renderMarkdown('- a\n- b\n\n---', { variant: 'marketing' });
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<hr />');
    expect(html).not.toContain('class=');
  });
});

describe('renderMarkdown — href sanitization', () => {
  it('passes through safe schemes and relative/fragment urls', () => {
    expect(renderMarkdown('[a](https://x.com)')).toContain('href="https://x.com"');
    expect(renderMarkdown('[a](/legal/privacy)')).toContain('href="/legal/privacy"');
    expect(renderMarkdown('[a](mailto:x@y.com)')).toContain('href="mailto:x@y.com"');
    expect(renderMarkdown('[a](#sec)')).toContain('href="#sec"');
  });

  it('neutralizes javascript: urls to #', () => {
    const html = renderMarkdown('[a](javascript:alert(1))');
    expect(html).toContain('href="#"');
    expect(html).not.toContain('javascript:');
  });

  it('leaves the documented app-variant link shape byte-identical', () => {
    const html = renderMarkdown('Visit [our site](https://example.com) now.');
    expect(html).toContain(
      '<a href="https://example.com" class="text-content-link underline hover:text-interactive">our site</a>',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm exec vitest run __tests__/legal/legal-pages.test.tsx`
Expected: the new "marketing variant" / "href sanitization" cases FAIL (marketing output still has classes; `renderMarkdown` rejects the 2nd arg or ignores it). Existing cases still PASS.

- [ ] **Step 3: Rewrite `apps/web/src/lib/markdown.ts`**

Replace the entire file with:

```ts
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
 *  else (e.g. `javascript:`) collapses to `#`. The result is HTML-escaped. */
function sanitizeHref(url: string): string {
  const trimmed = url.trim();
  if (/^(\/|#)/.test(trimmed)) return escapeHtml(trimmed);
  if (/^(https?:|mailto:)/i.test(trimmed)) return escapeHtml(trimmed);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm exec vitest run __tests__/legal/legal-pages.test.tsx`
Expected: ALL tests PASS — the original renderer tests (app variant unchanged) plus the new marketing-variant and sanitization tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/markdown.ts apps/web/__tests__/legal/legal-pages.test.tsx
git commit -m "feat(markdown): add marketing variant + href sanitization to renderMarkdown"
```

---

## Task 2: Shared `legal-content.ts` helper

**Files:**
- Create: `apps/web/src/lib/legal-content.ts`
- Test: `apps/web/__tests__/lib/legal-content.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/__tests__/lib/legal-content.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs so the test is deterministic and independent of cwd.
vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(),
  },
  readFileSync: vi.fn(),
}));

import fs from 'node:fs';
import { getLegalDoc, getLegalDocs } from '@/lib/legal-content';

const readFileSync = fs.readFileSync as unknown as ReturnType<typeof vi.fn>;

describe('legal-content', () => {
  beforeEach(() => {
    readFileSync.mockReset();
    readFileSync.mockImplementation((p: string) =>
      p.includes('terms') ? '# Terms\n\nT body' : '# Privacy\n\nP body',
    );
  });

  it('getLegalDoc renders the requested doc with the marketing variant (class-less)', () => {
    const html = getLegalDoc('terms');
    expect(html).toContain('<h1>Terms</h1>');
    expect(html).toContain('<p>T body</p>');
    expect(html).not.toContain('class=');
  });

  it('getLegalDocs returns both rendered docs', () => {
    const docs = getLegalDocs();
    expect(docs.terms).toContain('<h1>Terms</h1>');
    expect(docs.privacy).toContain('<h1>Privacy</h1>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm exec vitest run __tests__/lib/legal-content.test.ts`
Expected: FAIL — `@/lib/legal-content` does not exist.

- [ ] **Step 3: Create `apps/web/src/lib/legal-content.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import { renderMarkdown } from '@/lib/markdown';

export type LegalDocKey = 'terms' | 'privacy';

/** Reads a legal markdown file and renders it as marketing-themed HTML.
 *  Synchronous so the synchronous MarketingFooter render path can use it. */
function readDoc(key: LegalDocKey): string {
  const filePath = path.join(process.cwd(), 'src', 'content', 'legal', `${key}.md`);
  const markdown = fs.readFileSync(filePath, 'utf-8');
  return renderMarkdown(markdown, { variant: 'marketing' });
}

export function getLegalDoc(key: LegalDocKey): string {
  return readDoc(key);
}

export function getLegalDocs(): { terms: string; privacy: string } {
  return { terms: readDoc('terms'), privacy: readDoc('privacy') };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm exec vitest run __tests__/lib/legal-content.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/legal-content.ts apps/web/__tests__/lib/legal-content.test.ts
git commit -m "feat(legal): add shared getLegalDoc/getLegalDocs helper"
```

---

## Task 3: `.mk-prose` + `.mk-modal-*` styles

**Files:**
- Modify: `apps/web/src/app/(marketing)/marketing-theme.css`

No unit test (CSS); verified via build + preview in Task 8.

- [ ] **Step 1: Append the prose + modal styles**

Append to the END of `apps/web/src/app/(marketing)/marketing-theme.css`:

```css
/* legal prose — themed markdown for /legal pages and the footer modal */
.marketing-theme .mk-prose{color:var(--mk-ink);font-size:16px;line-height:1.7;max-width:46em}
.marketing-theme .mk-prose h1{font-family:var(--font-fraunces),Georgia,serif;font-weight:600;font-size:40px;letter-spacing:-.01em;line-height:1.1;color:var(--mk-ink);margin:0 0 18px}
.marketing-theme .mk-prose h2{font-family:var(--font-fraunces),Georgia,serif;font-weight:600;font-size:27px;color:var(--mk-ink);margin:34px 0 12px}
.marketing-theme .mk-prose h3{font-family:var(--font-fraunces),Georgia,serif;font-weight:600;font-size:21px;color:var(--mk-ink);margin:26px 0 10px}
.marketing-theme .mk-prose h4,.marketing-theme .mk-prose h5,.marketing-theme .mk-prose h6{font-weight:700;font-size:16px;color:var(--mk-ink);margin:20px 0 8px}
.marketing-theme .mk-prose p{margin:0 0 16px;color:var(--mk-ink-soft)}
.marketing-theme .mk-prose a{color:var(--mk-coral-d);text-decoration:underline;text-underline-offset:2px}
.marketing-theme .mk-prose a:hover{color:var(--mk-coral)}
.marketing-theme .mk-prose strong{color:var(--mk-ink);font-weight:700}
.marketing-theme .mk-prose ul{margin:0 0 16px;padding-left:1.4em;list-style:disc;color:var(--mk-ink-soft)}
.marketing-theme .mk-prose li{margin:6px 0}
.marketing-theme .mk-prose hr{border:none;border-top:1px solid var(--mk-line);margin:32px 0}

/* legal modal — Radix dialog styled to the marketing theme */
.marketing-theme .mk-modal-overlay{position:fixed;inset:0;z-index:80;background:rgba(36,23,18,.55)}
.marketing-theme .mk-modal-content{position:fixed;z-index:81;left:50%;top:50%;transform:translate(-50%,-50%);width:min(720px,calc(100vw - 32px));max-height:85vh;display:flex;flex-direction:column;background:var(--mk-card);border:1px solid var(--mk-line);border-radius:16px;box-shadow:var(--mk-shadow);overflow:hidden}
.marketing-theme .mk-modal-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 24px;border-bottom:1px solid var(--mk-line)}
.marketing-theme .mk-modal-title{font-family:var(--font-fraunces),Georgia,serif;font-weight:600;font-size:22px;color:var(--mk-ink);margin:0}
.marketing-theme .mk-modal-close{flex:0 0 auto;display:grid;place-items:center;width:36px;height:36px;border-radius:10px;border:1px solid var(--mk-line);background:#fff;color:var(--mk-ink);cursor:pointer}
.marketing-theme .mk-modal-close:hover{border-color:var(--mk-coral);color:var(--mk-coral-d)}
.marketing-theme .mk-modal-close svg{width:18px;height:18px}
.marketing-theme .mk-modal-body{padding:22px 24px;overflow-y:auto}
.marketing-theme .mk-modal-body.mk-prose h1{font-size:30px;margin-top:0}

@media(prefers-reduced-motion:no-preference){
  .marketing-theme .mk-modal-overlay[data-state=open]{animation:mk-fade-in .18s ease}
  .marketing-theme .mk-modal-content[data-state=open]{animation:mk-modal-in .2s ease}
}
@keyframes mk-fade-in{from{opacity:0}to{opacity:1}}
@keyframes mk-modal-in{from{opacity:0;transform:translate(-50%,-48%) scale(.98)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
```

- [ ] **Step 2: Verify the file is valid CSS (no build break)**

Run: `cd apps/web && pnpm exec tsc --noEmit` (sanity that nothing else broke; CSS itself is validated in the Task 8 build)
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(marketing)/marketing-theme.css"
git commit -m "feat(marketing): add .mk-prose and .mk-modal styles for legal content"
```

---

## Task 4: Move legal pages into the `(marketing)` group + new layout

**Files:**
- Create: `apps/web/src/app/(marketing)/legal/layout.tsx`
- Create: `apps/web/src/app/(marketing)/legal/terms/page.tsx`
- Create: `apps/web/src/app/(marketing)/legal/privacy/page.tsx`
- Delete: `apps/web/src/app/legal/` (terms, privacy, layout)

> Note: `footer.tsx` does not yet accept `legalDocs` until Task 6. To keep this
> task's intermediate state type-clean, the new legal layout passes the prop;
> add it to the footer signature here as the minimal change, OR sequence Task 6
> before this task. This plan adds the prop in Task 6 and the layout in Task 4,
> so run Task 6 **before** Task 4 if executing strictly by typecheck-green
> increments. (Subagent-driven execution: do Task 6 then Task 4.)

- [ ] **Step 1: Create the new legal layout**

Create `apps/web/src/app/(marketing)/legal/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/footer';
import { getLegalDocs } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: {
    template: '%s | PropertyPro Florida',
    default: 'Legal | PropertyPro Florida',
  },
  description: 'Legal documents for PropertyPro Florida',
};

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MarketingNav />
      <main id="main-content" className="mk-band">
        <div className="mk-wrap">
          <article className="mk-prose">{children}</article>
        </div>
      </main>
      <MarketingFooter legalDocs={getLegalDocs()} />
    </>
  );
}
```

- [ ] **Step 2: Create the Terms page**

Create `apps/web/src/app/(marketing)/legal/terms/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { getLegalDoc } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Terms of Service for PropertyPro Florida — compliance and community management platform for Florida condominium associations.',
};

export default function TermsPage() {
  return <div dangerouslySetInnerHTML={{ __html: getLegalDoc('terms') }} />;
}
```

- [ ] **Step 3: Create the Privacy page**

Create `apps/web/src/app/(marketing)/legal/privacy/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { getLegalDoc } from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Privacy Policy for PropertyPro Florida — how we collect, use, and protect your personal information.',
};

export default function PrivacyPage() {
  return <div dangerouslySetInnerHTML={{ __html: getLegalDoc('privacy') }} />;
}
```

- [ ] **Step 4: Delete the old legal route tree**

```bash
git rm apps/web/src/app/legal/layout.tsx apps/web/src/app/legal/terms/page.tsx apps/web/src/app/legal/privacy/page.tsx
```

Expected: the directory `apps/web/src/app/legal/` is now empty/removed.

- [ ] **Step 5: Verify typecheck + the existing legal content tests still pass**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Run: `cd apps/web && pnpm exec vitest run __tests__/legal/legal-pages.test.tsx`
Expected: typecheck PASS; legal-pages tests PASS (they import `renderMarkdown` directly — the route move doesn't affect them; `href="/legal/privacy"` cross-link assertions still hold since URLs are unchanged).

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/(marketing)/legal"
git commit -m "feat(legal): move legal pages into marketing group with themed layout"
```

---

## Task 5: `FooterLegalLinks` client component + modal

**Files:**
- Create: `apps/web/src/components/marketing/footer-legal-links.tsx`
- Test: `apps/web/__tests__/marketing/footer-legal-links.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/__tests__/marketing/footer-legal-links.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FooterLegalLinks } from '@/components/marketing/footer-legal-links';

const legalDocs = {
  terms: '<h1>Terms Heading</h1><p>terms body</p>',
  privacy: '<h1>Privacy Heading</h1><p>privacy body</p>',
};

describe('FooterLegalLinks', () => {
  it('renders both legal links with correct hrefs', () => {
    render(<FooterLegalLinks legalDocs={legalDocs} />);
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/legal/terms',
    );
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/legal/privacy',
    );
  });

  it('opens the modal with Terms content on a plain click', () => {
    render(<FooterLegalLinks legalDocs={legalDocs} />);
    fireEvent.click(screen.getByRole('link', { name: 'Terms of Service' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Terms Heading');
    expect(dialog).toHaveTextContent('terms body');
  });

  it('opens Privacy content when the Privacy link is clicked', () => {
    render(<FooterLegalLinks legalDocs={legalDocs} />);
    fireEvent.click(screen.getByRole('link', { name: 'Privacy Policy' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Privacy Heading');
  });

  it('does NOT open the modal on a modified (ctrl) click', () => {
    render(<FooterLegalLinks legalDocs={legalDocs} />);
    fireEvent.click(screen.getByRole('link', { name: 'Terms of Service' }), { ctrlKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes the modal via the close button', async () => {
    const user = userEvent.setup();
    render(<FooterLegalLinks legalDocs={legalDocs} />);
    fireEvent.click(screen.getByRole('link', { name: 'Terms of Service' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('falls through to navigation (no modal) when legalDocs is undefined', () => {
    render(<FooterLegalLinks />);
    fireEvent.click(screen.getByRole('link', { name: 'Terms of Service' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm exec vitest run __tests__/marketing/footer-legal-links.test.tsx`
Expected: FAIL — `@/components/marketing/footer-legal-links` does not exist.

- [ ] **Step 3: Create the component**

Create `apps/web/src/components/marketing/footer-legal-links.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

type DocKey = 'terms' | 'privacy';

const DOC_TITLES: Record<DocKey, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
};

const DOC_HREFS: Record<DocKey, string> = {
  terms: '/legal/terms',
  privacy: '/legal/privacy',
};

export interface FooterLegalLinksProps {
  legalDocs?: { terms: string; privacy: string };
}

export function FooterLegalLinks({ legalDocs }: FooterLegalLinksProps) {
  const [openDoc, setOpenDoc] = useState<DocKey | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>, doc: DocKey) {
    // No content available (e.g. no-JS fallback / no props) → allow navigation.
    if (!legalDocs) return;
    // Honor modified clicks (open in new tab/window) and non-primary buttons.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    setOpenDoc(doc);
  }

  const bodyHtml = openDoc && legalDocs ? legalDocs[openDoc] : '';

  return (
    <div ref={containerRef}>
      <a href={DOC_HREFS.terms} onClick={(e) => handleClick(e, 'terms')}>
        Terms of Service
      </a>
      <a href={DOC_HREFS.privacy} onClick={(e) => handleClick(e, 'privacy')}>
        Privacy Policy
      </a>

      <Dialog.Root open={openDoc !== null} onOpenChange={(open) => !open && setOpenDoc(null)}>
        <Dialog.Portal container={containerRef.current ?? undefined}>
          <Dialog.Overlay className="mk-modal-overlay" />
          <Dialog.Content className="mk-modal-content" aria-describedby={undefined}>
            <div className="mk-modal-head">
              <Dialog.Title className="mk-modal-title">
                {openDoc ? DOC_TITLES[openDoc] : ''}
              </Dialog.Title>
              <Dialog.Close className="mk-modal-close" aria-label="Close">
                <X aria-hidden="true" />
              </Dialog.Close>
            </div>
            <div
              className="mk-modal-body mk-prose"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm exec vitest run __tests__/marketing/footer-legal-links.test.tsx`
Expected: PASS (all 6 cases). The "dialog" role is provided by Radix `Dialog.Content`; the close button is found by its `aria-label="Close"`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/marketing/footer-legal-links.tsx apps/web/__tests__/marketing/footer-legal-links.test.tsx
git commit -m "feat(marketing): add FooterLegalLinks client modal for legal docs"
```

---

## Task 6: Wire footer prop + feed content from pages

> Execute this BEFORE Task 4 if running strictly typecheck-green (the legal
> layout created in Task 4 references the `legalDocs` prop added here).

**Files:**
- Modify: `apps/web/src/components/marketing/footer.tsx`
- Modify: `apps/web/src/app/(marketing)/page.tsx`
- Modify: `apps/web/src/app/(marketing)/transparency/page.tsx`

- [ ] **Step 1: Update `footer.tsx` to accept the optional prop and render `FooterLegalLinks`**

In `apps/web/src/components/marketing/footer.tsx`:

Add the import at the top (after `import React from 'react';`):

```tsx
import { FooterLegalLinks } from './footer-legal-links';
```

Change the function signature:

```tsx
export function MarketingFooter({
  legalDocs,
}: {
  legalDocs?: { terms: string; privacy: string };
} = {}) {
```

Replace the Legal column block:

```tsx
          <div>
            <h5>Legal</h5>
            <a href="/legal/terms">Terms of Service</a>
            <a href="/legal/privacy">Privacy Policy</a>
          </div>
```

with:

```tsx
          <div>
            <h5>Legal</h5>
            <FooterLegalLinks legalDocs={legalDocs} />
          </div>
```

- [ ] **Step 2: Verify the existing footer tests still pass (no-props path)**

Run: `cd apps/web && pnpm exec vitest run __tests__/marketing/landing-page.test.tsx __tests__/accessibility/axe-audit.test.tsx`
Expected: PASS. `renderToStaticMarkup(<MarketingFooter />)` still renders the two `<a href="/legal/terms">` / `href="/legal/privacy">` anchors (the Radix dialog renders nothing while closed), and the footer remains synchronous.

- [ ] **Step 3: Feed content from the homepage**

In `apps/web/src/app/(marketing)/page.tsx`:

Add the import:

```tsx
import { getLegalDocs } from '@/lib/legal-content';
```

Change `<MarketingFooter />` to:

```tsx
      <MarketingFooter legalDocs={getLegalDocs()} />
```

- [ ] **Step 4: Feed content from the transparency page**

In `apps/web/src/app/(marketing)/transparency/page.tsx`:

Add the import:

```tsx
import { getLegalDocs } from '@/lib/legal-content';
```

Change `<MarketingFooter />` to:

```tsx
      <MarketingFooter legalDocs={getLegalDocs()} />
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/marketing/footer.tsx "apps/web/src/app/(marketing)/page.tsx" "apps/web/src/app/(marketing)/transparency/page.tsx"
git commit -m "feat(marketing): feed legal docs into footer for modal rendering"
```

---

## Task 7: (Optional) Add legal URLs to the marketing sitemap

**Files:**
- Modify: `apps/web/src/app/sitemap.ts`

- [ ] **Step 1: Add legal entries to the marketing root branch**

In `apps/web/src/app/sitemap.ts`, in "Branch 3: Marketing root", extend the returned array:

```ts
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/legal/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/legal/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/sitemap.ts
git commit -m "chore(seo): list legal pages in marketing sitemap"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `cd apps/web && pnpm exec vitest run`
Expected: PASS (no regressions; new legal-content, footer-legal-links, and markdown variant tests green).

- [ ] **Step 2: Typecheck the workspace**

Run: `pnpm typecheck`
Expected: PASS. (If the turbo cache reports a stale green, re-run with `cd apps/web && pnpm exec tsc --noEmit` to confirm directly.)

- [ ] **Step 3: Lint (includes DB access guard)**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 4: Production build (validates CSS + route move + RSC boundaries)**

Run: `pnpm --filter @propertypro/web build`
Expected: PASS. Confirms `/legal/terms` and `/legal/privacy` still resolve under the `(marketing)` group and the new client component compiles.

- [ ] **Step 5: Manual preview verification**

Start the dev server and verify visually:

1. `preview_start("web")`
2. `preview_eval: window.location.href = '/'`
3. Scroll to footer; `preview_click` the "Terms of Service" link → modal opens, themed (cream card, Fraunces title), content scrolls, close button works (also ESC + overlay click).
4. `preview_eval: window.location.href = '/legal/terms'` → page renders with marketing nav, themed prose, marketing footer.
5. `preview_console_logs` → no errors (in particular, no Radix "missing Description"/portal warnings, no React hydration warnings).
6. `preview_screenshot` of both the open modal and the standalone themed page as proof.

- [ ] **Step 6: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "test(legal): verify footer modal + themed legal pages"
```

---

## Self-Review Notes

- **Spec coverage:** route move (T4), themed layout + title template (T4), shared content helper (T2), `renderMarkdown` variant + href sanitization (T1), `.mk-prose`/`.mk-modal` CSS (T3), synchronous footer + optional prop fed by pages (T6), `FooterLegalLinks` Radix modal with container portal + progressive-enhancement click handling (T5), optional sitemap (T7), test preservation + new tests (T1/T5/T6), full verification incl. build + preview (T8). All spec sections map to a task.
- **Type consistency:** `legalDocs?: { terms: string; privacy: string }` is identical across `footer.tsx`, `FooterLegalLinks`, and `getLegalDocs()`. `LegalDocKey` / `DocKey` are local-but-structurally-identical `'terms' | 'privacy'` unions (separate scopes, no cross-import needed).
- **Ordering caveat:** Task 6 (footer prop) must precede Task 4 (legal layout uses the prop) for strictly typecheck-green increments — noted at the top of both tasks.
