/**
 * Shared controls meet the touch-target rule in `.claude/rules/design.md`:
 * 44px below `md`, and the desktop size (32px floor) from `md` up.
 *
 * Measured at 375px in the 2026-11-03 Geist audit: QuickFilterTabs 32px at every
 * width, the AlertBanner dismiss 20px (under AA's 24px), the Documents category
 * chips 36px. One class each covers every call site of these components.
 *
 * JSDOM runs neither layout nor Tailwind, so this pins the class contract, as
 * `close-button-hit-area.test.tsx` does.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

vi.mock('@/hooks/use-document-categories', () => ({
  useDocumentCategories: () => ({
    categories: [{ id: 1, name: 'Bylaws' }],
    isLoading: false,
  }),
}));

import { DocumentCategoryFilter } from '@/components/documents/document-category-filter';

afterEach(cleanup);

function tokens(el: HTMLElement): string[] {
  return (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

describe('shared controls carry a 44px touch floor below md', () => {
  it('QuickFilterTabs tabs are 44px below md and 32px from md', () => {
    render(
      <QuickFilterTabs
        tabs={[{ value: 'all', label: 'All' }]}
        active="all"
        onChange={() => {}}
      />,
    );
    const t = tokens(screen.getByRole('button', { name: 'All' }));
    expect(t).toContain('h-11');
    expect(t).toContain('md:h-8');
  });

  it('TabsTrigger has a 44px minimum below md', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    const t = tokens(screen.getByRole('tab', { name: 'A' }));
    expect(t).toContain('min-h-11');
    expect(t).toContain('md:min-h-0');
  });

  it('AlertBanner dismiss is 44px below md and 32px from md, without moving the banner', () => {
    render(<AlertBanner status="info" title="Heads up" dismissible onDismiss={() => {}} />);
    const t = tokens(screen.getByRole('button', { name: 'Dismiss' }));
    // 16px icon + 2 * 14px padding = 44; md: 16 + 2 * 8 = 32.
    expect(t).toContain('p-3.5');
    expect(t).toContain('md:p-2');
    // Negative margins hold the layout box at the old 20px.
    expect(t).toContain('-m-3');
    expect(t).toContain('md:-m-1.5');
  });

  it('Documents category chips have a 44px minimum below md', () => {
    render(
      <DocumentCategoryFilter communityId={1} selectedCategoryId={null} onCategoryChange={() => {}} />,
    );
    for (const name of ['All', 'Bylaws']) {
      const t = tokens(screen.getByRole('button', { name }));
      expect(t, name).toContain('min-h-11');
      expect(t, name).toContain('md:min-h-0');
    }
  });
});
