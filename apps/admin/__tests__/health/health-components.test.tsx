// @vitest-environment jsdom
/**
 * The Health board's three sections.
 *
 * The cases here are about the states that are easy to get wrong and invisible
 * when they are:
 *
 * - `errors === null` must render an INFORMATIONAL banner, never an empty list.
 *   An empty list reads as "no production errors", which is a claim a console
 *   with no Sentry token is in no position to make.
 * - a service tile must be readable without colour — the state WORD is text, not
 *   just a tinted dot (`.claude/rules/design.md`).
 * - a non-retryable job must render NO retry button, because there is no
 *   endpoint behind one for a Stripe event.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ErrorsList } from '@/components/health/ErrorsList';
import { FailedJobsList } from '@/components/health/FailedJobsList';
import { ServicesStrip } from '@/components/health/ServicesStrip';
import type { FailedJob, ServiceStatus } from '@/lib/server/health';
import type { SentryIssue } from '@/lib/server/sentry';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const issue = (over: Partial<SentryIssue> = {}): SentryIssue => ({
  id: '42',
  shortId: 'PP-7',
  title: 'TypeError: x is not a function',
  culprit: 'lib/compliance/score.ts',
  count: 6,
  lastSeen: '2026-09-08T09:00:00Z',
  permalink: 'https://propertypro.sentry.io/issues/42/',
  hourly: [1, 2, 3],
  ...over,
});

describe('ServicesStrip', () => {
  const services: ServiceStatus[] = [
    { name: 'API', state: 'ok', short: 'Healthy', meta: '81 ms' },
    { name: 'Stripe webhooks', state: 'degraded', short: '3/hr', meta: '7 unprocessed in 24h' },
    { name: 'Supabase', state: 'down', short: 'Unreachable', meta: 'ENOTFOUND' },
    { name: 'Resend', state: 'unknown', short: 'Not configured', meta: 'RESEND_API_KEY is not set' },
  ];

  it('states every service in words, not only in colour', () => {
    render(<ServicesStrip services={services} />);
    // One readable state word per tile — a reader who cannot distinguish the
    // dots gets the same information.
    expect(screen.getByText('Healthy')).toBeTruthy();
    expect(screen.getByText('Degraded')).toBeTruthy();
    expect(screen.getByText('Down')).toBeTruthy();
    expect(screen.getByText('Not checked')).toBeTruthy();
  });

  it('names the unset env var so the fix is on screen', () => {
    render(<ServicesStrip services={services} />);
    expect(screen.getByText('RESEND_API_KEY is not set')).toBeTruthy();
  });

  it('renders one list item per service', () => {
    render(<ServicesStrip services={services} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });
});

describe('ErrorsList', () => {
  it('shows an informational banner when Sentry is not configured', () => {
    render(<ErrorsList errors={null} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Sentry is not configured');
    expect(alert.textContent).toContain('SENTRY_API_TOKEN');
    // The decisive assertion: NOT an empty list that reads as "all clear".
    expect(screen.queryByText('No unresolved errors')).toBeNull();
  });

  it('shows a real empty state when Sentry was asked and production is quiet', () => {
    render(<ErrorsList errors={[]} />);
    expect(screen.getByText('No unresolved errors')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('links Create ticket with the issue ref and an encoded title', () => {
    render(<ErrorsList errors={[issue()]} />);
    expect(screen.getByRole('link', { name: 'Create ticket' }).getAttribute('href')).toBe(
      '/tickets/new?ref=42&title=TypeError%3A%20x%20is%20not%20a%20function',
    );
  });

  it('opens Sentry in a new tab, and says so', () => {
    render(<ErrorsList errors={[issue()]} />);
    const link = screen.getByRole('link', { name: 'Open PP-7 in Sentry (opens in a new tab)' });
    expect(link.getAttribute('href')).toBe('https://propertypro.sentry.io/issues/42/');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('renders an hourly sparkline, and nothing at all for an issue with no buckets', () => {
    const { container } = render(<ErrorsList errors={[issue()]} />);
    expect(container.querySelector('[aria-label="Trend over the last 24 hours"]')).toBeTruthy();

    const empty = render(<ErrorsList errors={[issue({ hourly: [] })]} />);
    // MiniBars returns null for an empty series — no empty box to explain.
    expect(empty.container.querySelector('[aria-label^="Trend over"]')).toBeNull();
  });
});

describe('FailedJobsList', () => {
  const cron: FailedJob = {
    source: 'Cron',
    name: 'expire-demos',
    error: 'timeout after 30 s',
    when: '2h ago',
    attempts: '3 attempts',
    retryable: true,
    slug: 'expire-demos',
    consecutiveFailures: 3,
  };
  const stripeEvent: FailedJob = {
    source: 'Stripe',
    name: 'evt_1NX',
    error: 'not processed',
    when: '10m ago',
    attempts: '—',
    retryable: false,
  };

  it('offers a retry only for the rows that have an endpoint behind one', () => {
    render(<FailedJobsList jobs={[cron, stripeEvent]} />);
    // One retry button, for the cron row — a Stripe event cannot be replayed
    // from here, and a button that cannot work is worse than no button.
    expect(screen.getAllByRole('button', { name: 'Retry expire-demos' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /evt_1NX/ })).toBeNull();
  });

  it('hides Retry all unless more than one row is retryable', () => {
    render(<FailedJobsList jobs={[cron, stripeEvent]} />);
    expect(screen.queryByRole('button', { name: /Retry all/ })).toBeNull();
  });

  it('offers Retry all when two cron rows are retryable', () => {
    render(<FailedJobsList jobs={[cron, { ...cron, name: 'snowbird-digest', slug: 'snowbird-digest' }]} />);
    expect(screen.getByRole('button', { name: 'Retry all (2)' })).toBeTruthy();
  });

  it('shows the empty state when nothing has failed', () => {
    render(<FailedJobsList jobs={[]} />);
    expect(screen.getByText('Every scheduled job is healthy')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
  });

  it('mounts the live region BEFORE there is anything to announce', () => {
    // A live region inserted into the DOM alongside its own text is announced
    // unreliably by NVDA and JAWS. The region has to already exist for the
    // change to be observed, so it renders empty and `sr-only`.
    render(<FailedJobsList jobs={[cron]} />);
    const region = screen.getByRole('status');
    expect(region.textContent).toBe('');
  });

  describe('what a non-ok retry actually means', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** The route answers 200 with `ok:false` and the upstream status. */
    function mockRetry(status: number) {
      global.fetch = vi.fn(
        async () => new Response(JSON.stringify({ data: { status, ok: false } }), { status: 200 }),
      ) as unknown as typeof fetch;
    }

    it('calls a 404 undelivered, and does NOT send the operator to Sentry', async () => {
      // The nested-slug bug produced exactly this. "The job ran and failed —
      // check Sentry" was wrong twice over: it did not run, and Sentry is empty.
      mockRetry(404);
      render(<FailedJobsList jobs={[cron]} />);

      fireEvent.click(screen.getByRole('button', { name: 'Retry expire-demos' }));

      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toContain('was not delivered'),
      );
      expect(screen.getByRole('status').textContent).not.toContain('Check Sentry');
    });

    it('names CRON_SECRET on a 401 rather than blaming the job', async () => {
      // Every cron 401ing silently behind a green dashboard is this repo's own
      // history. A board that reports it as "the job failed" repeats it.
      mockRetry(401);
      render(<FailedJobsList jobs={[cron]} />);

      fireEvent.click(screen.getByRole('button', { name: 'Retry expire-demos' }));

      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toContain('CRON_SECRET'),
      );
      expect(screen.getByRole('status').textContent).toContain('did not run');
    });

    it('still points at Sentry for a genuine job failure', async () => {
      // The control: the original sentence has to survive for the case it was
      // actually right about, or this is a regression wearing a test.
      mockRetry(500);
      render(<FailedJobsList jobs={[cron]} />);

      fireEvent.click(screen.getByRole('button', { name: 'Retry expire-demos' }));

      await waitFor(() =>
        expect(screen.getByRole('status').textContent).toContain('The job ran and failed'),
      );
      expect(screen.getByRole('status').textContent).toContain('Check Sentry');
    });
  });
});
