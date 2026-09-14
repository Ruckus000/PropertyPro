// @vitest-environment jsdom
/**
 * The activity log's presentation.
 *
 * The cases here are the ones that fail silently on screen:
 *
 * - a READ FAILURE must not render as an empty state. "No operator activity
 *   recorded yet" on a broken query is the same class of lie `ErrorsList`
 *   refuses for `errors === null`, and it is worse here: an operator checking
 *   whether a colleague changed something would conclude nobody had.
 * - an action outside `AdminAuditAction` must still be PAINTED. Production
 *   already holds `data_repair` and `auth_user_deleted`, written by manual SQL
 *   rather than `logAdminAction`; a tone map with no fallback would hide the
 *   rows nobody planned for.
 * - changing a filter must DROP the cursor. Carrying `before` across a filter
 *   change hides the new result set's first page behind an id from the old one
 *   — a page that looks correct and is missing its top.
 * - timestamps are UTC by construction. A server-rendered local time is a
 *   silent lie about the zone, and the incident tools being correlated against
 *   (Sentry, Stripe, Vercel) are all UTC.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import {
  ActivityLogList,
  actionTone,
  formatLogTime,
} from '@/components/health/ActivityLogList';
import type { AdminActivityEntry } from '@/lib/server/admin-activity';

const entry = (over: Partial<AdminActivityEntry> = {}): AdminActivityEntry => ({
  id: 7,
  action: 'platform_admin_added',
  resourceType: 'platform_admin_users',
  resourceId: 'abc',
  adminEmail: 'ops@getpropertypro.com',
  adminUserId: 'uuid-1',
  communityId: null,
  oldValues: null,
  newValues: { role: 'super_admin' },
  metadata: null,
  createdAt: '2026-09-06T03:37:00.116Z',
  ...over,
});

const base = {
  nextCursor: null,
  filters: {},
  basePath: '/health/logs',
};

describe('formatLogTime', () => {
  it('formats in UTC regardless of the runtime zone, to the millisecond', () => {
    expect(formatLogTime('2026-09-10T17:53:07.276Z')).toBe('Sep 10 17:53:07.276');
  });

  it('pads so the column stays aligned', () => {
    expect(formatLogTime('2026-01-02T03:04:05.006Z')).toBe('Jan 02 03:04:05.006');
  });

  it('shows an unparseable stamp verbatim rather than "Invalid Date"', () => {
    expect(formatLogTime('not-a-date')).toBe('not-a-date');
  });
});

describe('actionTone', () => {
  it('tints destructive and money-moving actions', () => {
    expect(actionTone('platform_admin_removed')).toBe('danger');
    expect(actionTone('subscription_canceled')).toBe('warning');
    expect(actionTone('cron_job_retried')).toBe('info');
  });

  it('falls back to a PAINTED neutral for an action outside the union', () => {
    // `data_repair` is written by manual SQL, not `logAdminAction` — it is in
    // production and is not in `AdminAuditAction`.
    expect(actionTone('data_repair')).toBe('danger');
    expect(actionTone('some_future_action')).toBe('neutral');
  });
});

describe('ActivityLogList', () => {
  it('renders a failed read as a danger banner, NEVER as an empty state', () => {
    render(<ActivityLogList {...base} entries={[]} error="Failed to load: permission denied" />);

    // Plain textContent: admin's vitest config installs no jest-dom matchers.
    expect(screen.getByRole('alert').textContent).toMatch(/couldn't load the activity log/i);
    expect(screen.queryByText(/no operator activity recorded yet/i)).toBeNull();
  });

  it('renders a real empty state when the query succeeded and the log is empty', () => {
    render(<ActivityLogList {...base} entries={[]} />);
    expect(screen.getByText(/no operator activity recorded yet/i)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so differently when filters are what emptied the list', () => {
    render(<ActivityLogList {...base} entries={[]} filters={{ action: 'demo_deleted' }} />);
    expect(screen.getByText(/nothing matches these filters/i)).toBeTruthy();
  });

  it('paints an unknown action rather than dropping its colour class', () => {
    render(<ActivityLogList {...base} entries={[entry({ action: 'data_repair' })]} />);
    const pill = screen.getByText('data_repair');
    // Written-out classes, not a template — a template compiles to no CSS.
    expect(pill.className).toContain('bg-status-danger-subtle');
  });

  it('carries the machine-readable timestamp alongside the formatted one', () => {
    render(<ActivityLogList {...base} entries={[entry()]} />);
    const stamp = screen.getByText('Sep 06 03:37:00.116');
    expect(stamp.tagName).toBe('TIME');
    expect(stamp.getAttribute('dateTime')).toBe('2026-09-06T03:37:00.116Z');
  });

  it('expands with a native disclosure, so it works before hydration', () => {
    const { container } = render(<ActivityLogList {...base} entries={[entry()]} />);
    expect(container.querySelector('details')).toBeTruthy();
    expect(container.querySelector('summary')).toBeTruthy();
  });

  it('shows the payload columns in the expanded body', () => {
    render(
      <ActivityLogList
        {...base}
        entries={[entry({ oldValues: { a: 1 }, metadata: { reason: 'x' } })]}
      />,
    );
    expect(screen.getByText('Before')).toBeTruthy();
    expect(screen.getByText('After')).toBeTruthy();
    expect(screen.getByText('Metadata')).toBeTruthy();
  });

  it('names a null community as platform-level rather than showing a blank', () => {
    render(<ActivityLogList {...base} entries={[entry({ communityId: null })]} />);
    expect(screen.getByText(/none — a platform-level action/i)).toBeTruthy();
  });

  it('a filter link PRESERVES the other filters in force', () => {
    render(
      <ActivityLogList
        {...base}
        entries={[entry({ adminEmail: 'ops@getpropertypro.com' })]}
        filters={{ admin: 'ops@getpropertypro.com' }}
      />,
    );
    const link = screen.getByRole('link', { name: 'Only platform_admin_added' });
    const href = link.getAttribute('href') ?? '';
    expect(href).toContain('action=platform_admin_added');
    expect(href).toContain('admin=ops%40getpropertypro.com');
  });

  it('a filter link DROPS the cursor, so the new result set starts at its top', () => {
    render(
      <ActivityLogList
        {...base}
        entries={[entry()]}
        nextCursor={42}
        filters={{ action: 'demo_deleted' }}
      />,
    );
    const link = screen.getByRole('link', { name: 'Only platform_admin_added' });
    expect(link.getAttribute('href')).not.toContain('before=');
  });

  it('the paging link keeps the filters AND carries the cursor', () => {
    render(
      <ActivityLogList
        {...base}
        entries={[entry()]}
        nextCursor={42}
        filters={{ action: 'demo_deleted' }}
      />,
    );
    const href =
      screen.getByRole('link', { name: /load older entries/i }).getAttribute('href') ?? '';
    expect(href).toContain('action=demo_deleted');
    expect(href).toContain('before=42');
  });

  it('renders no paging link on the last page', () => {
    render(<ActivityLogList {...base} entries={[entry()]} nextCursor={null} />);
    expect(screen.queryByRole('link', { name: /load older entries/i })).toBeNull();
  });

  it('offers a removable chip per filter in force', () => {
    render(
      <ActivityLogList
        {...base}
        entries={[entry()]}
        filters={{ action: 'demo_deleted', communityId: 4 }}
      />,
    );
    const clearAction = screen.getByRole('link', { name: /remove filter action: demo_deleted/i });
    // Removing one filter keeps the other.
    expect(clearAction.getAttribute('href')).toBe('/health/logs?communityId=4');
  });

  it('keeps communityId 0 as a filter instead of treating it as cleared', () => {
    render(<ActivityLogList {...base} entries={[entry()]} filters={{ communityId: 0 }} />);
    expect(screen.getByRole('link', { name: /remove filter community: 0/i })).toBeTruthy();
  });

  it('the column header is hidden from assistive tech — each row names itself', () => {
    const { container } = render(<ActivityLogList {...base} entries={[entry()]} />);
    const header = container.querySelector('[aria-hidden="true"]');
    expect(within(header as HTMLElement).getByText('TIME (UTC)')).toBeTruthy();
  });
});
