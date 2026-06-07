# Footer legal modal + homepage-themed legal pages

**Date:** 2026-06-06
**Status:** Design approved, pending spec review

## Problem

Two related issues with the marketing site's legal links:

1. **No modal layer.** The marketing footer's "Terms of Service" / "Privacy
   Policy" links (`apps/web/src/components/marketing/footer.tsx`) are plain
   `<a href="/legal/...">` navigations. A site visitor who clicks them is taken
   off the page. We want a click to open a readable modal with a close button,
   without leaving the page.

2. **Legal pages don't match the homepage.** The legal pages live at
   `apps/web/src/app/legal/` — *outside* the `(marketing)` route group — so they
   never receive the `marketing-theme` wrapper class or the Fraunces font that
   `(marketing)/layout.tsx` applies. They render with plain app design tokens
   (`bg-surface-card`, `text-content`, …) and look nothing like the warm
   "Florida Modern" homepage.

## Decisions (confirmed with user)

- **Keep the standalone `/legal/terms` and `/legal/privacy` pages** (restyled to
  match the homepage) in addition to the modal. Direct URLs, SEO, and the
  signup / SMS-consent / public-home links that point at `/legal/*` keep working.
- **Modal only on the marketing footer** (homepage + transparency). Other legal
  links keep navigating to the (now themed) pages.
- **Single doc per link.** Clicking "Terms of Service" opens Terms; clicking
  "Privacy Policy" opens Privacy. No tabbed switcher.
- **Approach A:** Move `app/legal/*` into the `(marketing)` route group so the
  pages inherit the homepage theme + font with zero duplicated chrome wiring.

## Architecture

### 1. Route move (URLs unchanged)

- Move `apps/web/src/app/legal/terms/page.tsx` →
  `apps/web/src/app/(marketing)/legal/terms/page.tsx`.
- Move `apps/web/src/app/legal/privacy/page.tsx` →
  `apps/web/src/app/(marketing)/legal/privacy/page.tsx`.
- Delete `apps/web/src/app/legal/` (including the old `layout.tsx`).
- Route groups do **not** affect the URL path, so `/legal/terms` and
  `/legal/privacy` are preserved. No sitemap / robots / inbound-link changes
  required.

The pages now nest under `(marketing)/layout.tsx`, inheriting the
`marketing-theme` class and the `--font-fraunces` variable.

### 2. New legal sub-layout

`apps/web/src/app/(marketing)/legal/layout.tsx`:

- Renders `<MarketingNav />` → themed prose container
  (`mk-band` > `mk-wrap` > `article.mk-prose`) → `<MarketingFooter />` for full
  homepage chrome.
- **Re-declares the title template** that the old `app/legal/layout.tsx` had —
  the marketing layout only sets a static title, so without this the legal
  pages lose the `"%s | PropertyPro Florida"` suffix:

  ```ts
  export const metadata: Metadata = {
    title: { template: '%s | PropertyPro Florida', default: 'Legal | PropertyPro Florida' },
    description: 'Legal documents for PropertyPro Florida',
  };
  ```

- The per-page `metadata` exports (`'Terms of Service'`, `'Privacy Policy'`)
  stay as-is and fill the template.

`MarketingNav` uses absolute hrefs (`/#features`, etc. — verified), so its links
work correctly from `/legal/*`.

### 3. Shared content source

New `apps/web/src/lib/legal-content.ts`:

```ts
export type LegalDocKey = 'terms' | 'privacy';

// Synchronous (readFileSync) so callers — including the synchronous
// MarketingFooter render path — can use it without becoming async.
export function getLegalDoc(key: LegalDocKey): string; // returns rendered HTML
export function getLegalDocs(): { terms: string; privacy: string };
```

Reads `src/content/legal/{terms,privacy}.md` and renders with the **marketing**
variant (below). Used by the two legal pages and by the marketing pages that
feed the footer. One source of truth; no duplicated `fs` reads.

### 4. `renderMarkdown` variant + href hardening

Extend `apps/web/src/lib/markdown.ts`:

```ts
export function renderMarkdown(
  markdown: string,
  options?: { variant?: 'app' | 'marketing' },
): string;
```

- **Default `variant: 'app'`** — byte-for-byte the current output. This
  preserves every assertion in `legal-pages.test.tsx`, which calls
  `renderMarkdown(md)` with no options.
- **`variant: 'marketing'`** — emits class-less semantic HTML (`<h2>`, `<p>`,
  `<ul>`, `<li>`, `<a>`, `<hr>`, `<strong>`, `<em>`). The `.mk-prose` wrapper
  owns all styling.
- **Security hardening (both variants):** sanitize link `href` in
  `processInline` — `escapeHtml(url)` plus a scheme allowlist
  (`http:`, `https:`, `mailto:`, root-relative `/…`, fragment `#…`); anything
  else falls back to `#`. Verified this leaves existing test URLs
  (`https://example.com`, `/legal/privacy`) unchanged, so no regression.

### 5. `.mk-prose` styles

One block added to `apps/web/src/app/(marketing)/marketing-theme.css`, scoped
`.marketing-theme .mk-prose …`:

- Headings → Fraunces (`var(--font-fraunces)`), `--mk-ink`, scale matching the
  homepage section heads.
- Body/`<p>` → `--mk-ink` at readable size (≥16px), `--mk-ink-soft` for muted.
- Links → `--mk-coral-d` with hover, underline.
- `<ul>`/`<li>`, `<hr>` via `--mk-line`, `<strong>`/`<em>`.

Serves both the standalone pages and the modal body (same markup, same class).

### 6. Footer modal (the testability-critical part)

**`MarketingFooter` stays synchronous and presentational.** It does **not** read
files or become `async` — `landing-page.test.tsx:184` renders it via
`renderToStaticMarkup(<MarketingFooter />)` (synchronous, no props), and an async
footer would break that test and is unrenderable statically.

```tsx
// footer.tsx — server component, synchronous
export function MarketingFooter({ legalDocs }: { legalDocs?: { terms: string; privacy: string } }) { … }
```

- `legalDocs` is **optional**. The Legal column renders
  `<FooterLegalLinks legalDocs={legalDocs} />`.
- The two server pages that render the footer feed it content:
  - `(marketing)/page.tsx`: `<MarketingFooter legalDocs={getLegalDocs()} />`
  - `(marketing)/transparency/page.tsx`: same.
- When `legalDocs` is absent (e.g. the existing unit test), links render and
  simply navigate — graceful degradation, test stays green untouched.

**`FooterLegalLinks`** (`apps/web/src/components/marketing/footer-legal-links.tsx`,
`'use client'`):

- Always renders the two links as real `<a href="/legal/terms|privacy">` styled
  like the existing footer links (so SEO/no-JS work and the
  `href="/legal/terms"` assertions in `landing-page.test.tsx` pass regardless).
- `onClick`: if `legalDocs` present **and** the click is unmodified
  (no `metaKey`/`ctrlKey`/`shiftKey`/`altKey`, `button === 0`) →
  `preventDefault()` and open the dialog for that doc. Modified / middle clicks
  fall through to real navigation (open-in-new-tab still works).
- Renders a single Radix `Dialog`; state holds which doc is open (`null | 'terms' | 'privacy'`).

**Modal — built from `@radix-ui/react-dialog` primitives** (NOT the shadcn
`dialog.tsx`, which is hardcoded to app tokens `bg-surface-card`/`shadow-e3` and
would look like the app, not the homepage):

- `Dialog.Overlay` + `Dialog.Content` styled with new `mk-` classes
  (`.mk-modal-overlay`, `.mk-modal-content`, `.mk-modal-close`,
  `.mk-modal-title`): cream `--mk-card`, `lg` radius, max-width ~720px,
  `max-height: 85vh` with a scrollable body, Fraunces `Dialog.Title` = doc name,
  body = `<div className="mk-prose" dangerouslySetInnerHTML={{ __html }} />`.
- **Portal gotcha:** `Dialog.Portal` renders to `document.body`, *outside*
  `.marketing-theme`, so `--mk-*` and `--font-fraunces` would not resolve. The
  modal **must portal via `Dialog.Portal container={ref}`** into a node rendered
  by `FooterLegalLinks` (which lives inside the themed subtree), so both the
  marketing vars and the Fraunces font cascade into the modal.
- Radix provides focus-trap, ESC-to-close, scroll-lock, `aria-modal`, and a
  labelled title. Close affordance: a visible `Dialog.Close` "✕" icon button
  with `aria-label="Close"` and a visible focus ring. Overlay click and ESC also
  dismiss. Animations gated behind `prefers-reduced-motion`.
- No "open full page" link inside the modal (per user) — close button only.

### 7. Optional: sitemap

`sitemap.ts` marketing branch (Branch 3) currently lists `/`, `/pricing`,
`/signup`. Optionally add `/legal/terms` and `/legal/privacy` (low priority,
yearly) since they remain real indexable public pages. Robots marketing branch
already allows `/`, so they are crawlable today.

## Trade-offs

- **Inline vs. lazy-fetch modal content.** We inline the rendered legal HTML
  into the marketing pages' payload via props (~26KB raw HTML for both docs,
  ~6–8KB gzipped). Chosen for simplicity (no new API endpoint), no client
  runtime fetch, and no-JS resilience. The alternative — a `/api/legal/[doc]`
  route fetched on modal open — saves payload but adds an endpoint, a loading
  state, and a failure path. The payload cost is marginal on already
  content-heavy marketing pages, so inlining wins.

## Files

**New**
- `apps/web/src/app/(marketing)/legal/layout.tsx`
- `apps/web/src/app/(marketing)/legal/terms/page.tsx` (moved + uses marketing variant)
- `apps/web/src/app/(marketing)/legal/privacy/page.tsx` (moved + uses marketing variant)
- `apps/web/src/lib/legal-content.ts`
- `apps/web/src/components/marketing/footer-legal-links.tsx`

**Modified**
- `apps/web/src/lib/markdown.ts` — `variant` option + href sanitization
- `apps/web/src/app/(marketing)/marketing-theme.css` — `.mk-prose` + `.mk-modal-*`
- `apps/web/src/components/marketing/footer.tsx` — optional `legalDocs` prop + `FooterLegalLinks`
- `apps/web/src/app/(marketing)/page.tsx` — pass `getLegalDocs()` to footer
- `apps/web/src/app/(marketing)/transparency/page.tsx` — pass `getLegalDocs()` to footer
- `apps/web/src/app/sitemap.ts` — (optional) add legal URLs

**Deleted**
- `apps/web/src/app/legal/` (terms, privacy, layout)

## Error handling

`getLegalDocs()` reads files synchronously at server render time; a missing file
throws as it does today (render/build error, surfaced normally). No new
client-side runtime failure path — modal HTML is in the initial payload.

## Testing

- **Unit (`markdown.ts`):** marketing variant emits class-less HTML; `app`
  variant output unchanged (regression guard); href sanitization (safe schemes
  pass through, `javascript:` → `#`).
- **Existing `legal-pages.test.tsx`:** unchanged and green — default variant
  preserved.
- **Existing `landing-page.test.tsx` / `axe-audit.test.tsx`:** unchanged and
  green — footer renders with no props, links + hrefs preserved.
- **Component (`footer-legal-links.test.tsx`):** plain click opens the dialog
  with the correct doc; ESC and close button dismiss; modified-click does NOT
  open the modal (navigation preserved); both links carry correct `href`.
- **Manual / preview:** themed legal pages render correctly; modal opens, traps
  focus, scrolls, and closes; appearance matches the homepage theme.

## Out of scope

- Tabbed Terms/Privacy switcher.
- Modal behavior on non-marketing footers (public-site, public-home).
- Replacing the standalone pages.
