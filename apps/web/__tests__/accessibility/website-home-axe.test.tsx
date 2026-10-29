/**
 * Accessibility audit — the website home (`/pm/website`).
 *
 * Its own file because the page needs `next/navigation` and `sonner` mocked,
 * and `vi.mock` is file-scoped.
 *
 * Everything on the page is real, the transparency switch included (its
 * settings read is answered by a stub `fetch`). The overlays the page loads on
 * a click are not opened here; the drawer and dialog are audited in their own
 * tests.
 *
 * Each case first asserts that the page's own content rendered, because an axe
 * run over a container that rendered nothing passes trivially.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'vitest-axe';
import type { ReactNode } from 'react';
import type { WebsiteHomeData } from '@/lib/services/website-home-service';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { WebsiteHome } from '@/components/website-home/website-home';

const DATA: WebsiteHomeData = {
  facts: {
    profile: {
      name: 'Sunset Condos',
      shortName: null,
      addressLine1: '100 Ocean Dr',
      addressLine2: null,
      city: 'Miami',
      state: 'FL',
      zipCode: '33139',
      unitCount: 40,
      officeHours: null,
      contactName: null,
      contactEmail: 'board@sunsetcondos.org',
      contactPhone: null,
    },
    communityType: 'condo_718',
    upcomingMeetingCount: 1,
    newsCount: 0,
    recordsPosted: 9,
    recordsTotal: 12,
    liveLookId: 'bayfront',
    draftLookId: null,
    pendingDraftCount: 0,
    siteUrl: 'https://sunset-condos.example.com/',
  },
  lastPublish: { publishedAt: '2026-10-26T16:00:00.000Z', byName: 'Maria Lopez' },
  history: [
    { snapshotId: 30, publishedAt: '2026-10-26T16:00:00.000Z', byName: 'Maria Lopez', restorable: true },
    { snapshotId: 29, publishedAt: '2026-10-20T16:00:00.000Z', byName: null, restorable: true },
    { snapshotId: 28, publishedAt: '2026-09-01T16:00:00.000Z', byName: null, restorable: false },
  ],
  previousSnapshotId: 29,
  publishToken: '2026-10-26T16:00:00.000Z',
  sitePublished: true,
  liveNotice: { sentAt: null, dismissedAt: null, ownerCount: 12, offerable: true },
  records: {
    level: 'required',
    missing: [
      { itemId: 2, templateKey: '718_budget', title: 'Annual budget', category: 'financial_records', state: 'nothing_posted' },
      {
        itemId: 4,
        templateKey: '718_minutes_rolling_12m',
        title: 'Meeting minutes',
        category: 'meeting_records',
        state: 'out_of_date',
      },
    ],
    conditional: [
      { itemId: 3, templateKey: '718_sirs', title: 'Structural integrity reserve study', category: 'operations', state: 'nothing_posted' },
    ],
    autoLinked: 9,
    candidates: {
      2: [
        { documentId: 31, title: '2026 Budget' },
        { documentId: 30, title: '2025 Budget' },
      ],
    },
    snoozedUntil: null,
  },
  upcomingMeetings: [
    { id: 7, title: 'Board meeting', startsAt: '2026-11-05T23:00:00.000Z', noticePosted: false },
    { id: 8, title: 'Annual meeting', startsAt: '2026-12-01T23:00:00.000Z', noticePosted: true },
  ],
  slug: 'sunset-condos',
};

beforeEach(() => {
  global.fetch = vi.fn(async (input: string) => {
    const body = String(input).startsWith('/api/v1/document-categories')
      ? {
          data: {
            data: [{ id: 3, name: 'Financial Records', slug: 'financial-records', description: null }],
            pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
          },
        }
      : { data: { enabled: false, acknowledgedAt: null } };
    return { ok: true, status: 200, json: async () => body };
  }) as unknown as typeof fetch;
});

function renderHome(data: WebsiteHomeData) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <WebsiteHome communityId={42} data={data} published={false} now="2026-10-29T16:00:00.000Z" timeZone="America/New_York" />,
    { wrapper },
  );
}

/** The page's own sections, so the audit below cannot pass over an empty tree. */
async function expectSections(names: readonly string[]) {
  for (const name of names) {
    expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
  }
  // Settled: the transparency switch has read its settings.
  expect(await screen.findByRole('checkbox', { name: 'Enable compliance transparency page' })).toBeInTheDocument();
}

describe('website home — axe', () => {
  it('the axe run has no violations', async () => {
    const user = userEvent.setup();
    const { container } = renderHome(DATA);
    await expectSections([
      'Your website is live',
      'Records',
      'Coming up',
      'Details on your site',
      'Your site',
      'Transparency page',
    ]);
    // The alert at its fullest: missing rows, matches, a "may not apply" row,
    // the email offer, and the version list open.
    expect(screen.getByTestId('missing-records-alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use 2025 Budget for Annual budget' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Email owners' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'See earlier versions' }));
    expect(screen.getByText('Live now')).toBeInTheDocument();

    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('has none below the threshold, with nothing to restore and nothing coming up', async () => {
    const { container } = renderHome({
      ...DATA,
      history: null,
      previousSnapshotId: null,
      lastPublish: null,
      upcomingMeetings: [],
      records: { ...DATA.records, level: 'recommended', missing: [], conditional: [], candidates: {} },
    });
    await expectSections(['Your website is live', 'Records', 'Coming up', 'Details on your site', 'Your site']);
    expect(screen.getByText(/so this list is a recommendation/)).toBeInTheDocument();
    expect(screen.getByText('No meetings in the next 90 days.')).toBeInTheDocument();

    const results = await axe(container);

    expect(results).toHaveNoViolations();
  });

  it('has none with the upload dialog open, which takes and keeps focus', async () => {
    const user = userEvent.setup();
    const { baseElement } = renderHome(DATA);
    await expectSections(['Records']);
    const upload = screen.getByRole('button', { name: 'Upload: Annual budget' });

    await user.click(upload);

    // A real dialog, titled, with the content loaded (not a stub, not a spinner).
    const dialog = await screen.findByRole('dialog', { name: 'Upload Document' });
    expect(await within(dialog).findByText('Financial Records')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    const results = await axe(baseElement);
    expect(results).toHaveNoViolations();

    // Closing returns focus to the row's Upload button.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(upload).toHaveFocus());
  });
});
