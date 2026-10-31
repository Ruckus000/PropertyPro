/**
 * The website editor's Help Center articles describe the editor as it is once
 * Site settings holds the pages, design and notice tools (combined website
 * builder plan, Tasks 27 and 28). `guard:help-content` checks frontmatter and
 * links; nothing checks that the words still match the screen, which is what
 * this file pins for the claims that went stale.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SETTINGS_TABS } from '@/components/pm/site-editor-v3/settings/settings-tabs';

const DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/content/help/manager/website',
);

function article(slug: string): string {
  return readFileSync(path.join(DIR, `${slug}.mdx`), 'utf8');
}

/** The articles that sent a manager to a tool in the rail, or to "Settings". */
const EDITOR_ARTICLES = [
  'website-design',
  'website-branding',
  'website-sections',
  'website-pages',
  'urgent-notice',
  'website-editor-overview',
  'website-domain',
  'website-search',
  'edit-words-and-photos',
] as const;

describe('website editor articles', () => {
  it.each(EDITOR_ARTICLES)('%s does not describe the tool rail', (slug) => {
    expect(article(slug)).not.toMatch(/tool rail|in the rail|\*\*Add\*\* tool/i);
  });

  it.each(EDITOR_ARTICLES)('%s has no fine amount and does not say "compliant"', (slug) => {
    const text = article(slug);
    expect(text).not.toMatch(/\$\d/);
    expect(text).not.toMatch(/\bcompliant\b/i);
  });

  it('website-design sends a manager to the look picker and keeps colours in Site settings', () => {
    const text = article('website-design');
    expect(text).toContain('look picker');
    expect(text).toContain('**Change look**');
    expect(text).toContain('**Publish this look**');
    expect(text).toMatch(/\*\*Site settings\*\*[^.]*\*\*Design\*\* tab/);
    // The old steps: a look chosen from a list in the Design panel.
    expect(text).not.toMatch(/under \*\*Look\*\*/i);
    expect(text).not.toMatch(/Select \*\*Design\*\*/);
  });

  it('website-branding puts colours and logos on the Design tab of Site settings', () => {
    const text = article('website-branding');
    expect(text).toMatch(/\*\*Site settings\*\*[^.]*\*\*Design\*\* tab/);
    expect(text).toContain('**Logos**');
    expect(text).toContain('**Site logo**');
    expect(text).toContain('**Square logo**');
    expect(text).not.toMatch(/\*\*Settings\*\*/);
  });

  it('website-sections says a Payments section can be undone, and names the two new sections', () => {
    const text = article('website-sections');
    // Undo reaches Payments since Task 9; the old sentence excepted it.
    expect(text).not.toMatch(/except for a \*\*Payments\*\*/);
    expect(text).not.toContain('can’t be brought back');
    expect(text).toMatch(/Undo\*\*, and that includes a \*\*Payments\*\* section/);
    expect(text).toContain('**Quick links**');
    expect(text).toContain('**Board members**');
  });

  it('website-editor-overview says where Site settings is, and lists every tab', () => {
    const text = article('website-editor-overview');
    expect(text).toMatch(/Select \*\*Site settings\*\* in the top bar/);
    for (const tab of SETTINGS_TABS) {
      expect(text, `the overview should name the ${tab.label} tab`).toContain(`**${tab.label}**`);
    }
  });

  it('florida-website-rules sends a manager to the Records list and the editor\'s missing-records link', () => {
    const text = article('florida-website-rules');
    // The Documents tool was deleted with the rail.
    expect(text).not.toMatch(/\*\*Documents\*\* tool/);
    expect(text).toContain('**Records** list on your website home');
    expect(text).toMatch(/top bar shows a link with a warning sign and how many records are missing/);
    expect(text).not.toMatch(/\bcompliant\b|\$\d/i);
  });

  it('website-design names the picker\'s Keep my current look', () => {
    expect(article('website-design')).toContain('**Keep my current look**');
    expect(article('website-design')).not.toContain('Keep this look');
  });

  it('the pages, notice, address and search articles open Site settings from the top bar', () => {
    expect(article('website-pages')).toContain('**Site settings** in the top bar');
    expect(article('urgent-notice')).toContain('**Site settings** in the top bar');
    expect(article('website-domain')).toContain('**Site settings** in the top bar');
    expect(article('website-search')).toContain('**Site settings** in the top bar');
  });
});
