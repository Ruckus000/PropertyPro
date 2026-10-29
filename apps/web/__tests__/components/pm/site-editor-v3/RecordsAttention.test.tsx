/**
 * The editor top bar's missing-records link (combined plan Task 28): the
 * sidebar badge's count, from the same query, linking to the records list on
 * the website home.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const alert = vi.hoisted(() => ({
  data: undefined as { missingCount: number; snoozedUntil: string | null } | undefined,
  calls: [] as unknown[][],
}));
vi.mock('@/hooks/use-records-alert', () => ({
  useRecordsAlert: (...args: unknown[]) => {
    alert.calls.push(args);
    return { data: alert.data, snooze: { mutate: vi.fn(), isPending: false } };
  },
}));

import { RecordsAttention } from '@/components/pm/site-editor-v3/RecordsAttention';

beforeEach(() => {
  alert.data = undefined;
  alert.calls = [];
});

describe('RecordsAttention — the top bar link', () => {
  // Revert check: drop the `#records` from the href, or the `missing records`
  // words from the label.
  it('links to the records on the website home, named "3 missing records"', () => {
    alert.data = { missingCount: 3, snoozedUntil: null };
    render(<RecordsAttention communityId={42} enabled />);

    const link = screen.getByRole('link', { name: '3 missing records' });
    expect(link).toHaveAttribute('href', '/pm/website?communityId=42#records');
    // Not colour alone: an icon, the number and the words.
    expect(link.querySelector('svg')).not.toBeNull();
    expect(link).toHaveTextContent('3');
    expect(link).toHaveTextContent('3 missing records');
    expect(alert.calls[0]).toEqual([42, { enabled: true }]);
  });

  it('says "record" for one', () => {
    alert.data = { missingCount: 1, snoozedUntil: null };
    render(<RecordsAttention communityId={42} enabled />);
    expect(screen.getByRole('link', { name: '1 missing record' })).toBeInTheDocument();
  });

  it('ignores the snooze, as the sidebar badge does', () => {
    alert.data = { missingCount: 2, snoozedUntil: '2026-11-05T00:00:00.000Z' };
    render(<RecordsAttention communityId={42} enabled />);
    expect(screen.getByRole('link', { name: '2 missing records' })).toBeInTheDocument();
  });

  it('shows nothing while nothing is missing, or before the count arrives', () => {
    const { container, rerender } = render(<RecordsAttention communityId={42} enabled />);
    expect(container).toBeEmptyDOMElement();
    alert.data = { missingCount: 0, snoozedUntil: null };
    rerender(<RecordsAttention communityId={42} enabled />);
    expect(container).toBeEmptyDOMElement();
  });

  it('asks for nothing and shows nothing when not enabled', () => {
    alert.data = { missingCount: 3, snoozedUntil: null };
    const { container } = render(<RecordsAttention communityId={42} enabled={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(alert.calls[0]).toEqual([42, { enabled: false }]);
  });
});
