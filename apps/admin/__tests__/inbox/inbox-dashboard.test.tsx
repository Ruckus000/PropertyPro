// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/inbox',
}));

import { InboxDashboard } from '@/components/inbox/InboxDashboard';
import type { InboxOverview } from '@/lib/server/inbox';

const THREAD = {
  id: 7,
  mailbox: 'privacy' as const,
  mailboxLabel: 'Privacy',
  subject: 'Please delete my account',
  participantEmail: 'k@example.com',
  participantName: null,
  status: 'pending' as const,
  messageCount: 2,
  firstMessageAt: '2026-09-01T00:00:00.000Z',
  lastMessageAt: '2026-09-02T00:00:00.000Z',
};

const OVERVIEW = {
  threads: [THREAD],
  truncated: false,
  stats: { total: 1, open: 0, pending: 1, closed: 0, spam: 0 },
  byMailbox: {
    support: { total: 0, open: 0, pending: 0, closed: 0, spam: 0 },
    privacy: { total: 1, open: 0, pending: 1, closed: 0, spam: 0 },
    contact: { total: 0, open: 0, pending: 0, closed: 0, spam: 0 },
  },
} as unknown as InboxOverview;

/**
 * `?mailbox=` / `?status=` come straight from the URL. Unvalidated,
 * `?mailbox=foo` matched no thread and highlighted no chip — an empty list with
 * nothing on screen saying which filter was in force.
 */
describe('InboxDashboard URL filter validation', () => {
  it('falls back to All for a mailbox that is not a real mailbox', () => {
    render(<InboxDashboard overview={OVERVIEW} initialMailbox="foo" initialStatus="all" />);

    // The thread is still listed, i.e. the bogus filter was not applied.
    expect(screen.getByRole('link', { name: /please delete my account/i })).toBeTruthy();
  });

  it('falls back to All for a status that is not a real status', () => {
    render(<InboxDashboard overview={OVERVIEW} initialMailbox="all" initialStatus="banana" />);

    expect(screen.getByRole('link', { name: /please delete my account/i })).toBeTruthy();
  });

  it('still honours a real filter — an unmatched one hides the thread (control)', () => {
    render(<InboxDashboard overview={OVERVIEW} initialMailbox="support" initialStatus="all" />);

    // `support` IS a known mailbox, and this thread is in `privacy`, so an empty
    // list here is correct. Without this case the two above would pass even if
    // `knownOr` returned 'all' for everything.
    expect(screen.queryByRole('link', { name: /please delete my account/i })).toBeNull();
  });
});
