/**
 * The editor's Pages & design view (website builder v4, Phase 5; design D): its
 * two tabs, what each says about saving, the Design tab's looks in place, how
 * the editor's address opens it, and an axe audit of both tabs. The forms inside
 * have their own suites (PagesPanel, DesignPanel). The settings that save at
 * once moved to the website overview (`LiveSiteSettings.test.tsx`).
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

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The Design panel is real here, so the tab's content is what a manager sees;
// the hooks it reads are mocked. The Pages panel has its own suite, so it is
// stood in for by a component that echoes what the view hands it.
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
vi.mock('@/hooks/use-site-look', () => ({
  useSelectLook: () => ({ mutate: vi.fn(), isPending: false }),
  useKeepCurrentLook: () => ({ mutate: vi.fn(), isPending: false }),
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
  };
});

import { SettingsView } from '@/components/pm/site-editor-v3/settings/SettingsView';
import { SETTINGS_SAVE_NOTES, parseEditorLocation } from '@/components/pm/site-editor-v3/settings/settings-tabs';
import type { PresetCardData } from '@/components/pm/site-editor-v3/panels/preset-cards';

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

function viewProps(props: Partial<React.ComponentProps<typeof SettingsView>> = {}) {
  return {
    communityId: 42,
    onTabChange,
    pagesPanel: {
      selectedPageId: 5,
      restoreFocusToSelectedRow: false,
      onFocusRestored: vi.fn(),
      onSelectPage,
      onPageRemoved: vi.fn(),
    },
    designPanel: { presets: PRESETS, hasSiteCustomCss: false, theme: THEME },
    ...props,
  };
}

function renderView(props: Partial<React.ComponentProps<typeof SettingsView>> = {}) {
  return render(<SettingsView {...viewProps(props)} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  designRef.current = { live: { layoutId: 'bayfront', themePresetSlug: 'bay-light' }, draft: {} };
});

describe('SettingsView — tabs', () => {
  it('shows Pages and Design, and opens on Pages', () => {
    renderView();
    expect(screen.getByRole('tablist', { name: 'Pages and design' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Pages', 'Design']);
    expect(screen.getByRole('tab', { name: 'Pages' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('pages-panel-stand-in')).toHaveTextContent(
      'Pages panel for community 42, editing page 5',
    );
  });

  it('moves between the tabs with the arrow keys, wrapping at the ends', async () => {
    const user = userEvent.setup();
    renderView();
    screen.getByRole('tab', { name: 'Pages' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('tab', { name: 'Design' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Design' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('tab', { name: 'Pages' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Design' })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('tab', { name: 'Pages' })).toHaveFocus();
  });

  it('keeps one tab in the Tab order and links each panel to its tab', () => {
    renderView();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter((t) => t.tabIndex === 0)).toHaveLength(1);
    for (const tab of tabs) {
      const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '');
      expect(panel).toHaveAttribute('role', 'tabpanel');
      expect(panel).toHaveAttribute('aria-labelledby', tab.id);
    }
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Pages');
  });

  it('hands the Pages tab the editor selection, so choosing a page reaches the editor', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('button', { name: 'Edit the second page' }));
    expect(onSelectPage).toHaveBeenCalledWith(77);
  });

  it('the Design tab offers the looks in place, then the colours, and no logos', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('tab', { name: 'Design' }));
    const panel = screen.getByRole('tabpanel');

    // Chosen here, as a draft — no link away to another page.
    expect(within(panel).getByRole('group', { name: 'Look' })).toBeInTheDocument();
    expect(within(panel).queryByRole('link', { name: 'Change look' })).not.toBeInTheDocument();
    expect(within(panel).getByLabelText(/midnight coast/i)).toBeInTheDocument();
    expect(within(panel).getByRole('heading', { name: 'Your own colours' })).toBeInTheDocument();
    // Logos save live, so they are on the overview's Settings tab, not here.
    expect(within(panel).queryByText(/logo/i)).not.toBeInTheDocument();
  });

  // Each line comes from the tab's real write path; the table's own comment
  // names them. A change that moves a write from live to draft must change both.
  it('each tab says how it saves', async () => {
    const user = userEvent.setup();
    renderView();
    const expected: Array<[string, string]> = [
      [
        'Pages',
        "Adding a page and removing a published page wait for Publish. A page that was never published is deleted straight away. A published page's name, menu and order save immediately.",
      ],
      ['Design', 'Saved as a draft until you publish.'],
    ];
    for (const [name, note] of expected) {
      await user.click(screen.getByRole('tab', { name }));
      expect(within(screen.getByRole('tabpanel')).getByText(note)).toBeVisible();
    }
    expect(Object.values(SETTINGS_SAVE_NOTES)).toEqual(expected.map(([, note]) => note));
  });

  it('tells the editor which tab is showing, so a remount can reopen it', async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole('tab', { name: 'Design' }));
    expect(onTabChange).toHaveBeenLastCalledWith('design');
  });
});

// A panel mounts on its tab's first visit and is then hidden, not unmounted.
describe('SettingsView — panels keep their state', () => {
  it("does not mount the Design panel until its tab is first opened, then keeps it", async () => {
    const user = userEvent.setup();
    renderView();
    expect(screen.queryByTestId('tool-panel-design')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Design' }));
    await user.click(screen.getByRole('tab', { name: 'Pages' }));
    expect(screen.getByTestId('tool-panel-design')).not.toBeVisible();
  });
});

describe('SettingsView — a requested tab', () => {
  it('opens on the requested tab', () => {
    renderView({ tabRequest: { tab: 'design' } });
    expect(screen.getByRole('tab', { name: 'Design' })).toHaveAttribute('aria-selected', 'true');
    // Straight there: Pages is not mounted first.
    expect(screen.queryByTestId('pages-panel-stand-in')).not.toBeInTheDocument();
  });

  it('switches back on a new request for the tab already asked for', async () => {
    const user = userEvent.setup();
    const { rerender } = renderView({ tabRequest: { tab: 'design' } });
    await user.click(screen.getByRole('tab', { name: 'Pages' }));

    rerender(<SettingsView {...viewProps({ tabRequest: { tab: 'design' } })} />);
    expect(screen.getByRole('tab', { name: 'Design' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('SettingsView — the address that opens it', () => {
  it('?view=settings&tab=design opens Pages & design on Design, in Advanced', () => {
    const location = parseEditorLocation({ view: 'settings', tab: 'design' });
    expect(location).toMatchObject({ mode: 'advanced', view: 'settings', tab: 'design', settingsMoved: false });

    renderView({ tabRequest: { tab: location.tab } });
    expect(screen.getByRole('tab', { name: 'Design' })).toHaveAttribute('aria-selected', 'true');
  });

  it('opens Pages for an unknown tab, and the website for anything but view=settings', () => {
    expect(parseEditorLocation({ view: 'settings', tab: 'billing' })).toMatchObject({
      view: 'settings',
      tab: 'pages',
      settingsMoved: false,
    });
    expect(parseEditorLocation({ view: 'settings' })).toMatchObject({ view: 'settings', tab: 'pages' });
    expect(parseEditorLocation({ tab: 'design' })).toMatchObject({ view: 'website', tab: 'pages' });
    expect(parseEditorLocation({ view: 'elsewhere', tab: 'design' })).toMatchObject({
      view: 'website',
      tab: 'pages',
    });
    expect(parseEditorLocation({ view: ['settings', 'website'], tab: ['design', 'pages'] })).toMatchObject({
      view: 'settings',
      tab: 'design',
    });
  });

  // The settings that save at once live on the website overview now; the page
  // redirects these (site-editor-v3-page-auth.test.ts).
  it.each(['general', 'notice', 'address', 'search', 'access'])(
    'marks ?view=settings&tab=%s as moved to the overview',
    (tab) => {
      expect(parseEditorLocation({ view: 'settings', tab }).settingsMoved).toBe(true);
    },
  );

  it('only marks a moved tab under view=settings', () => {
    expect(parseEditorLocation({ tab: 'notice' }).settingsMoved).toBe(false);
    expect(parseEditorLocation({ view: 'settings', tab: 'pages' }).settingsMoved).toBe(false);
  });

  it('opens Simple unless the address asks for Advanced or for Pages & design', () => {
    expect(parseEditorLocation({})).toEqual({
      mode: 'simple',
      view: 'website',
      tab: 'pages',
      item: 'welcome',
      openPublish: false,
      settingsMoved: false,
    });
    expect(parseEditorLocation({ mode: 'advanced' }).mode).toBe('advanced');
    expect(parseEditorLocation({ mode: 'expert' }).mode).toBe('simple');
    expect(parseEditorLocation({ mode: 'simple', view: 'settings' }).mode).toBe('advanced');
  });

  it("reads the overview's quick-edit row and its Review and publish", () => {
    expect(parseEditorLocation({ item: 'look' }).item).toBe('look');
    expect(parseEditorLocation({ item: 'contact' }).item).toBe('welcome');
    expect(parseEditorLocation({ publish: '1' }).openPublish).toBe(true);
    expect(parseEditorLocation({ publish: 'yes' }).openPublish).toBe(false);
  });
});

describe('SettingsView — accessibility', () => {
  it.each(['Pages', 'Design'])('has no axe violations on %s', async (name) => {
    const user = userEvent.setup();
    const { container } = renderView();
    await user.click(screen.getByRole('tab', { name }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
