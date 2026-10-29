/**
 * The website home (`/pm/website`, spec C2).
 *
 * The page's components and hooks are real. Mocked at the edges:
 *
 * - the network, as a small FAKE SERVER on `fetch` that records every request
 *   (the compliance PATCH that links a record, the live-notice POST/PATCH, the
 *   records-alert snooze, the restore's history/revert/publish);
 * - the overlays the page loads lazily (`website-home-lazy`), as stubs that
 *   record their props and expose their callbacks — the drawer and dialog have
 *   their own tests, and the upload modal's `skipAutoLink` has its own;
 * - `TransparencyToggle`, which reads its own settings;
 * - the router, so `refresh` can be asserted.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { WebsiteHomeData } from '@/lib/services/website-home-service';

const { refreshMock, lazyProps } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  lazyProps: {
    upload: null as null | Record<string, unknown>,
    drawer: null as null | Record<string, unknown>,
    notApplicable: null as null | Record<string, unknown>,
  },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/transparency/transparency-toggle', () => ({
  TransparencyToggle: ({ subdomain }: { subdomain: string }) => <p>Transparency switch for {subdomain}</p>,
}));
vi.mock('@/components/website-home/website-home-lazy', () => ({
  LazyUploadDocumentModal: (props: Record<string, unknown>) => {
    lazyProps.upload = props;
    return <div role="dialog" aria-label="Upload Document" />;
  },
  LazyAddRecordsDrawer: (props: Record<string, unknown>) => {
    lazyProps.drawer = props;
    return (
      <div role="dialog" aria-label="Add missing records">
        <button type="button" onClick={() => (props['onClose'] as () => void)()}>
          Done
        </button>
      </div>
    );
  },
  LazyNotApplicableDialog: (props: Record<string, unknown>) => {
    lazyProps.notApplicable = props;
    return (
      <div role="dialog" aria-label="Doesn't apply">
        <button type="button" onClick={() => (props['onDone'] as (marked: boolean) => void)(true)}>
          Save reason
        </button>
      </div>
    );
  },
  LazyConfirmDialog: (props: { title: string; description: string; confirmLabel: string; onConfirm: () => void }) => (
    <div role="alertdialog" aria-label={props.title}>
      <p>{props.description}</p>
      <button type="button" onClick={props.onConfirm}>
        {props.confirmLabel}
      </button>
    </div>
  ),
}));

import { WebsiteHome } from '@/components/website-home/website-home';

const COMMUNITY_ID = 42;
const NOW = '2026-10-29T16:00:00.000Z';

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}
let calls: Call[];
let liveNoticeStatus: number;
let liveNoticeMessage: string;

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const BUDGET = { itemId: 2, templateKey: '718_budget', title: 'Annual budget', category: 'financial_records', state: 'nothing_posted' as const };
const MINUTES = { itemId: 4, templateKey: '718_minutes_rolling_12m', title: 'Meeting minutes', category: 'meeting_records', state: 'not_posted' as const };
const SIRS = { itemId: 3, templateKey: '718_sirs', title: 'Structural integrity reserve study', category: 'operations', state: 'nothing_posted' as const };

function data(over: Partial<WebsiteHomeData> = {}, records: Partial<WebsiteHomeData['records']> = {}): WebsiteHomeData {
  return {
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
    history: null,
    canRestorePrevious: true,
    liveNotice: { sentAt: null, dismissedAt: null, ownerCount: 12, offerable: false },
    records: {
      level: 'required',
      missing: [BUDGET, MINUTES],
      conditional: [SIRS],
      autoLinked: 9,
      candidates: {},
      snoozedUntil: null,
      ...records,
    },
    upcomingMeetings: [
      { id: 7, title: 'Board meeting', startsAt: '2026-11-05T23:00:00.000Z', noticePosted: false },
      { id: 8, title: 'Annual meeting', startsAt: '2026-12-01T23:00:00.000Z', noticePosted: true },
    ],
    slug: 'sunset-condos',
    ...over,
  };
}

function renderHome(d: WebsiteHomeData = data(), { published = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(
    <WebsiteHome communityId={COMMUNITY_ID} data={d} published={published} now={NOW} timeZone="America/New_York" />,
    { wrapper },
  );
  return userEvent.setup();
}

const alert = () => screen.queryByTestId('missing-records-alert');
const posts = (path: string) => calls.filter((call) => call.path.startsWith(path) && call.method !== 'GET');

beforeEach(() => {
  vi.clearAllMocks();
  lazyProps.upload = null;
  lazyProps.drawer = null;
  lazyProps.notApplicable = null;
  calls = [];
  liveNoticeStatus = 200;
  liveNoticeMessage = '';
  global.fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'https://app.example.com');
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      path: `${url.pathname}${url.search}`,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });
    switch (url.pathname) {
      case '/api/v1/compliance':
        return respond(200, { data: {} });
      case '/api/v1/pm/site/live-notice':
        if (liveNoticeStatus !== 200) {
          return respond(liveNoticeStatus, { error: { code: 'CONFLICT', message: liveNoticeMessage } });
        }
        return respond(200, { data: method === 'POST' ? { status: 'sent', recipientCount: 12 } : { ok: true } });
      case '/api/v1/pm/site/records-alert':
        return respond(200, { data: { snoozedUntil: '2026-11-05T16:00:00.000Z' } });
      case '/api/v1/pm/site/publish/history':
        return respond(200, {
          data: { data: [{ id: 30, restorable: true }, { id: 29, restorable: true }], pagination: { nextCursor: null, hasMore: false, pageSize: 2 } },
        });
      case '/api/v1/pm/site/blocks':
        return respond(200, { data: { blocks: [], publishedBlocks: [], latestPublishedAt: '2026-10-26T16:00:00.000Z' } });
      case '/api/v1/pm/site/publish/revert':
        return respond(200, { data: { ok: true } });
      case '/api/v1/pm/site/publish':
        return respond(200, { data: { published: true, publishedAt: NOW, promotedCount: 2, retiredCount: 0 } });
      default:
        return respond(404, { error: { message: 'not found' } });
    }
  }) as unknown as typeof fetch;
});

describe('records', () => {
  it('a covered condo sees the alert with its missing items and the auto-linked count', () => {
    renderHome();

    const box = alert();
    expect(box).not.toBeNull();
    const inAlert = within(box!);
    expect(inAlert.getByText('9 records were linked automatically from Documents.')).toBeInTheDocument();
    expect(inAlert.getByText('2 records are still missing:')).toBeInTheDocument();
    // Each row: title, state (icon + words), Upload.
    expect(inAlert.getByText('Annual budget')).toBeInTheDocument();
    expect(inAlert.getByText('Not posted yet')).toBeInTheDocument();
    expect(inAlert.getByText('Meeting minutes')).toBeInTheDocument();
    expect(inAlert.getByText('Saved as a draft, not posted')).toBeInTheDocument();
    expect(inAlert.getByRole('button', { name: 'Upload: Annual budget' })).toBeInTheDocument();
    // A conditional record: its hint and Doesn't apply.
    expect(inAlert.getByText('Usually applies to buildings three or more stories tall.')).toBeInTheDocument();
    expect(inAlert.getByRole('button', { name: "Doesn't apply: Structural integrity reserve study" })).toBeInTheDocument();
    expect(inAlert.getByRole('button', { name: 'Add several at once' })).toBeInTheDocument();
    expect(inAlert.getByRole('button', { name: 'Remind me next week' })).toBeInTheDocument();
    expect(inAlert.getByText("This list shows what the statute names. It isn't legal advice.")).toBeInTheDocument();
    // The section is the anchor the editor's requirements popover links to.
    expect(screen.getByRole('heading', { level: 2, name: 'Records' }).closest('section')).toHaveAttribute('id', 'records');
    // Never "compliant", never a fine.
    expect(document.body).not.toHaveTextContent(/compliant|\$\d|per day/i);
  });

  it('an item with two possible matches lists both and links the one chosen', async () => {
    const user = renderHome(
      data({}, {
        candidates: {
          [BUDGET.itemId]: [
            { documentId: 31, title: '2026 Budget' },
            { documentId: 30, title: '2025 Budget' },
          ],
        },
      }),
    );

    const row = screen.getByText('Annual budget').closest('li') as HTMLElement;
    expect(within(row).getByText('Possible matches in Documents:')).toBeInTheDocument();
    expect(within(row).getByText('2026 Budget')).toBeInTheDocument();
    expect(within(row).getByText('2025 Budget')).toBeInTheDocument();
    // Nothing was linked by itself.
    expect(posts('/api/v1/compliance')).toEqual([]);

    await user.click(within(row).getByRole('button', { name: 'Use 2025 Budget for Annual budget' }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(posts('/api/v1/compliance').map((call) => call.body)).toEqual([
      { id: BUDGET.itemId, communityId: COMMUNITY_ID, action: 'link_document', documentId: 30 },
    ]);
  });

  it("Upload posts without the server's own linking, then links the file only to its row's record", async () => {
    const user = renderHome();

    await user.click(screen.getByRole('button', { name: 'Upload: Meeting minutes' }));

    expect(lazyProps.upload).toMatchObject({
      communityId: COMMUNITY_ID,
      defaultTitle: 'Meeting minutes',
      // The category the Compliance page files it under (`getTemplateDocumentCategory`).
      categoryName: 'meeting_records',
      skipAutoLink: true,
    });
    (lazyProps.upload!['onUploaded'] as (id: number) => void)(55);

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(posts('/api/v1/compliance').map((call) => call.body)).toEqual([
      { id: MINUTES.itemId, communityId: COMMUNITY_ID, action: 'link_document', documentId: 55 },
    ]);
  });

  it('a failed link says the file is safe in Documents', async () => {
    const user = renderHome();
    vi.mocked(global.fetch).mockImplementationOnce(async () => respond(500, {}) as unknown as Response);

    await user.click(screen.getByRole('button', { name: 'Upload: Annual budget' }));
    (lazyProps.upload!['onUploaded'] as (id: number) => void)(56);

    expect(
      await screen.findByText(
        "Your file is posted in Documents, but we couldn't link it to Annual budget. You can link it from the Compliance page.",
      ),
    ).toBeInTheDocument();
  });

  it('Add several at once opens the drawer with the lists, and refreshes the page when it closes', async () => {
    const user = renderHome();

    await user.click(screen.getByRole('button', { name: 'Add several at once' }));

    expect(lazyProps.drawer).toMatchObject({ communityId: COMMUNITY_ID, missing: [BUDGET, MINUTES], conditional: [SIRS] });
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Add missing records' })).not.toBeInTheDocument();
  });

  it("Doesn't apply opens the dialog, and a saved reason refreshes the page", async () => {
    const user = renderHome();

    await user.click(screen.getByRole('button', { name: "Doesn't apply: Structural integrity reserve study" }));
    expect(lazyProps.notApplicable).toMatchObject({ communityId: COMMUNITY_ID, item: SIRS });
    await user.click(screen.getByRole('button', { name: 'Save reason' }));

    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('Remind me next week snoozes and hides the alert', async () => {
    const user = renderHome();

    await user.click(screen.getByRole('button', { name: 'Remind me next week' }));

    await waitFor(() => expect(alert()).toBeNull());
    expect(posts('/api/v1/pm/site/records-alert').map((call) => call.body)).toEqual([
      { communityId: COMMUNITY_ID, snoozeDays: 7 },
    ]);
    expect(screen.getByText(/2 records are still missing\. We'll remind you again on/)).toBeInTheDocument();
  });

  it('below the threshold shows the recommended note and no alert', () => {
    renderHome(data({}, { level: 'recommended', missing: [], conditional: [] }));

    expect(
      screen.getByText(
        "Florida's website rule doesn't cover associations of this size, so this list is a recommendation. Many associations post these records anyway.",
      ),
    ).toBeInTheDocument();
    expect(alert()).toBeNull();
  });

  it('an apartment shows no records section', () => {
    renderHome(
      data(
        { facts: { ...data().facts, communityType: 'apartment' } },
        { level: 'none', missing: [], conditional: [] },
      ),
    );

    expect(screen.queryByRole('heading', { name: 'Records' })).not.toBeInTheDocument();
    expect(alert()).toBeNull();
    // Nor the transparency page, which is for condos and HOAs.
    expect(screen.queryByRole('heading', { name: 'Transparency page' })).not.toBeInTheDocument();
  });

  it('no alert while snoozed', () => {
    renderHome(data({}, { snoozedUntil: '2026-11-02T16:00:00.000Z' }));

    expect(alert()).toBeNull();
    expect(
      screen.getByText("2 records are still missing. We'll remind you again on Monday, November 2."),
    ).toBeInTheDocument();
  });
});

describe('other sections', () => {
  it('coming up shows "Notice not marked posted yet" and links to Meetings', () => {
    renderHome();

    const section = screen.getByRole('heading', { name: 'Coming up' }).closest('section') as HTMLElement;
    const board = within(section).getByText('Board meeting').closest('li') as HTMLElement;
    expect(within(board).getByText('Notice not marked posted yet')).toBeInTheDocument();
    expect(within(board).getByRole('link', { name: 'Open Board meeting in Meetings' })).toHaveAttribute(
      'href',
      `/communities/${COMMUNITY_ID}/meetings`,
    );
    // The start in the community's time zone (23:00 UTC is 6 PM in Miami).
    expect(within(board).getByText('Thu, Nov 5, 2026, 6:00 PM')).toBeInTheDocument();
    const annual = within(section).getByText('Annual meeting').closest('li') as HTMLElement;
    expect(within(annual).getByText('Notice marked posted')).toBeInTheDocument();
  });

  it('details show "Not added yet, so it\'s hidden on the site" for empty fields', () => {
    renderHome();

    const section = screen.getByRole('heading', { name: 'Details on your site' }).closest('section') as HTMLElement;
    const value = (label: string) => within(section).getByText(label).nextElementSibling as HTMLElement;
    expect(value('Name')).toHaveTextContent('Sunset Condos');
    expect(value('Address')).toHaveTextContent('100 Ocean Dr, Miami, FL 33139');
    expect(value('Public email')).toHaveTextContent('board@sunsetcondos.org');
    expect(value('Public phone')).toHaveTextContent("Not added yet, so it's hidden on the site");
    expect(value('Office hours')).toHaveTextContent("Not added yet, so it's hidden on the site");
    expect(within(section).getByRole('link', { name: 'Edit in Community profile' })).toHaveAttribute(
      'href',
      `/settings?communityId=${COMMUNITY_ID}#community-profile`,
    );
  });

  it('the email offer shows only while offerable', async () => {
    const offer = 'Let owners know their association has a website.';
    const live = { sentAt: null, dismissedAt: null, ownerCount: 12, offerable: true };

    renderHome(data({ liveNotice: { ...live, offerable: false } }));
    expect(screen.queryByText(offer)).not.toBeInTheDocument();
    cleanup();

    // Offerable, but never published: not yet.
    renderHome(data({ liveNotice: live, lastPublish: null }));
    expect(screen.queryByText(offer)).not.toBeInTheDocument();
    cleanup();

    const user = renderHome(data({ liveNotice: live }));
    expect(screen.getByText(offer)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Email owners' }));

    expect(await screen.findByText('We emailed 12 owners that the website is live.')).toBeInTheDocument();
    expect(screen.queryByText(offer)).not.toBeInTheDocument();
    expect(posts('/api/v1/pm/site/live-notice').map((call) => [call.method, call.body])).toEqual([
      ['POST', { communityId: COMMUNITY_ID }],
    ]);
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows the server's refusal as it words it, and Not now dismisses", async () => {
    const live = { sentAt: null, dismissedAt: null, ownerCount: 12, offerable: true };
    liveNoticeStatus = 409;
    liveNoticeMessage = 'Owners have already been emailed that the site is live.';
    let user = renderHome(data({ liveNotice: live }));

    await user.click(screen.getByRole('button', { name: 'Email owners' }));
    expect(await screen.findByText('Owners have already been emailed that the site is live.')).toBeInTheDocument();
    cleanup();

    liveNoticeStatus = 200;
    user = renderHome(data({ liveNotice: live }));
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() =>
      expect(screen.queryByText('Let owners know their association has a website.')).not.toBeInTheDocument(),
    );
    expect(posts('/api/v1/pm/site/live-notice').at(-1)).toMatchObject({
      method: 'PATCH',
      body: { communityId: COMMUNITY_ID, dismissed: true },
    });
  });

  it('?published=1 shows the updated banner', () => {
    renderHome(data(), { published: true });

    expect(
      screen.getByRole('heading', { level: 2, name: "Sunset Condos's website has been updated" }),
    ).toBeInTheDocument();
    expect(screen.getByText('sunset-condos.example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View site/ })).toHaveAttribute('href', 'https://sunset-condos.example.com/');
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('without it, says the website is live', () => {
    renderHome();

    expect(screen.getByRole('heading', { level: 2, name: 'Your website is live' })).toBeInTheDocument();
  });

  it('your site shows the look, edit and change look, and who published last', () => {
    renderHome();

    const section = screen.getByRole('heading', { name: 'Your site' }).closest('section') as HTMLElement;
    expect(within(section).getByText('Bayfront')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Edit your site' })).toHaveAttribute(
      'href',
      `/pm/website-editor?communityId=${COMMUNITY_ID}`,
    );
    expect(within(section).getByRole('link', { name: 'Change look' })).toHaveAttribute(
      'href',
      `/pm/website/looks?communityId=${COMMUNITY_ID}`,
    );
    expect(section).toHaveTextContent('Last published 3 days ago by Maria Lopez');
  });

  it('a site on a legacy layout reads "An older look"', () => {
    renderHome(data({ facts: { ...data().facts, liveLookId: null } }));

    expect(screen.getByText('An older look')).toBeInTheDocument();
  });
});

describe('restore', () => {
  it('restore shows on Essentials; the version list only with hasSitePolishBlocks', async () => {
    // Essentials: the loader sends no list.
    renderHome(data({ history: null }));
    expect(screen.getByRole('button', { name: 'Restore previous version' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See earlier versions' })).not.toBeInTheDocument();
    cleanup();

    const user = renderHome(
      data({
        history: [
          { snapshotId: 30, publishedAt: '2026-10-26T16:00:00.000Z', byName: 'Maria Lopez', restorable: true },
          { snapshotId: 29, publishedAt: '2026-10-20T16:00:00.000Z', byName: null, restorable: true },
          { snapshotId: 28, publishedAt: '2026-09-01T16:00:00.000Z', byName: null, restorable: false },
        ],
      }),
    );
    const toggle = screen.getByRole('button', { name: 'See earlier versions' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const list = document.getElementById('earlier-versions') as HTMLElement;
    expect(within(list).getByText('Live now')).toBeInTheDocument();
    expect(within(list).getAllByRole('button', { name: /^Restore the version from/ })).toHaveLength(1);
    expect(within(list).getByText('Too old to restore')).toBeInTheDocument();
  });

  it('nothing to restore offers no Restore', () => {
    renderHome(data({ canRestorePrevious: false }));

    expect(screen.queryByRole('button', { name: 'Restore previous version' })).not.toBeInTheDocument();
  });

  it('Restore previous version asks first, then reverts and publishes', async () => {
    const user = renderHome();

    await user.click(screen.getByRole('button', { name: 'Restore previous version' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Restore the previous version?' });
    expect(dialog).toHaveTextContent(
      'Your site goes back to how it was before the last publish. Unpublished edits are discarded.',
    );
    // Nothing is written before the person confirms.
    expect(calls.filter((call) => call.method === 'POST')).toEqual([]);

    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(calls.filter((call) => call.method === 'POST').map((call) => [call.path, call.body])).toEqual([
      ['/api/v1/pm/site/publish/revert', { communityId: COMMUNITY_ID, snapshotId: 29 }],
      ['/api/v1/pm/site/publish', { communityId: COMMUNITY_ID, expectedPublishedAt: '2026-10-26T16:00:00.000Z' }],
    ]);
  });
});
