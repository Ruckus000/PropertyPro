/**
 * The editor's Site settings view (website builder v4, Phase 5; Task 27 of the
 * combined plan): its tabs, where each existing setting landed, what each tab
 * says about saving, the Design tab's link to the look picker, the copyable
 * address, and an axe audit of every tab. The forms inside have their own
 * suites (SitePanel, DomainPanel, PagesPanel, DesignPanel).
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

// The Design panel is real here, so the tab's content is what a manager sees;
// the hooks it reads are mocked. The Pages and Notice panels have their own
// suites, so they are stood in for by components that echo what the view
// hands them.
const { designRef, onSelectPage, onTabChange } = vi.hoisted(() => ({
  designRef: {
    current: { live: { layoutId: 'bayfront', themePresetSlug: 'bay-light' }, draft: {} },
  },
  onSelectPage: vi.fn(),
  onTabChange: vi.fn(),
}));
vi.mock('@/hooks/use-site-design', () => ({
  siteDesignQueryKey: (communityId: number) => ['pm', 'site', 'design', communityId] as const,
  useSiteDesign: () => ({ data: designRef.current, isError: false, refetch: vi.fn() }),
  useSaveSiteDesign: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/pm/site-editor-v3/panels/LogosSection', () => ({
  LogosSection: () => <p>Logos section</p>,
}));
vi.mock('@/components/pm/site-editor-v3/settings/settings-panels-lazy', async () => {
  const { DesignPanel } = await import('@/components/pm/site-editor-v3/panels/DesignPanel');
  return {
    LazyDesignPanel: DesignPanel,
    LazyPagesPanel: (props: {
      communityId: number;
      selectedPageId: number | null;
      onSelectPage: (pageId: number) => void;
    }) => (
      <div data-testid="pages-panel-stand-in">
        <p>
          Pages panel for community {props.communityId}, editing page {String(props.selectedPageId)}
        </p>
        <button type="button" onClick={() => props.onSelectPage(77)}>
          Edit the second page
        </button>
      </div>
    ),
    LazyUrgentNoticePanel: (props: { communityId: number; hasPublishedSite: boolean }) => (
      <p data-testid="notice-panel-stand-in">
        Notice panel for community {props.communityId}, published {String(props.hasPublishedSite)}
      </p>
    ),
  };
});

import { SettingsView } from '@/components/pm/site-editor-v3/settings/SettingsView';
import { SETTINGS_SAVE_NOTES, parseEditorLocation } from '@/components/pm/site-editor-v3/settings/settings-tabs';
import type { PresetCardData } from '@/components/pm/site-editor-v3/panels/preset-cards';

const onOpenDocuments = vi.fn();

const preset = (slug: string, displayName: string): PresetCardData => ({
  slug,
  displayName,
  description: null,
  tokens: { primaryColor: '#123456' },
  tier: 'essentials',
  isFeatured: false,
});
const PRESETS = [preset('bay-light', 'Bay Light'), preset('midnight-coast', 'Midnight Coast')];
const THEME = { primaryColor: '#C2533A', secondaryColor: '#6B7280', accentColor: '#F7DCD2', bodyFont: 'Lora' };

function renderView(props: Partial<React.ComponentProps<typeof SettingsView>> = {}) {
  return render(
    <SettingsView
      communityId={42}
      community={{ name: 'Sunset Condos', slug: 'sunset-condos', communityType: 'condo_718' }}
      tagline={null}
      publicSiteUrl="https://sunset-condos.getpropertypro.com/"
      hasSiteCustomDomain={false}
      onOpenDocuments={onOpenDocuments}
      onTabChange={onTabChange}
      pagesPanel={{
        selectedPageId: 5,
        restoreFocusToSelectedRow: false,
        onFocusRestored: vi.fn(),
        onSelectPage,
        onPageRemoved: vi.fn(),
      }}
      designPanel={{ presets: PRESETS, hasSiteCustomCss: false, theme: THEME }}
      noticePanel={{ hasPublishedSite: true, initialNotice: null }}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  designRef.current = { live: { layoutId: 'bayfront', themePresetSlug: 'bay-light' }, draft: {} };
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
    expect(screen.getByRole('tab', { name: 'Pages' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Pages' })).toHaveAttribute(
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

// Task 27: Site settings holds what the tool rail used to.
describe('SettingsView — pages, design and notice', () => {
  it('Site settings shows Pages, Design and Notice tabs', async () => {
    const user = userEvent.setup();
    renderView();

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'General',
      'Pages',
      'Design',
      'Notice',
      'Address & domain',
      'Search & sharing',
      'Access & visibility',
    ]);

    await user.click(screen.getByRole('tab', { name: 'Pages' }));
    expect(screen.getByTestId('pages-panel-stand-in')).toHaveTextContent(
      'Pages panel for community 42, editing page 5',
    );
    await user.click(screen.getByRole('tab', { name: 'Design' }));
    expect(screen.getByTestId('tool-panel-design')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Notice' }));
    expect(screen.getByTestId('notice-panel-stand-in')).toHaveTextContent(
      'Notice panel for community 42, published true',
    );
  });

  it('hands the Pages tab the editor selection, so choosing a page reaches the editor', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('tab', { name: 'Pages' }));
    await user.click(screen.getByRole('button', { name: 'Edit the second page' }));

    expect(onSelectPage).toHaveBeenCalledWith(77);
  });

  it('the Design tab links to the look picker and lists no looks', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('tab', { name: 'Design' }));
    const panel = screen.getByRole('tabpanel');

    expect(within(panel).getByRole('link', { name: 'Change look' })).toHaveAttribute(
      'href',
      '/pm/website/looks?communityId=42',
    );
    // No look is offered here: not as a radio, and not by name.
    expect(within(panel).queryByRole('radiogroup', { name: 'Look' })).not.toBeInTheDocument();
    for (const name of ['Bayfront', 'Heritage', 'Palm Grove', 'Plain & Simple']) {
      expect(within(panel).queryByText(name)).not.toBeInTheDocument();
    }
    // What it does keep: colour sets, your own colours and the logos.
    expect(within(panel).getByLabelText(/midnight coast/i)).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Your own colours' })).toBeInTheDocument();
    expect(within(panel).getByText('Logos section')).toBeInTheDocument();
  });

  // Each line comes from the tab's real write path; the table's own comment
  // names them. A change that moves a write from live to draft must change both.
  it('each tab says whether it saves immediately', async () => {
    const user = userEvent.setup();
    renderView();
    const expected: Array<[string, string]> = [
      ['General', 'Saves immediately.'],
      ['Pages', "Saved as a draft until you publish. A published page's name, menu and order save immediately."],
      ['Design', 'Saved as a draft until you publish. Logos save immediately.'],
      ['Notice', 'Saves immediately.'],
      ['Address & domain', 'Saves immediately.'],
      ['Search & sharing', 'Saves immediately.'],
      ['Access & visibility', 'Nothing to save here. Each document is opened to the public in Documents.'],
    ];
    for (const [name, note] of expected) {
      await user.click(screen.getByRole('tab', { name }));
      expect(within(screen.getByRole('tabpanel')).getByText(note)).toBeVisible();
    }
    // The view shows exactly what the table says, and no tab is missing from it.
    expect(Object.values(SETTINGS_SAVE_NOTES)).toEqual(expected.map(([, note]) => note));
  });

  it('no longer claims everything in Site settings skips Publish', () => {
    renderView();
    expect(screen.queryByText(/Changes here take effect as soon as you save them/)).not.toBeInTheDocument();
  });

  it('tells the editor which tab is showing, so a remount can reopen it', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('tab', { name: 'Notice' }));

    expect(onTabChange).toHaveBeenLastCalledWith('notice');
  });
});

describe('SettingsView — the address that opens it', () => {
  it('?view=settings&tab=pages opens Site settings on Pages', () => {
    const location = parseEditorLocation({ view: 'settings', tab: 'pages' });
    expect(location).toEqual({ view: 'settings', tab: 'pages' });

    renderView({ tabRequest: { tab: location.tab } });
    expect(screen.getByRole('tab', { name: 'Pages' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('pages-panel-stand-in')).toBeVisible();
    // Straight there: General is not mounted first.
    expect(screen.queryByLabelText('Footer note')).not.toBeInTheDocument();
  });

  it('opens General for an unknown tab, and the website for anything but view=settings', () => {
    expect(parseEditorLocation({ view: 'settings', tab: 'billing' })).toEqual({
      view: 'settings',
      tab: 'general',
    });
    expect(parseEditorLocation({ view: 'settings' })).toEqual({ view: 'settings', tab: 'general' });
    expect(parseEditorLocation({ tab: 'pages' })).toEqual({ view: 'website', tab: 'general' });
    expect(parseEditorLocation({ view: 'elsewhere', tab: 'pages' })).toEqual({
      view: 'website',
      tab: 'general',
    });
    expect(parseEditorLocation({ view: ['settings', 'website'], tab: ['design', 'pages'] })).toEqual({
      view: 'settings',
      tab: 'design',
    });
  });
});

// A Help guide's "Show me" asks for a tab (v4 Phase 3).
describe('SettingsView — a requested tab', () => {
  it('opens on the requested tab', () => {
    renderView({ tabRequest: { tab: 'address' } });
    expect(screen.getByRole('tab', { name: 'Address & domain' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(useCustomDomainMock).toHaveBeenCalled();
    // Straight there: General is not mounted (and its reads not fired) first.
    expect(screen.queryByLabelText('Footer note')).not.toBeInTheDocument();
  });

  it('switches back on a new request for the tab already asked for', async () => {
    const user = userEvent.setup();
    const { rerender } = renderView({ tabRequest: { tab: 'search' } });
    await user.click(screen.getByRole('tab', { name: 'General' }));

    rerender(
      <SettingsView
        communityId={42}
        community={{ name: 'Sunset Condos', slug: 'sunset-condos', communityType: 'condo_718' }}
        tagline={null}
        publicSiteUrl="https://sunset-condos.getpropertypro.com/"
        hasSiteCustomDomain={false}
        onOpenDocuments={onOpenDocuments}
        pagesPanel={{
          selectedPageId: 5,
          restoreFocusToSelectedRow: false,
          onFocusRestored: vi.fn(),
          onSelectPage,
          onPageRemoved: vi.fn(),
        }}
        designPanel={{ presets: PRESETS, hasSiteCustomCss: false, theme: THEME }}
        noticePanel={{ hasPublishedSite: true, initialNotice: null }}
        tabRequest={{ tab: 'search' }}
      />,
    );
    expect(screen.getByRole('tab', { name: 'Search & sharing' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
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
  it.each([
    'General',
    'Pages',
    'Design',
    'Notice',
    'Address & domain',
    'Search & sharing',
    'Access & visibility',
  ])(
    'has no axe violations on %s',
    async (name) => {
      const user = userEvent.setup();
      const { container } = renderView();
      await user.click(screen.getByRole('tab', { name }));
      expect(await axe(container)).toHaveNoViolations();
    },
  );
});
