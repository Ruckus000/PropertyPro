/**
 * The help-article legal disclaimer.
 *
 * The failure this guards is a slow one: the notice was authored into 8 of 66
 * markdown files, so the 67th article shipped without it and nobody noticed.
 * Injecting from the template is the fix; these tests pin the injection and the
 * statute-aware wording, and — most importantly — assert that both rendering
 * surfaces carry it, since an article reachable through the docs modal is the
 * same article.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-05.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { HelpArticleDisclaimer } from '@/components/help/help-article-disclaimer';

const REPO_ROOT = resolve(__dirname, '../../../..');

describe('HelpArticleDisclaimer', () => {
  it('states plainly that it is not legal advice', () => {
    render(<HelpArticleDisclaimer />);
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument();
  });

  it('names the cited statutes when the article has them', () => {
    // Naming the sections is what stops the notice reading as boilerplate the
    // reader has already learned to skip.
    render(<HelpArticleDisclaimer statutes={['718.111(12)', '718.112(2)(d)']} />);
    expect(screen.getByText(/718\.111\(12\), 718\.112\(2\)\(d\)/)).toBeInTheDocument();
  });

  it('falls back to generic wording with no statutes', () => {
    render(<HelpArticleDisclaimer statutes={[]} />);
    expect(screen.getByText(/Statutes change/i)).toBeInTheDocument();
  });

  it('is a note, not an alert', () => {
    // `role="alert"` is a live region: it would interrupt a screen-reader user
    // on every single article they open.
    render(<HelpArticleDisclaimer />);
    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('disclaimer injection points', () => {
  // Source-level assertions rather than full page renders: both surfaces are
  // deep in auth/MDX machinery, and what actually needs guarding is that
  // neither renders article content without the notice above it.
  it.each([
    ['the /help article route', 'apps/web/src/app/(authenticated)/help/[category]/[slug]/page.tsx'],
    ['the help docs modal', 'apps/web/src/components/help/help-article-body.tsx'],
  ])('%s renders the disclaimer', (_label, path) => {
    const source = readFileSync(resolve(REPO_ROOT, path), 'utf8');
    expect(source).toContain('<HelpArticleDisclaimer');
  });
});
