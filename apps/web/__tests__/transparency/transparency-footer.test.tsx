/**
 * The transparency page footer carries the same policy links as every
 * association site footer (audit 2026-11-05, L-1 and L-2): a public page an
 * owner or a visitor can reach without signing in.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransparencyFooter } from '@/components/transparency/transparency-footer';

describe('TransparencyFooter', () => {
  it.each([
    ['Accessibility', 'https://getpropertypro.com/legal/accessibility'],
    ['Privacy', 'https://getpropertypro.com/legal/privacy'],
  ])('links to the %s policy in a new tab with a safe rel', (name, href) => {
    render(<TransparencyFooter communityType="condo_718" generatedAt="2026-11-23T12:00:00.000Z" />);

    const link = screen.getByRole('link', { name });
    expect(link).toHaveAttribute('href', href);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });
});
