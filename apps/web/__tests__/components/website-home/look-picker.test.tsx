/**
 * The look picker (website builder, Phase 4; spec C1, D9).
 *
 * The picker runs with its REAL hook (`useSiteLook`) over a mocked `fetch`, so
 * "saves a draft and publishes nothing" is asserted on the wire: which requests
 * leave the page, with which method and body. Only the router and the toast
 * are mocked.
 *
 * The page's own tests (its gates, and the checklist tick on a visit) call the
 * server component and read the element it returns; nothing renders there.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { SiteFacts } from '@/lib/services/website-home-service';

const {
  pushMock,
  refreshMock,
  toastErrorMock,
  redirectMock,
  requireAuthMock,
  requireMembershipMock,
  featuresMock,
  tryAutoCompleteMock,
  loadSiteFactsMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  toastErrorMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    // Mirror next/navigation: redirect() throws to halt rendering.
    const err = new Error(`NEXT_REDIRECT:${url}`);
    (err as Error & { digest?: string }).digest = `NEXT_REDIRECT;${url}`;
    throw err;
  }),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  featuresMock: vi.fn(),
  tryAutoCompleteMock: vi.fn(),
  loadSiteFactsMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
  redirect: redirectMock,
}));
vi.mock('sonner', () => ({ toast: { error: toastErrorMock, success: vi.fn() } }));
// The page's server-side edges. The role check stays real (DB-free).
vi.mock('@/lib/request/page-auth-context', () => ({ requirePageAuthenticatedUserId: requireAuthMock }));
vi.mock('@/lib/request/page-community-context', () => ({
  requirePageCommunityMembership: requireMembershipMock,
}));
vi.mock('@/lib/middleware/plan-guard', () => ({ getEffectiveFeaturesForPage: featuresMock }));
vi.mock('@/lib/services/onboarding-checklist-service', () => ({ tryAutoComplete: tryAutoCompleteMock }));
vi.mock('@/lib/services/website-home-service', () => ({ loadSiteFacts: loadSiteFactsMock }));

import { LookPicker } from '@/components/website-home/look-picker';
import LookPickerPage from '@/app/(authenticated)/pm/website/looks/page';

const COMMUNITY_ID = 42;
const TOKEN = '2026-10-01T12:00:00.000Z';
const PUBLISHED_AT = '2026-10-29T15:04:05.000Z';

function facts(over: Partial<SiteFacts> = {}): SiteFacts {
  return {
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
      contactEmail: null,
      contactPhone: null,
    },
    communityType: 'condo_718',
    upcomingMeetingCount: 2,
    newsCount: 50,
    recordsPosted: 9,
    recordsTotal: 12,
    liveLookId: 'bayfront',
    draftLookId: null,
    pendingDraftCount: 0,
    siteUrl: 'https://sunset-condos.example.com/',
    ...over,
  };
}

const fetchMock = vi.fn();

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ data }) };
}

/** Requests that left the page, without the publish-token read. */
function writes(): Array<{ method: string; url: string; body: unknown }> {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method && init.method !== 'GET')
    .map(([url, init]) => ({ method: init.method, url, body: JSON.parse(init.body) }));
}

function renderPicker(f: SiteFacts = facts()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<LookPicker communityId={COMMUNITY_ID} facts={f} />, { wrapper });
}

const card = (name: RegExp) => screen.getByRole('button', { name });
const publishButton = () => screen.getByRole('button', { name: 'Publish this look' });

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (!init?.method || init.method === 'GET') {
      return ok({ blocks: [], publishedBlocks: [], latestPublishedAt: TOKEN });
    }
    const body = JSON.parse(String(init.body));
    if (init.method === 'POST') return ok({ publishedAt: PUBLISHED_AT, lookId: body.lookId });
    return ok('keepCurrent' in body ? { ok: true } : { replaced: 1, kept: 0, added: 0, removed: 0 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('LookPicker — what it shows', () => {
  it('names the community, the live look, and what is filled in for it', () => {
    renderPicker(facts({ pendingDraftCount: 3 }));

    expect(
      screen.getByRole('heading', { level: 2, name: "Pick a look for Sunset Condos's website" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your site is already live with Bayfront. You can change anything later.'),
    ).toBeInTheDocument();
    const chips = within(screen.getByRole('region', { name: 'Filled in for you' })).getAllByRole('listitem');
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'Sunset Condos · 100 Ocean Dr, Miami, FL 33139',
      '40 units · Condominium',
      '2 upcoming meetings · 50+ news posts',
      '9 of 12 records found in Documents',
      'Welcome photo and message',
    ]);
    expect(screen.getByRole('link', { name: 'Change these in your Community profile' })).toHaveAttribute(
      'href',
      `/settings?communityId=${COMMUNITY_ID}#community-profile`,
    );
    expect(screen.getByText('Nothing changes until you click Publish')).toBeInTheDocument();
    expect(screen.getByText("You also have 3 unpublished edits. They'll publish too.")).toBeInTheDocument();
  });

  it('shows no records chip for an apartment community, and no edits line with none pending', () => {
    renderPicker(facts({ communityType: 'apartment', recordsPosted: 0, recordsTotal: 0 }));

    expect(screen.queryByText(/records found in Documents/)).not.toBeInTheDocument();
    expect(screen.getByText('40 units · Apartments')).toBeInTheDocument();
    expect(screen.queryByText(/unpublished edit/)).not.toBeInTheDocument();
  });

  it('the picker opens on the draft look when there is one, else the live look', () => {
    const { unmount } = renderPicker(facts({ draftLookId: 'heritage' }));
    expect(card(/^Heritage, selected$/)).toBeInTheDocument();
    expect(card(/^Bayfront, live now$/)).toBeInTheDocument();
    unmount();

    renderPicker(facts({ draftLookId: null }));
    expect(card(/^Bayfront, selected, live now$/)).toBeInTheDocument();
    expect(card(/^Heritage$/)).toBeInTheDocument();
  });

  it('says the site uses an older look when the live layout is not a look', () => {
    renderPicker(facts({ liveLookId: null }));

    expect(screen.getByText('Your site uses an older look')).toBeInTheDocument();
    expect(screen.getByText('Your site is already live. You can change anything later.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /selected|live now/ })).not.toBeInTheDocument();
    expect(publishButton()).toBeDisabled();
  });

  it('preview frames are inert and out of the tab order', () => {
    renderPicker(facts({ draftLookId: 'heritage' }));

    const frames = screen.getAllByTestId('look-preview-frame');
    // One per card, and the large preview.
    expect(frames).toHaveLength(5);
    for (const frame of frames) {
      expect(frame.tagName).toBe('IFRAME');
      expect(frame).toHaveAttribute('inert');
      expect(frame).toHaveAttribute('aria-hidden', 'true');
      expect(frame).toHaveAttribute('tabindex', '-1');
      expect(frame).toHaveAttribute('loading', 'lazy');
    }
    expect(frames.map((frame) => frame.getAttribute('src'))).toEqual([
      `/pm/site-preview?communityId=${COMMUNITY_ID}&look=bayfront&preview=true`,
      `/pm/site-preview?communityId=${COMMUNITY_ID}&look=heritage&preview=true`,
      `/pm/site-preview?communityId=${COMMUNITY_ID}&look=palm-grove&preview=true`,
      `/pm/site-preview?communityId=${COMMUNITY_ID}&look=plain-simple&preview=true`,
      `/pm/site-preview?communityId=${COMMUNITY_ID}&look=heritage&preview=true`,
    ]);
    // Open full preview is the large preview, in a new tab.
    const full = screen.getByRole('link', { name: /Open full preview/ });
    expect(full).toHaveAttribute('href', `/pm/site-preview?communityId=${COMMUNITY_ID}&look=heritage&preview=true`);
    expect(full).toHaveAttribute('target', '_blank');
  });

  it('switches the large preview between computer and phone width', async () => {
    const user = userEvent.setup();
    renderPicker();
    const computer = screen.getByRole('button', { name: 'Computer' });
    const phone = screen.getByRole('button', { name: 'Phone' });
    expect(screen.getByRole('group', { name: 'Preview size' })).toBeInTheDocument();
    expect(computer).toHaveAttribute('aria-pressed', 'true');

    await user.click(phone);

    expect(phone).toHaveAttribute('aria-pressed', 'true');
    expect(computer).toHaveAttribute('aria-pressed', 'false');
    const large = screen.getAllByTestId('look-preview-frame').at(-1)!;
    expect(large).toHaveStyle({ width: '390px' });
  });
});

describe('LookPicker — choosing and publishing', () => {
  it('selecting a look saves a draft and publishes nothing', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(card(/^Palm Grove$/));

    await waitFor(() =>
      expect(writes()).toEqual([
        { method: 'PATCH', url: '/api/v1/pm/site/look', body: { communityId: COMMUNITY_ID, lookId: 'palm-grove' } },
      ]),
    );
    expect(card(/^Palm Grove, selected$/)).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('drafts two quick choices one at a time, in the order they were made', async () => {
    const user = userEvent.setup();
    let releaseFirst!: () => void;
    const firstHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH' && JSON.parse(String(init.body)).lookId === 'heritage') await firstHeld;
      return base(url, init);
    });
    renderPicker();

    await user.click(card(/^Heritage$/));
    await user.click(card(/^Palm Grove$/));

    // The second waits for the first, so the drafts cannot land out of order.
    expect(writes().map((w) => (w.body as { lookId: string }).lookId)).toEqual(['heritage']);
    releaseFirst();
    await waitFor(() =>
      expect(writes().map((w) => (w.body as { lookId: string }).lookId)).toEqual(['heritage', 'palm-grove']),
    );
    expect(card(/^Palm Grove, selected$/)).toBeInTheDocument();
  });

  it('sends nothing when the chosen look is clicked again', async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(card(/^Bayfront, selected, live now$/));

    expect(writes()).toEqual([]);
  });

  it('puts the card back and says why when the draft is refused', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return ok({ blocks: [], publishedBlocks: [], latestPublishedAt: TOKEN });
      }
      return { ok: false, status: 403, json: async () => ({ error: { code: 'FORBIDDEN', message: 'Not allowed' } }) };
    });
    renderPicker();

    await user.click(card(/^Heritage$/));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Not allowed'));
    expect(card(/^Bayfront, selected, live now$/)).toBeInTheDocument();
  });

  it('Publish is disabled while the live look is selected', async () => {
    const user = userEvent.setup();
    renderPicker();

    expect(publishButton()).toBeDisabled();

    await user.click(card(/^Heritage$/));
    await waitFor(() => expect(publishButton()).toBeEnabled());

    await user.click(card(/^Bayfront, live now$/));
    expect(publishButton()).toBeDisabled();
  });

  it('publishes the chosen look with the publish token, then opens the website home', async () => {
    const user = userEvent.setup();
    renderPicker(facts({ draftLookId: 'heritage' }));

    await waitFor(() => expect(publishButton()).toBeEnabled());
    await user.click(publishButton());

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(`/pm/website?communityId=${COMMUNITY_ID}&published=1`),
    );
    expect(writes()).toEqual([
      {
        method: 'POST',
        url: '/api/v1/pm/site/look',
        body: { communityId: COMMUNITY_ID, lookId: 'heritage', expectedPublishedAt: TOKEN },
      },
    ]);
  });

  it('says why a publish was refused, and stays on the picker', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return ok({ blocks: [], publishedBlocks: [], latestPublishedAt: TOKEN });
      }
      return {
        ok: false,
        status: 409,
        json: async () => ({ error: { code: 'CONFLICT', message: 'Another editor published changes.' } }),
      };
    });
    renderPicker(facts({ draftLookId: 'heritage' }));

    await waitFor(() => expect(publishButton()).toBeEnabled());
    await user.click(publishButton());

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Another editor published changes.'));
    expect(pushMock).not.toHaveBeenCalled();
    // Published elsewhere: the page reloads its facts and the publish token.
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it('does not reload the page for a refusal that is not a conflict', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return ok({ blocks: [], publishedBlocks: [], latestPublishedAt: TOKEN });
      }
      return { ok: false, status: 403, json: async () => ({ error: { code: 'FORBIDDEN', message: 'Not allowed' } }) };
    });
    renderPicker(facts({ draftLookId: 'heritage' }));

    await waitFor(() => expect(publishButton()).toBeEnabled());
    await user.click(publishButton());

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Not allowed'));
    expect(refreshMock).not.toHaveBeenCalled();
  });

  const KEEP = { communityId: COMMUNITY_ID, keepCurrent: true, withdrawDraftedLook: true };

  it('Keep this look keeps the live look, taking a chosen card back off, and opens the website home', async () => {
    const user = userEvent.setup();
    renderPicker(facts({ draftLookId: 'heritage' }));

    await user.click(screen.getByRole('button', { name: 'Keep this look' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(`/pm/website?communityId=${COMMUNITY_ID}`));
    expect(writes()).toEqual([{ method: 'PATCH', url: '/api/v1/pm/site/look', body: KEEP }]);
  });

  it('Keep this look over an older layout with a look drafted takes the look back off too', async () => {
    // No card stands for the live layout, so the withdraw is asked of the server,
    // which plans the way back from the live rows rather than from a look.
    const user = userEvent.setup();
    renderPicker(facts({ liveLookId: null, draftLookId: 'heritage' }));
    const keepButton = screen.getByRole('button', { name: 'Keep this look' });
    expect(keepButton).toBeEnabled();

    await user.click(keepButton);

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(`/pm/website?communityId=${COMMUNITY_ID}`));
    expect(writes()).toEqual([{ method: 'PATCH', url: '/api/v1/pm/site/look', body: KEEP }]);
  });

  it('holds the cards and Publish still from the click on Keep until the page moves on', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH' && 'keepCurrent' in JSON.parse(String(init.body))) await held;
      return base(url, init);
    });
    renderPicker(facts({ draftLookId: 'heritage' }));
    await waitFor(() => expect(publishButton()).toBeEnabled());

    await user.click(screen.getByRole('button', { name: 'Keep this look' }));

    expect(publishButton()).toBeDisabled();
    for (const name of [/^Bayfront/, /^Heritage/, /^Palm Grove/, /^Plain & Simple/]) {
      expect(card(name)).toBeDisabled();
    }
    release();
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    // Still held after success: the page is on its way to the website home.
    expect(publishButton()).toBeDisabled();
  });

  it('lets the cards be used again when keeping fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === 'GET') {
        return ok({ blocks: [], publishedBlocks: [], latestPublishedAt: TOKEN });
      }
      return { ok: false, status: 403, json: async () => ({ error: { code: 'FORBIDDEN', message: 'Not allowed' } }) };
    });
    renderPicker(facts({ draftLookId: 'heritage' }));

    await user.click(screen.getByRole('button', { name: 'Keep this look' }));

    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Not allowed'));
    expect(card(/^Bayfront/)).toBeEnabled();
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe('LookPicker — layout', () => {
  it('every control above the publish bar scrolls clear of it when focused', () => {
    // The bar is sticky at the bottom of the page's scroller: a control scrolled
    // into view by Tab stops at its bottom edge, so without a bottom scroll margin
    // taller than the bar it lands underneath it (WCAG 2.4.11).
    renderPicker();
    const bar = screen.getByTestId('publish-bar');
    const focusables = Array.from(
      document.querySelectorAll<HTMLElement>('a[href], button, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => !bar.contains(el));

    // The profile link, four cards, two size buttons, the preview box.
    expect(focusables).toHaveLength(8);
    for (const el of focusables) {
      expect({ el: el.outerHTML.slice(0, 60), classes: el.className.split(/\s+/) }).toEqual({
        el: el.outerHTML.slice(0, 60),
        classes: expect.arrayContaining(['scroll-mb-56', 'md:scroll-mb-28']),
      });
    }
  });

  it('thumbnails take their width from the card, so the cards reflow at 320 px', () => {
    renderPicker();
    const cards = screen.getAllByRole('listitem').filter((li) => li.querySelector('[data-testid="look-preview-frame"]'));
    expect(cards).toHaveLength(4);

    for (const li of cards) {
      // A grid item may shrink below its content.
      expect(li).toHaveClass('min-w-0');
      const wrapper = li.querySelector('[data-testid="look-preview-frame"]')!.parentElement!;
      // No fixed pixel width: the card's width, at the page's proportions.
      expect(wrapper.style.width).toBe('');
      expect(wrapper).toHaveClass('w-full', 'max-w-full');
      expect(wrapper.style.aspectRatio).toBe('1120 / 800');
    }
  });
});

// ── The page ──────────────────────────────────────────────────────────────

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: COMMUNITY_ID,
  communityName: 'Sunset Condos',
  role: 'property_manager' as const,
  communityType: 'condo_718' as const,
  subscriptionPlan: 'professional',
  subscriptionStatus: 'active',
  subscriptionCanceledAt: null,
  subscriptionCurrentPeriodEndAt: null,
  freeAccessExpiresAt: null,
  isUnitOwner: false,
  isAdmin: true,
  designation: null,
};

/** Runs the page; returns the element it renders, or the redirect target. */
async function runPage(communityId: unknown): Promise<{ element: unknown } | { redirect: string }> {
  try {
    const element = await LookPickerPage({
      searchParams: Promise.resolve({ communityId } as Record<string, string>),
    });
    return { element };
  } catch (err) {
    const digest = (err as Error & { digest?: string }).digest;
    if (digest?.startsWith('NEXT_REDIRECT;')) return { redirect: digest.slice('NEXT_REDIRECT;'.length) };
    throw err;
  }
}

function findProps(node: unknown, type: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProps(child, type);
      if (found) return found;
    }
    return null;
  }
  const element = node as { type?: unknown; props?: Record<string, unknown> };
  if (element.type === type) return element.props ?? null;
  return findProps(element.props?.['children'], type);
}

describe('the look picker page', () => {
  beforeEach(() => {
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ ...MEMBERSHIP });
    featuresMock.mockResolvedValue({ hasSiteEditor: true });
    tryAutoCompleteMock.mockResolvedValue(undefined);
    loadSiteFactsMock.mockResolvedValue(facts());
  });

  it('visiting the picker completes customize_portal', async () => {
    const result = await runPage('42');

    expect('element' in result).toBe(true);
    expect(tryAutoCompleteMock).toHaveBeenCalledWith(COMMUNITY_ID, 'user-1', 'customize_portal');
  });

  it('renders the picker over the loader’s facts, under a page title', async () => {
    const result = await runPage('42');
    const { PageHeader } = await import('@/components/shared/page-header');

    const element = (result as { element: unknown }).element;
    expect(findProps(element, PageHeader)).toMatchObject({ title: 'Pick a look' });
    expect(findProps(element, LookPicker)).toEqual({ communityId: COMMUNITY_ID, facts: facts() });
    expect(loadSiteFactsMock).toHaveBeenCalledWith(COMMUNITY_ID);
  });

  it.each([
    ['a resident', () => requireMembershipMock.mockResolvedValue({ ...MEMBERSHIP, role: 'resident' }),
      '/pm/dashboard/communities?reason=invalid-selection'],
    ['a plan without the website editor', () => featuresMock.mockResolvedValue({ hasSiteEditor: false }),
      '/pm/dashboard/communities?reason=feature-unavailable'],
    ['a lapsed subscription', () => requireMembershipMock.mockResolvedValue({
      ...MEMBERSHIP,
      subscriptionStatus: 'canceled',
      subscriptionCanceledAt: new Date('2020-01-01T00:00:00Z'),
    }), '/pm/dashboard/communities?reason=subscription-lapsed'],
  ])('redirects %s, and ticks nothing', async (_label, arrange, target) => {
    arrange();

    expect(await runPage('42')).toEqual({ redirect: target });
    expect(tryAutoCompleteMock).not.toHaveBeenCalled();
    expect(loadSiteFactsMock).not.toHaveBeenCalled();
  });

  it('redirects without a valid community, and a signed-out visitor to sign in', async () => {
    expect(await runPage('nope')).toEqual({ redirect: '/pm/dashboard/communities?reason=invalid-selection' });

    requireAuthMock.mockRejectedValueOnce(new Error('no session'));
    expect(await runPage('42')).toEqual({ redirect: '/auth/login' });
    expect(tryAutoCompleteMock).not.toHaveBeenCalled();
  });
});
