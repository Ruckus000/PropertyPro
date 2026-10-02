/**
 * The editor's Settings view (website builder v4, Phase 5): its tabs, where
 * each existing setting landed, the copyable address, and an axe audit of
 * every tab. The forms inside have their own suites (SitePanel, DomainPanel).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

// The "Page by page" card's list and save (v4 Phase 5b; its own suite is
// PageSeoCard.test.tsx). One sub-page, so the card renders its form.
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

import { SettingsView } from '@/components/pm/site-editor-v3/settings/SettingsView';

const onOpenDocuments = vi.fn();

function renderView() {
  return render(
    <SettingsView
      communityId={42}
      community={{ name: 'Sunset Condos', slug: 'sunset-condos', communityType: 'condo_718' }}
      tagline={null}
      publicSiteUrl="https://sunset-condos.getpropertypro.com/"
      hasSiteCustomDomain={false}
      onOpenDocuments={onOpenDocuments}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useCustomDomainMock.mockReturnValue({ data: { status: 'none' }, isPending: false, isError: false });
});

describe('SettingsView — tabs', () => {
  it('opens on General: the site name, icon, storage and footer', () => {
    renderView();
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('settings-site-name')).toHaveTextContent('Sunset Condos');
    expect(screen.getByLabelText('Site icon')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Photo storage used' })).toBeInTheDocument();
    expect(screen.getByLabelText('Footer note')).toBeInTheDocument();
    expect(screen.queryByLabelText('Page title')).not.toBeInTheDocument();
  });

  it('puts search results and the sharing image under Search & sharing', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('tab', { name: 'Search & sharing' }));
    expect(screen.getByLabelText('Page title')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sharing image' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Page by page' })).toBeInTheDocument();
    // The page fallback is the site description as the public page computes it.
    expect(screen.getByLabelText('Title', { selector: '#page-seo-title' })).toHaveAttribute(
      'placeholder',
      'About · Sunset Condos',
    );
  });

  it('moves between tabs with the arrow keys, wrapping at the ends', async () => {
    const user = userEvent.setup();
    renderView();
    screen.getByRole('tab', { name: 'General' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('tab', { name: 'Address & domain' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Address & domain' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(screen.getByRole('tab', { name: 'Access & visibility' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'General' })).toHaveFocus();
  });

  it('keeps one tab in the Tab order and links the panel to it', () => {
    renderView();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter((t) => t.tabIndex === 0)).toHaveLength(1);
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('General');
  });
});

// A panel mounts on its tab's first visit and is then hidden, not unmounted,
// so an unsaved edit survives a look at another tab.
// Revert check: `hidden={t.id !== tab}` → render only the selected panel.
describe('SettingsView — panels keep their state', () => {
  it('keeps an unsaved footer note across a tab switch', async () => {
    const user = userEvent.setup();
    renderView();
    await user.type(screen.getByLabelText('Footer note'), 'Pool closes at 9');
    await user.click(screen.getByRole('tab', { name: 'Search & sharing' }));
    await user.click(screen.getByRole('tab', { name: 'General' }));

    expect(screen.getByLabelText('Footer note')).toHaveValue('Pool closes at 9');
  });

  it("does not mount a tab's content until the tab is first opened", async () => {
    const user = userEvent.setup();
    renderView();
    expect(useCustomDomainMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('tab', { name: 'Address & domain' }));
    expect(useCustomDomainMock).toHaveBeenCalled();
  });

  it("gives every tab's aria-controls a panel that exists, and shows only one", () => {
    renderView();
    for (const tab of screen.getAllByRole('tab')) {
      const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '');
      expect(panel).toHaveAttribute('role', 'tabpanel');
      expect(panel).toHaveAttribute('aria-labelledby', tab.id);
    }
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });
});

describe('SettingsView — address', () => {
  it('shows the PropertyPro address and copies the full URL', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderView();

    await user.click(screen.getByRole('tab', { name: 'Address & domain' }));
    expect(screen.getByTestId('settings-address')).toHaveTextContent(
      'sunset-condos.getpropertypro.com',
    );
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('https://sunset-condos.getpropertypro.com/');
    expect(toastMock.success).toHaveBeenCalledWith('Copied.');
  });

  it('offers no way to change the address (deferred, see the v4 plan)', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('tab', { name: 'Address & domain' }));
    expect(screen.queryByRole('button', { name: /change/i })).not.toBeInTheDocument();
  });
});

describe('SettingsView — access', () => {
  it('explains who sees what, with no fine copy, and links to Documents', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('tab', { name: 'Access & visibility' }));
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Official records are for owners and residents who sign in.');
    expect(panel.textContent).not.toMatch(/\$\d|fine/i);
    await user.click(screen.getByRole('button', { name: 'Open Documents' }));
    expect(onOpenDocuments).toHaveBeenCalled();
  });
});

describe('SettingsView — accessibility', () => {
  it.each(['General', 'Address & domain', 'Search & sharing', 'Access & visibility'])(
    'has no axe violations on %s',
    async (name) => {
      const user = userEvent.setup();
      const { container } = renderView();
      await user.click(screen.getByRole('tab', { name }));
      expect(await axe(container)).toHaveNoViolations();
    },
  );
});
