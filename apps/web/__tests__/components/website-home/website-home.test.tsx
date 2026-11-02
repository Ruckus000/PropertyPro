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
const { toastMock } = vi.hoisted(() => {
  let next = 0;
  return { toastMock: { error: vi.fn(), success: vi.fn((..._args: unknown[]) => `toast-${(next += 1)}`), dismiss: vi.fn() } };
});
vi.mock('sonner', () => ({ toast: toastMock }));
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

// The photo field has its own tests (upload, describe, reorder); here it stands
// in for a picked file that has not uploaded yet. The axe test renders the real one.
vi.mock('@/components/pm/site-editor-v3/inspector/forms/fields/HeroPhotosField', () => ({
  HeroPhotosField: (props: { onPendingChange?: (pending: boolean) => void }) => (
    <div>
      <p>Photos</p>
      <button type="button" onClick={() => props.onPendingChange?.(true)}>
        Pick a file
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
/** The live site's publish token, as `/blocks` reports it. */
let liveToken: string;
let publishStatus: number;
/** While set, the compliance PATCH waits for it: a link in flight. */
let holdLink: Promise<void> | null;
/** Records that already hold a file: the server refuses to link over one without `replace`. */
let recordsWithFile: Set<number>;
/** The hero PATCH's status: 200, or a failure. */
let heroStatus: number;

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
    previousSnapshotId: 29,
  publishToken: '2026-10-26T16:00:00.000Z',
  sitePublished: true,
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
    liveHero: { headline: 'Welcome to {{name}}', subtitle: 'Homes in {{city}}.' },
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
  liveToken = '2026-10-26T16:00:00.000Z';
  publishStatus = 200;
  holdLink = null;
  recordsWithFile = new Set();
  heroStatus = 200;
  global.fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'https://app.example.com');
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      path: `${url.pathname}${url.search}`,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });
    switch (url.pathname) {
      case '/api/v1/compliance': {
        if (holdLink) await holdLink;
        const sent = calls[calls.length - 1]?.body ?? {};
        if (recordsWithFile.has(Number(sent['id'])) && sent['replace'] !== true) {
          return respond(409, {
            error: { code: 'CONFLICT', message: 'This record already has a file. Remove it first to replace it.' },
          });
        }
        return respond(200, { data: {} });
      }
      case '/api/v1/pm/site/hero':
        if (heroStatus !== 200) return respond(heroStatus, { error: { code: 'INTERNAL_ERROR', message: 'Nope' } });
        return respond(200, { data: { ok: true } });
      case '/api/v1/pm/site/drafts':
        return respond(200, { data: { ok: true, discardedCount: 1 } });
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
        return respond(200, { data: { blocks: [], publishedBlocks: [], latestPublishedAt: liveToken } });
      case '/api/v1/pm/site/publish/revert':
        return respond(200, { data: { ok: true } });
      case '/api/v1/pm/site/publish':
        if (publishStatus !== 200) return respond(publishStatus, { error: { code: 'CONFLICT', message: 'Conflict' } });
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
      { id: MINUTES.itemId, communityId: COMMUNITY_ID, action: 'link_document', documentId: 55, replace: true },
    ]);
  });

  it('an upload over a record that still holds a draft replaces it, so the link lands', async () => {
    // Meeting minutes is "Saved as a draft, not posted": the record holds the draft.
    recordsWithFile.add(MINUTES.itemId);
    const user = renderHome();

    await user.click(screen.getByRole('button', { name: 'Upload: Meeting minutes' }));
    (lazyProps.upload!['onUploaded'] as (id: number) => void)(57);

    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(screen.queryByText(/couldn't link it to Meeting minutes/)).not.toBeInTheDocument();
    expect(posts('/api/v1/compliance').at(-1)?.body).toMatchObject({ id: MINUTES.itemId, documentId: 57, replace: true });
  });

  it('a file just used for one record is no longer offered for another, before the refresh arrives', async () => {
    // The same budget matches two rows; the server would refuse the second link.
    const user = renderHome(
      data({}, {
        candidates: {
          [BUDGET.itemId]: [{ documentId: 31, title: '2026 Budget' }],
          [MINUTES.itemId]: [
            { documentId: 31, title: '2026 Budget' },
            { documentId: 40, title: 'March minutes' },
          ],
        },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Use 2026 Budget for Annual budget' }));
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());

    // The refresh (mocked) has not brought a new list: the row still shows, minus that file.
    const minutesRow = screen.getByText('Meeting minutes').closest('li') as HTMLElement;
    expect(within(minutesRow).queryByRole('button', { name: 'Use 2026 Budget for Meeting minutes' })).toBeNull();
    expect(within(minutesRow).getByRole('button', { name: 'Use March minutes for Meeting minutes' })).toBeInTheDocument();
  });

  it('a failed link is said once, in its row, with no toast as well', async () => {
    const { toast } = await import('sonner');
    const user = renderHome(
      data({}, { candidates: { [BUDGET.itemId]: [{ documentId: 31, title: '2026 Budget' }] } }),
    );
    vi.mocked(global.fetch).mockImplementationOnce(async () => respond(409, {
      error: { code: 'CONFLICT', message: 'This file is already posted as another record.' },
    }) as unknown as Response);

    await user.click(screen.getByRole('button', { name: 'Use 2026 Budget for Annual budget' }));

    expect(
      await screen.findByText("We couldn't link 2026 Budget to Annual budget. Please try again."),
    ).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
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

  it('while any link is in flight, no other match can be chosen', async () => {
    let release!: () => void;
    holdLink = new Promise<void>((resolve) => (release = resolve));
    const user = renderHome(
      data({}, {
        candidates: {
          [BUDGET.itemId]: [{ documentId: 31, title: '2026 Budget' }],
          [MINUTES.itemId]: [{ documentId: 31, title: '2026 Budget' }],
        },
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Use 2026 Budget for Annual budget' }));

    // The other row's match is the same file: it cannot be used while the first link runs.
    expect(screen.getByRole('button', { name: 'Use 2026 Budget for Meeting minutes' })).toBeDisabled();
    release();
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it('after a row is linked and the refresh removes it, focus moves to the Records heading', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const before = data({}, { candidates: { [BUDGET.itemId]: [{ documentId: 30, title: '2025 Budget' }] } });
    const ui = (d: WebsiteHomeData) => (
      <QueryClientProvider client={client}>
        <WebsiteHome communityId={COMMUNITY_ID} data={d} published={false} now={NOW} timeZone="America/New_York" />
      </QueryClientProvider>
    );
    const { rerender } = render(ui(before));
    const user = userEvent.setup();

    const use = screen.getByRole('button', { name: 'Use 2025 Budget for Annual budget' });
    await user.click(use);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    // The refreshed page no longer lists the budget.
    rerender(ui(data({}, { missing: [MINUTES], candidates: {} })));

    expect(screen.getByRole('heading', { level: 2, name: 'Records' })).toHaveFocus();
  });

  it('while snoozed, Show them now shows the list for this visit without changing the snooze', async () => {
    const user = renderHome(data({}, { snoozedUntil: '2026-11-02T16:00:00.000Z' }));
    expect(alert()).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Show them now' }));

    expect(alert()).not.toBeNull();
    expect(within(alert()!).getByText('Annual budget')).toBeInTheDocument();
    expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
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

    // Offerable, but the site is not public: not yet.
    renderHome(data({ liveNotice: live, sitePublished: false }));
    expect(screen.queryByText(offer)).not.toBeInTheDocument();
    cleanup();

    // A site live from creation with no publish in the log yet (Keep my current look):
    // the offer shows, because the site IS public.
    renderHome(data({ liveNotice: live, sitePublished: true, lastPublish: null }));
    expect(screen.getByText(offer)).toBeInTheDocument();
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

  it('is not a green check while records Florida requires are missing', () => {
    renderHome();

    const banner = screen.getByRole('heading', { level: 2, name: 'Your website is live' }).closest('section') as HTMLElement;
    expect(banner).toHaveTextContent('2 records Florida requires are missing.');
    expect(within(banner).getByRole('link', { name: 'See the records' })).toHaveAttribute('href', '#records');
    expect(banner.querySelector('.text-status-success')).toBeNull();
    expect(banner.querySelector('svg.text-status-warning')).not.toBeNull();
  });

  it('is a green check once nothing required is missing', () => {
    renderHome(data({}, { missing: [] }));

    const banner = screen.getByRole('heading', { level: 2, name: 'Your website is live' }).closest('section') as HTMLElement;
    expect(banner).not.toHaveTextContent(/missing/);
    expect(banner.querySelector('svg.text-status-success')).not.toBeNull();
    expect(banner.querySelector('svg.text-status-warning')).toBeNull();
  });

  it('does not warn about records where the statute only recommends them', () => {
    renderHome(data({}, { level: 'recommended' }));

    const banner = screen.getByRole('heading', { level: 2, name: 'Your website is live' }).closest('section') as HTMLElement;
    expect(banner).not.toHaveTextContent(/missing/);
  });

  it('without it, says the website is live', () => {
    renderHome();

    expect(screen.getByRole('heading', { level: 2, name: 'Your website is live' })).toBeInTheDocument();
  });

  it('your site shows the look, change look, and who published last, and no editor buttons', () => {
    renderHome();

    const section = screen.getByRole('heading', { name: 'Your site' }).closest('section') as HTMLElement;
    expect(within(section).getByText('Bayfront')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Change look' })).toHaveAttribute(
      'href',
      `/pm/website/looks?communityId=${COMMUNITY_ID}`,
    );
    expect(section).toHaveTextContent('Last published 3 days ago by Maria Lopez');
    // Option 1: the full editor is only the quiet link at the end of the page.
    expect(within(section).queryByRole('link', { name: 'Edit your site' })).toBeNull();
    expect(within(section).queryByRole('link', { name: 'Site settings' })).toBeNull();
  });

  it('ends with a quiet Advanced editor link, the one way into the full editor', () => {
    renderHome();

    const links = screen.getAllByRole('link');
    const editorLinks = links.filter((link) => link.getAttribute('href')?.startsWith('/pm/website-editor'));
    expect(editorLinks).toHaveLength(1);
    expect(editorLinks[0]).toHaveAccessibleName('Advanced editor');
    expect(editorLinks[0]).toHaveAttribute('href', `/pm/website-editor?communityId=${COMMUNITY_ID}`);
    // Last on the page, and a text link, not a button.
    expect(links[links.length - 1]).toBe(editorLinks[0]);
  });

  it('a site on a legacy layout reads "An older look"', () => {
    renderHome(data({ facts: { ...data().facts, liveLookId: null } }));

    expect(screen.getByText('An older look')).toBeInTheDocument();
  });

  it('a look chosen but not published says so, and links to the picker to publish it or keep the live one', () => {
    renderHome(data({ facts: { ...data().facts, liveLookId: 'bayfront', draftLookId: 'palm-grove' } }));

    expect(screen.getByText('Palm Grove is chosen but not published yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Publish it or keep Bayfront' })).toHaveAttribute(
      'href',
      `/pm/website/looks?communityId=${COMMUNITY_ID}`,
    );
    cleanup();

    // Over a legacy layout there is no look name to keep.
    renderHome(data({ facts: { ...data().facts, liveLookId: null, draftLookId: 'heritage' } }));
    expect(screen.getByText('Heritage is chosen but not published yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Publish it or keep your current look' })).toBeInTheDocument();
    cleanup();

    // No draft, or a draft of the look already live: nothing to say.
    renderHome(data({ facts: { ...data().facts, liveLookId: 'bayfront', draftLookId: 'bayfront' } }));
    expect(screen.queryByText(/is chosen but not published yet/)).not.toBeInTheDocument();
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
    renderHome(data({ previousSnapshotId: null }));

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
    // Unpublished edits (pages included) are cleared first, then the version
    // named at page load is staged and published under the page-load token.
    expect(calls.filter((call) => call.method !== 'GET').map((call) => [call.method, call.path, call.body])).toEqual([
      ['DELETE', '/api/v1/pm/site/drafts', { communityId: COMMUNITY_ID }],
      ['POST', '/api/v1/pm/site/publish/revert', { communityId: COMMUNITY_ID, snapshotId: 29 }],
      ['POST', '/api/v1/pm/site/publish', { communityId: COMMUNITY_ID, expectedPublishedAt: '2026-10-26T16:00:00.000Z' }],
    ]);
  });

  it('the confirm counts the unpublished edits a restore discards', async () => {
    let user = renderHome(data({ facts: { ...data().facts, pendingDraftCount: 3 } }));
    await user.click(screen.getByRole('button', { name: 'Restore previous version' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Your site goes back to how it was before the last publish. 3 unpublished edits are discarded.',
    );
    cleanup();

    user = renderHome(data({ facts: { ...data().facts, pendingDraftCount: 1 } }));
    await user.click(screen.getByRole('button', { name: 'Restore previous version' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Your site goes back to how it was before the last publish. 1 unpublished edit is discarded.',
    );
  });

  it('the confirm names a drafted look, since a restore discards it too', async () => {
    const drafted = { ...data().facts, liveLookId: 'bayfront' as const, draftLookId: 'palm-grove' as const };
    const confirmText = async (pendingDraftCount: number) => {
      const user = renderHome(data({ facts: { ...drafted, pendingDraftCount } }));
      await user.click(screen.getByRole('button', { name: 'Restore previous version' }));
      const text = screen.getByRole('alertdialog').textContent;
      cleanup();
      return text;
    };

    expect(await confirmText(3)).toContain(
      'Your site goes back to how it was before the last publish. Palm Grove and 3 unpublished edits are discarded.',
    );
    expect(await confirmText(1)).toContain('Palm Grove and 1 unpublished edit are discarded.');
    expect(await confirmText(0)).toContain('Palm Grove is discarded.');
  });

  it('refuses, writing nothing, when someone published since the page opened', async () => {
    liveToken = '2026-10-28T09:00:00.000Z';
    const user = renderHome();

    await user.click(screen.getByRole('button', { name: 'Restore previous version' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Restore' }));

    expect(
      await screen.findByText('Someone published the site since this page opened. Reload the page and try again.'),
    ).toBeInTheDocument();
    expect(calls.filter((call) => call.method !== 'GET')).toEqual([]);
  });

  it('a publish refused after the revert says the site was not changed, and clears the staged version', async () => {
    publishStatus = 409;
    const user = renderHome();

    await user.click(screen.getByRole('button', { name: 'Restore previous version' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Restore' }));

    expect(await screen.findByText("Your site wasn't changed. Unpublished edits were cleared.")).toBeInTheDocument();
    expect(calls.filter((call) => call.method !== 'GET').map((call) => `${call.method} ${call.path}`)).toEqual([
      'DELETE /api/v1/pm/site/drafts',
      'POST /api/v1/pm/site/publish/revert',
      'POST /api/v1/pm/site/publish',
      'DELETE /api/v1/pm/site/drafts',
    ]);
  });
});

describe('the welcome (Edit words / Change photo)', () => {
  const welcome = () => screen.getByRole('heading', { level: 2, name: 'Your welcome' }).closest('section') as HTMLElement;
  const heroPatches = () => posts('/api/v1/pm/site/hero');

  it('shows the welcome as visitors read it, never a {{token}}, beside a preview of the site', () => {
    renderHome();

    const section = welcome();
    expect(section).toHaveTextContent('Welcome to Sunset Condos');
    expect(section).toHaveTextContent('Homes in Miami.');
    expect(section).not.toHaveTextContent('{{');
    expect(within(section).getByTestId('look-preview-frame')).toHaveAttribute(
      'src',
      `/pm/site-preview?communityId=${COMMUNITY_ID}&preview=true`,
    );
  });

  it('Edit words prefills the two fields with the resolved words', async () => {
    const user = renderHome();

    await user.click(within(welcome()).getByRole('button', { name: 'Edit words' }));

    expect(screen.getByLabelText(/Headline/)).toHaveValue('Welcome to Sunset Condos');
    expect(screen.getByLabelText('Subtitle')).toHaveValue('Homes in Miami.');
    expect(screen.getByLabelText(/Headline/)).toHaveFocus();
  });

  it('saving sends the new words live, keeping the untouched field linked, and offers Undo', async () => {
    const user = renderHome();
    await user.click(within(welcome()).getByRole('button', { name: 'Edit words' }));
    await user.clear(screen.getByLabelText(/Headline/));
    await user.type(screen.getByLabelText(/Headline/), 'Hello, neighbors');

    await user.click(screen.getByRole('button', { name: 'Save and publish' }));

    await waitFor(() => expect(heroPatches()).toHaveLength(1));
    expect(heroPatches()[0]?.body).toEqual({
      communityId: COMMUNITY_ID,
      live: true,
      headline: 'Hello, neighbors',
      // Left as it was, so it keeps tracking the city.
      subtitle: 'Homes in {{city}}.',
    });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(toastMock.success).toHaveBeenCalledWith(
      'Your new welcome words are live.',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    );
    expect(within(welcome()).getByRole('status')).toHaveTextContent('Your new welcome words are live.');
    // Focus goes back to the button that opened the form.
    expect(within(welcome()).getByRole('button', { name: 'Edit words' })).toHaveFocus();
  });

  it('Undo saves the previous welcome back, exactly as it was stored', async () => {
    const user = renderHome();
    await user.click(within(welcome()).getByRole('button', { name: 'Edit words' }));
    await user.clear(screen.getByLabelText('Subtitle'));
    await user.click(screen.getByRole('button', { name: 'Save and publish' }));
    await waitFor(() => expect(heroPatches()).toHaveLength(1));
    expect(heroPatches()[0]?.body).toEqual({ communityId: COMMUNITY_ID, live: true, headline: 'Welcome to {{name}}' });

    await user.click(within(welcome()).getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(heroPatches()).toHaveLength(2));
    expect(heroPatches()[1]?.body).toEqual({
      communityId: COMMUNITY_ID,
      live: true,
      headline: 'Welcome to {{name}}',
      subtitle: 'Homes in {{city}}.',
    });
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenLastCalledWith('Your previous welcome is back.'),
    );
    // The save's toast, with its Undo, is closed rather than left offering an undo of the undo.
    expect(toastMock.dismiss).toHaveBeenCalledWith(toastMock.success.mock.results[0]?.value);
  });

  it('the toast Undo does the same', async () => {
    const user = renderHome();
    await user.click(within(welcome()).getByRole('button', { name: 'Edit words' }));
    await user.type(screen.getByLabelText(/Headline/), '!');
    await user.click(screen.getByRole('button', { name: 'Save and publish' }));
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    const options = toastMock.success.mock.calls[0]?.[1] as { action: { onClick: () => void } };

    options.action.onClick();

    await waitFor(() => expect(heroPatches()).toHaveLength(2));
    expect(heroPatches()[1]?.body).toMatchObject({ headline: 'Welcome to {{name}}', subtitle: 'Homes in {{city}}.' });
  });

  it('refuses an empty headline without saving', async () => {
    const user = renderHome();
    await user.click(within(welcome()).getByRole('button', { name: 'Edit words' }));
    await user.clear(screen.getByLabelText(/Headline/));

    await user.click(screen.getByRole('button', { name: 'Save and publish' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Add a headline.');
    expect(heroPatches()).toHaveLength(0);
  });

  it('a failed save keeps the form open and says so', async () => {
    heroStatus = 500;
    const user = renderHome();
    await user.click(within(welcome()).getByRole('button', { name: 'Edit words' }));
    await user.type(screen.getByLabelText(/Headline/), '!');

    await user.click(screen.getByRole('button', { name: 'Save and publish' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't save that just now.");
    expect(screen.getByLabelText(/Headline/)).toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('Cancel closes the form without saving', async () => {
    const user = renderHome();
    await user.click(within(welcome()).getByRole('button', { name: 'Edit words' }));

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText(/Headline/)).toBeNull();
    expect(heroPatches()).toHaveLength(0);
    expect(within(welcome()).getByRole('button', { name: 'Edit words' })).toHaveFocus();
  });

  it('Change photo saves the photo list live and drops the legacy single image', async () => {
    const user = renderHome(
      data({
        liveHero: {
          headline: 'Welcome to {{name}}',
          heroImagePath: `${COMMUNITY_ID}/hero/old.webp`,
          heroImageAlt: 'The pool',
        },
      }),
    );
    await user.click(within(welcome()).getByRole('button', { name: 'Change photo' }));
    expect(screen.getByRole('heading', { name: 'Change photo' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Save and publish' }));

    await waitFor(() => expect(heroPatches()).toHaveLength(1));
    expect(heroPatches()[0]?.body).toEqual({
      communityId: COMMUNITY_ID,
      live: true,
      headline: 'Welcome to {{name}}',
      photos: [{ path: `${COMMUNITY_ID}/hero/old.webp`, alt: 'The pool' }],
    });
  });

  it('Change photo will not save while a picked photo has not uploaded, so it is never dropped', async () => {
    const user = renderHome();
    await user.click(within(welcome()).getByRole('button', { name: 'Change photo' }));
    await user.click(screen.getByRole('button', { name: 'Pick a file' }));

    await user.click(screen.getByRole('button', { name: 'Save and publish' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Upload the photo you picked first, or remove it.');
    expect(heroPatches()).toHaveLength(0);
  });

  it('with no welcome yet, saving words creates one and offers no Undo', async () => {
    const user = renderHome(data({ liveHero: null }));
    expect(welcome()).toHaveTextContent('Sunset Condos');
    await user.click(within(welcome()).getByRole('button', { name: 'Edit words' }));
    await user.type(screen.getByLabelText('Subtitle'), 'On the beach.');

    await user.click(screen.getByRole('button', { name: 'Save and publish' }));

    await waitFor(() => expect(heroPatches()).toHaveLength(1));
    expect(heroPatches()[0]?.body).toEqual({
      communityId: COMMUNITY_ID,
      live: true,
      headline: '{{name}}',
      subtitle: 'On the beach.',
    });
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith('Your new welcome words are live.'),
    );
    expect(within(welcome()).queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('lists what is filled in for you, what each shows, and where it comes from', () => {
    renderHome();

    const list = screen.getByRole('list', { name: 'Filled in for you' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Meetings1 upcoming meeting'),
      expect.stringContaining('NewsNothing yet'),
      expect.stringContaining('Records9 of 12 posted'),
      expect.stringContaining('ContactYour address, email'),
    ]);
    expect(within(list).getByRole('link', { name: /Open Meetings/ })).toHaveAttribute(
      'href',
      `/communities/${COMMUNITY_ID}/meetings`,
    );
    expect(within(list).getByRole('link', { name: /Open Announcements/ })).toHaveAttribute(
      'href',
      `/announcements?communityId=${COMMUNITY_ID}`,
    );
    expect(within(list).getByRole('link', { name: /Open Documents/ })).toHaveAttribute(
      'href',
      `/communities/${COMMUNITY_ID}/documents`,
    );
    expect(within(list).getByRole('link', { name: /Open Community profile/ })).toHaveAttribute(
      'href',
      `/settings?communityId=${COMMUNITY_ID}#community-profile`,
    );
  });
});

describe('contact details', () => {
  const details = () => screen.getByRole('heading', { name: 'Details on your site' }).closest('section') as HTMLElement;

  it('asks for the missing phone in one line, and keeps the link to Settings', () => {
    renderHome();

    expect(details()).toHaveTextContent('Add a phone number so people can call the association.');
    expect(within(details()).getByRole('link', { name: 'Edit in Community profile' })).toHaveAttribute(
      'href',
      `/settings?communityId=${COMMUNITY_ID}#community-profile`,
    );
  });

  it('asks for both when phone and email are empty, and for neither when both are set', () => {
    const profile = data().facts.profile;
    renderHome(data({ facts: { ...data().facts, profile: { ...profile, contactEmail: null } } }));
    expect(details()).toHaveTextContent('Add a phone number and email so people can reach the association.');
    cleanup();

    renderHome(data({ facts: { ...data().facts, profile: { ...profile, contactPhone: '305-555-0100' } } }));
    expect(details()).not.toHaveTextContent(/Add a phone|Add an email/);
  });
});

describe('records progress', () => {
  it('counts the records posted of those owed, above one compact list', () => {
    renderHome();

    const section = screen.getByRole('heading', { level: 2, name: 'Records' }).closest('section') as HTMLElement;
    expect(section).toHaveTextContent('9 of 12 records posted');
    // One list for the missing records, a row each.
    const missingList = within(alert()!).getAllByRole('list')[0] as HTMLElement;
    expect(within(missingList).getAllByRole('listitem', { name: undefined }).filter((li) => li.parentElement === missingList)).toHaveLength(2);
  });
});
