// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
import { INBOX_DEFAULT_STATUS } from '@/components/inbox/inbox-filters';
import { ThreadList } from '@/components/inbox/ThreadList';
import type { InboxThread } from '@/lib/server/inbox';

const thread: InboxThread = {
  id: 7,
  mailbox: 'privacy',
  mailboxLabel: 'Privacy',
  subject: 'Please delete my account',
  participantEmail: 'k@gmail.com',
  participantName: null,
  status: 'pending',
  messageCount: 2,
  firstMessageAt: '2026-09-01T00:00:00.000Z',
  lastMessageAt: '2026-09-02T00:00:00.000Z',
};

function threadLinkHref() {
  return screen.getByRole('link', { name: /please delete my account/i }).getAttribute('href');
}

/**
 * `InboxDashboard`'s docblock claims "`ThreadList` links carry the current
 * query forward" — this pins that claim. Without the mailbox/status query
 * string, an operator filtered to Privacy/Pending who clicks a thread lands
 * back on the detail page with the filters reset to their defaults.
 */
describe('ThreadList', () => {
  it('carries the active mailbox and status filters into the thread link', () => {
    render(<ThreadList threads={[thread]} truncated={false} mailbox="privacy" status="pending" />);
    expect(threadLinkHref()).toBe('/inbox/7?mailbox=privacy&status=pending');
  });

  it('keeps an explicit status=all, because All is not the default status', () => {
    // The inbox opens on `INBOX_DEFAULT_STATUS` ('open'). A link that dropped
    // 'all' reopened the thread with the Open tab active, so this `pending`
    // thread disappeared from the list it had just been clicked in.
    render(<ThreadList threads={[thread]} truncated={false} mailbox="all" status="all" />);
    expect(threadLinkHref()).toBe('/inbox/7?status=all');
  });

  it('omits the query string when both filters are at their defaults (control)', () => {
    render(
      <ThreadList threads={[thread]} truncated={false} mailbox="all" status={INBOX_DEFAULT_STATUS} />,
    );
    expect(threadLinkHref()).toBe('/inbox/7');
  });
});
