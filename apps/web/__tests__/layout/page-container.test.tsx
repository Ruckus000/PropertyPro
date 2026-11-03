/**
 * PageContainer is the single source of the authenticated page gutter and
 * width (`guard:page-padding` forbids pages from re-adding either).
 * These pin the Geist-density values.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PAGE_GUTTER_X, PageContainer } from '@/components/layout/page-container';

describe('PageContainer', () => {
  it('uses the 16/24 gutter', () => {
    expect(PAGE_GUTTER_X).toBe('px-4 sm:px-6');
  });

  it('renders the tight top padding, the fluid 1600px cap and the gutter', () => {
    const { container } = render(<PageContainer>content</PageContainer>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.classList.contains('py-5')).toBe(true);
    expect(root.classList.contains('max-w-[1600px]')).toBe(true);
    for (const cls of PAGE_GUTTER_X.split(' ')) {
      expect(root.classList.contains(cls)).toBe(true);
    }
    expect(root.classList.contains('py-8')).toBe(false);
    expect(root.classList.contains('max-w-[1400px]')).toBe(false);
  });
});
