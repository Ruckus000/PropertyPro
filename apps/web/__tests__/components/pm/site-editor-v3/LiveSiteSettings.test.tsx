/**
 * The site settings that take effect when saved, on the website overview's
 * Settings tab (design D): what each card holds, the copyable address, who can
 * see what, and an axe audit. They moved here from the editor's Site settings;
 * the forms inside have their own suites (SitePanel, DomainPanel,
 * UrgentNoticePanel, LogosSection, PageSeoCard).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { toastMock, useCustomDomainMock } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn() },
  useCustomDomainMock: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/hooks/use-site-settings', () => ({
  useSiteSettings: () => ({
    data: {
      settings: {
        seoTitle: null,
        seoDescription: null,
        searchIndexing: true,
        favicon: null,
        shareImage: null,
      },
      footer: { associationName: null, note: null, showStatutoryLine: false },
      storage: { assetsBytesUsed: 1024, quotaBytes: 500 * 1024 * 1024 },
    },
  }),
  useUpdateSiteSettings: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadFavicon: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadShareImage: () => ({ mutate: vi.fn(), isPending: false }),
  siteSettingsQueryKey: (communityId: number) => ['pm', 'site', 'settings', communityId] as const,
}));

// The "Page by page" card's list and save (its own suite is PageSeoCard.test.tsx).
// One sub-page, so the card renders its form.
vi.mock('@/hooks/use-site-pages', () => ({
  useSitePages: () => ({
    data: [
      { id: 1, name: 'Home', slug: '', inNav: true, sortOrder: 0, isHome: true, isDraft: false,
        publishedAt: null, deleteStagedAt: null, seoTitle: null, seoDescription: null },
      { id: 2, name: 'About', slug: 'about', inNav: true, sortOrder: 1, isHome: false, isDraft: false,
        publishedAt: null, deleteStagedAt: null, seoTitle: null, seoDescription: null },
    ],
  }),
  useUpdateSitePage: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-custom-domain', () => ({
  useCustomDomain: useCustomDomainMock,
  useSetDomain: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useVerifyDomain: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useRemoveDomain: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useCheckDomainAvailability: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null,
    data: undefined,
  }),
}));

// The notice and logos have their own suites; these stand-ins echo what the
// settings hand them.
vi.mock('@/components/pm/site-editor-v3/panels/UrgentNoticePanel', () => ({
  UrgentNoticePanel: (props: { communityId: number; hasPublishedSite: boolean }) => (
    <p data-testid="notice-panel-stand-in">
      Notice panel for community {props.communityId}, published {String(props.hasPublishedSite)}
    </p>
  ),
}));
vi.mock('@/components/pm/site-editor-v3/panels/LogosSection', () => ({
  LogosSection: (props: { communityId: number }) => <p>Logos section for community {props.communityId}</p>,
}));

import { LiveSiteSettings } from '@/components/pm/site-editor-v3/settings/LiveSiteSettings';

function renderSettings(props: Partial<React.ComponentProps<typeof LiveSiteSettings>> = {}) {
  return render(
    <LiveSiteSettings
      communityId={42}
      community={{ name: 'Sunset Condos', slug: 'sunset-condos', communityType: 'condo_718' }}
      tagline={null}
      publicSiteUrl="https://sunset-condos.getpropertypro.com/"
      hasSiteCustomDomain={false}
      hasPublishedSite
      initialNotice={null}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useCustomDomainMock.mockReturnValue({ data: { status: 'none' }, isPending: false, isError: false });
});

describe('LiveSiteSettings — what it holds', () => {
  it('opens with the urgent notice, handed whether the site is published', () => {
    renderSettings({ hasPublishedSite: false });
    const cards = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(cards[0]).toBe('Urgent notice');
    expect(screen.getByTestId('notice-panel-stand-in')).toHaveTextContent(
      'Notice panel for community 42, published false',
    );
  });

  it('shows the site name, icon, storage and footer', () => {
    renderSettings();
    expect(screen.getByTestId('settings-site-name')).toHaveTextContent('Sunset Condos');
    expect(screen.getByLabelText('Site icon')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Photo storage used' })).toBeInTheDocument();
    expect(screen.getByLabelText('Footer note')).toBeInTheDocument();
  });

  it('holds the logos, which save live', () => {
    renderSettings();
    expect(screen.getByText('Logos section for community 42')).toBeInTheDocument();
  });

  it('holds search results, the sharing image and page by page', () => {
    renderSettings();
    expect(screen.getByLabelText('Page title')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sharing image' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Page by page' })).toBeInTheDocument();
    // The page fallback is the site description as the public page computes it.
    expect(screen.getByLabelText('Title', { selector: '#page-seo-title' })).toHaveAttribute(
      'placeholder',
      'About · Sunset Condos',
    );
  });

  it('holds your own domain', () => {
    renderSettings();
    expect(useCustomDomainMock).toHaveBeenCalledWith(42, undefined, { enabled: false });
    expect(screen.getByRole('heading', { name: 'Use your own domain' })).toBeInTheDocument();
  });
});

describe('LiveSiteSettings — address', () => {
  it('shows the PropertyPro address and copies the full URL', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderSettings();

    expect(screen.getByTestId('settings-address')).toHaveTextContent('sunset-condos.getpropertypro.com');
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('https://sunset-condos.getpropertypro.com/');
    expect(toastMock.success).toHaveBeenCalledWith('Copied.');
  });

  it('says so when the address is not known, and offers no Copy', () => {
    renderSettings({ publicSiteUrl: null });
    expect(screen.queryByTestId('settings-address')).not.toBeInTheDocument();
    expect(screen.getByText("Your address isn't available right now.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
  });

  it('offers no way to change the address (deferred, see the v4 plan)', () => {
    renderSettings();
    const card = screen.getByRole('heading', { name: 'Your PropertyPro address' }).parentElement as HTMLElement;
    expect(within(card).queryByRole('button', { name: /change/i })).not.toBeInTheDocument();
  });
});

describe('LiveSiteSettings — access', () => {
  it('explains who sees what, with no fine copy, and links to Documents', () => {
    renderSettings();
    const card = screen.getByRole('heading', { name: 'Who can see what' }).parentElement as HTMLElement;
    expect(card).toHaveTextContent('Official records are for owners and residents who sign in.');
    expect(card.textContent).not.toMatch(/\$\d|fine/i);
    expect(within(card).getByRole('link', { name: 'Open Documents' })).toHaveAttribute(
      'href',
      '/communities/42/documents',
    );
  });
});

describe('LiveSiteSettings — accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = renderSettings();
    expect(screen.getByTestId('live-site-settings')).toBeInTheDocument();
    expect(screen.getByLabelText('Footer note')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
