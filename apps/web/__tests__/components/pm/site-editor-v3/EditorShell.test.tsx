/**
 * Editor shell — composition, the phone gate, and the tab/panel wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditorShell, type EditorShellProps } from '@/components/pm/site-editor-v3/EditorShell';

// The shell asks `(max-width: 767px)` — see the comment on EditorShell. This
// mock therefore reports NARROWNESS, not width: false = desktop.
const isNarrowMock = vi.hoisted(() => ({ value: false }));
vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => isNarrowMock.value,
  useIsDesktop: () => !isNarrowMock.value,
}));

// `Partial<EditorShellProps>` rather than `Partial<ComponentProps<…>>`: the
// component's props are that interface intersected with the all-or-nothing
// `activeTool`/`onActiveToolChange` union, and `Partial` over a union produces
// the half-controlled shape the union exists to forbid. No case here drives the
// tool from outside, so the overrides are the non-tool props.
// The phone gate lazy-loads UrgentNoticeForm (next/dynamic), which reads
// through React Query. Without a provider, whether the notice-form cases pass
// depended on chunk timing: on a fast machine "Back" was clicked before the
// form mounted; under CI load the chunk won, the form threw "No QueryClient
// set", and the whole tree unmounted (#1212's Unit Tests, 2026-09-29).
// Providing a client, as the app does, removes the race.
const PAGES = [
  {
    id: 1,
    name: 'Home',
    slug: '',
    inNav: true,
    sortOrder: 0,
    isHome: true,
    isDraft: false,
    publishedAt: '2026-01-01T00:00:00Z',
    deleteStagedAt: null,
    seoTitle: null,
    seoDescription: null,
  },
  {
    id: 2,
    name: 'Amenities',
    slug: 'amenities',
    inNav: true,
    sortOrder: 1,
    isHome: false,
    isDraft: true,
    publishedAt: null,
    deleteStagedAt: null,
    seoTitle: null,
    seoDescription: null,
  },
];

function renderShell(overrides: Partial<EditorShellProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
    <EditorShell
      communityName="Sunset Condos"
      publicSiteUrl="https://sunset-condos.example.com/"
      view="website"
      onViewChange={() => {}}
      settings={<p>settings body</p>}
      help={null}
      helpOpen={false}
      onHelpToggle={() => {}}
      communityId={42}
      hasPublishedSite
      initialNotice={null}
      renderToolPanel={(tool) => <p>panel:{tool}</p>}
      canOpenPublish={false}
      // True by default because that is the ordinary state — it is false only
      // when BOTH page reads failed. Supplied explicitly rather than left to
      // `undefined`: this file is outside the `src/**` typecheck program, so a
      // missing required prop would silently disable the Preview button here
      // and make every case that touches it pass for the wrong reason.
      canPreview
      // Read only through `title={canPreview ? undefined : previewDisabledReason}`
      // and `ref={previewButtonRef}`. Every case here leaves `canPreview` true
      // and none reads the ref, so these reproduce exactly what the file
      // rendered while both were absent.
      previewDisabledReason=""
      previewButtonRef={null}
      // Supplied for the same reason as `canPreview`: this file is outside the
      // `src/**` typecheck program, so a required prop omitted here fails only
      // at runtime — and a handler that is merely absent produces a button that
      // silently does nothing, which no assertion in this file would notice.
      onPreview={() => {}}
      onPublish={() => {}}
      pages={PAGES}
      selectedPageId={1}
      onSelectPage={() => {}}
      onManagePages={() => {}}
      changeCount={0}
      device="desktop"
      onDeviceChange={() => {}}
      pageName="Home"
      {...overrides}
    >
      <p>canvas</p>
    </EditorShell>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  isNarrowMock.value = false;
});

describe('EditorShell — phone gate', () => {
  it('renders the gate instead of the editor below the breakpoint', () => {
    isNarrowMock.value = true;
    renderShell();
    expect(screen.getByRole('heading', { name: /bigger screen/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Website tools' })).not.toBeInTheDocument();
  });

  it('unmounts the editor entirely rather than hiding it', () => {
    // A hidden editor still costs its JS, its timers and its focus stops.
    isNarrowMock.value = true;
    renderShell();
    expect(screen.queryByText('canvas')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Publish/ })).not.toBeInTheDocument();
  });

  it('offers the public site as the one useful phone action', () => {
    isNarrowMock.value = true;
    renderShell();
    const link = screen.getByRole('link', { name: /View the public site/i });
    expect(link).toHaveAttribute('href', 'https://sunset-condos.example.com/');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('omits the link when the community has no public site yet', () => {
    isNarrowMock.value = true;
    renderShell({ publicSiteUrl: null });
    expect(screen.queryByRole('link', { name: /View the public site/i })).not.toBeInTheDocument();
  });

  it('keeps the urgent-notice fast path open on a phone (Phase 7)', () => {
    // Editing is turned away; posting a closure notice is not. Standing in front
    // of a flooded lobby with a phone is the case the notice exists for.
    isNarrowMock.value = true;
    renderShell();
    expect(
      screen.getByRole('button', { name: /Post an urgent notice/i }),
    ).toBeInTheDocument();
  });

  it('opens the notice form on the phone without mounting the editor', async () => {
    const user = userEvent.setup();
    isNarrowMock.value = true;
    renderShell();

    await user.click(screen.getByRole('button', { name: /Post an urgent notice/i }));

    expect(
      await screen.findByRole('heading', { name: /post an urgent notice/i }),
    ).toBeInTheDocument();
    // Still no editor: the fast path is a sibling of the gate, not a way in.
    expect(screen.queryByRole('navigation', { name: 'Website tools' })).not.toBeInTheDocument();
    expect(screen.queryByText('canvas')).not.toBeInTheDocument();
  });

  it('lets a manager back out of the notice form to the gate', async () => {
    const user = userEvent.setup();
    isNarrowMock.value = true;
    renderShell();

    await user.click(screen.getByRole('button', { name: /Post an urgent notice/i }));
    await screen.findByRole('heading', { name: /post an urgent notice/i });
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByRole('heading', { name: /bigger screen/i })).toBeInTheDocument();
  });
});

describe('EditorShell — composition', () => {
  it('renders one h1 carrying the page identity', () => {
    renderShell();
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Website');
    expect(screen.getByText('Sunset Condos')).toBeInTheDocument();
  });

  it('renders the canvas children', () => {
    renderShell();
    expect(screen.getByText('canvas')).toBeInTheDocument();
  });

  it('opens on the page, with no tool panel covering it', () => {
    renderShell();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    for (const tile of screen.getAllByTestId(/^site-editor-tool-/)) {
      expect(tile).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('opens a tool, names its panel, and closes it again from the same tile', async () => {
    const user = userEvent.setup();
    renderShell();
    const notice = screen.getByRole('button', { name: /Notice/ });
    await user.click(notice);
    expect(screen.getByText('panel:notice')).toBeInTheDocument();
    expect(notice).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('complementary', { name: 'Urgent notice' })).toHaveAttribute(
      'id',
      notice.getAttribute('aria-controls'),
    );

    await user.click(notice);
    expect(screen.queryByText('panel:notice')).not.toBeInTheDocument();
    expect(notice).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the panel from its own close button', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: /Notice/ }));
    await user.click(screen.getByRole('button', { name: 'Close panel' }));
    expect(screen.queryByText('panel:notice')).not.toBeInTheDocument();
  });
});

describe('EditorShell — Help drawer', () => {
  it('toggles the drawer from the top bar and from the rail, without opening a tool panel', async () => {
    const user = userEvent.setup();
    const onHelpToggle = vi.fn();
    renderShell({ onHelpToggle });
    const [topBar, rail] = screen.getAllByRole('button', { name: 'Help' });
    await user.click(topBar!);
    await user.click(rail!);
    expect(onHelpToggle).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('complementary', { name: 'Help' })).not.toBeInTheDocument();
  });

  it('shows the drawer over either area, and both openers say it is open', () => {
    renderShell({
      helpOpen: true,
      help: <aside id="site-editor-help" aria-label="Help">guides</aside>,
    });
    for (const opener of screen.getAllByRole('button', { name: 'Help' })) {
      expect(opener).toHaveAttribute('aria-expanded', 'true');
      expect(opener).toHaveAttribute('aria-controls', 'site-editor-help');
    }
    expect(screen.getByText('guides')).toBeInTheDocument();
    // The drawer's `group-has-[…]/editor` variant needs this ancestor to step
    // left of a docked inspector.
    expect(screen.getByText('guides').parentElement).toHaveClass('group/editor');
  });

  it('keeps the drawer when Settings is showing', () => {
    renderShell({
      view: 'settings',
      helpOpen: true,
      help: <aside aria-label="Help">guides</aside>,
    });
    expect(screen.getByText('settings body')).toBeInTheDocument();
    expect(screen.getByText('guides')).toBeInTheDocument();
  });
});

describe('EditorShell — Editing page picker', () => {
  it('names the page being edited', () => {
    renderShell();
    expect(screen.getByTestId('editing-page-name')).toHaveTextContent('Home');
  });

  it('lists every page and marks the ones visitors cannot see yet', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: /Editing page/ }));
    const list = screen.getByRole('list', { name: 'Pages' });
    expect(list).toHaveTextContent('Home');
    expect(list).toHaveTextContent('AmenitiesNot published');
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('switches page and hands focus back to the trigger', async () => {
    const user = userEvent.setup();
    const onSelectPage = vi.fn();
    renderShell({ onSelectPage });
    const trigger = screen.getByRole('button', { name: /Editing page/ });
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: /Amenities/ }));
    expect(onSelectPage).toHaveBeenCalledWith(2);
    expect(screen.queryByRole('list', { name: 'Pages' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('does not re-select the page already being edited', async () => {
    const user = userEvent.setup();
    const onSelectPage = vi.fn();
    renderShell({ onSelectPage });
    await user.click(screen.getByRole('button', { name: /Editing page/ }));
    await user.click(screen.getByRole('button', { name: 'Home' }));
    expect(onSelectPage).not.toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderShell();
    const trigger = screen.getByRole('button', { name: /Editing page/ });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('list', { name: 'Pages' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('routes "Add or manage pages" to the Pages tool', async () => {
    const user = userEvent.setup();
    const onManagePages = vi.fn();
    renderShell({ onManagePages });
    await user.click(screen.getByRole('button', { name: /Editing page/ }));
    await user.click(screen.getByRole('button', { name: 'Add or manage pages' }));
    expect(onManagePages).toHaveBeenCalledTimes(1);
  });
});

describe('EditorShell — publish affordance', () => {
  it('disables Publish with an explanation when there is nothing to publish', () => {
    renderShell({ canOpenPublish: false });
    const publish = screen.getByRole('button', { name: /Publish/ });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAttribute('title', 'Nothing to publish yet');
  });

  it('enables Publish once changes exist', () => {
    renderShell({ canOpenPublish: true });
    expect(screen.getByRole('button', { name: /Publish/ })).toBeEnabled();
  });

  it('shows how many changes are waiting', () => {
    renderShell({ canOpenPublish: true, changeCount: 3 });
    expect(screen.getByRole('button', { name: 'Publish 3 changes' })).toBeEnabled();
  });

  it('shows no count when there is nothing waiting', () => {
    renderShell({ canOpenPublish: true, changeCount: 0 });
    expect(screen.queryByTestId('publish-change-count')).not.toBeInTheDocument();
  });
});

describe('EditorShell — device preview (v4)', () => {
  it('offers three sizes and marks the one showing', () => {
    renderShell({ device: 'tablet' });
    const group = screen.getByRole('group', { name: 'Preview size' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview on a tablet' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Preview on a phone' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('reports the size the PM picks', async () => {
    const user = userEvent.setup();
    const onDeviceChange = vi.fn();
    renderShell({ onDeviceChange });
    await user.click(screen.getByRole('button', { name: 'Preview on a phone' }));
    expect(onDeviceChange).toHaveBeenCalledWith('phone');
  });
});

describe('EditorShell — scroll containers contain their sr-only regions', () => {
  // jsdom has no layout, so this pins the class that does the work. Without
  // `relative`, an `sr-only` (position: absolute) live region inside a panel
  // anchors to the page and stretches the document past the viewport.
  it('positions the tool panel and canvas scrollers', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByTestId('tool-panel-scroller')).toHaveClass('relative', 'overflow-y-auto');
    expect(screen.getByTestId('canvas-scroller')).toHaveClass('relative', 'overflow-y-auto');
  });
});

describe('EditorShell — Website · Settings switch (v4 Phase 5)', () => {
  it('marks the current area and asks to switch to the other', async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();
    renderShell({ onViewChange });

    const nav = screen.getByRole('navigation', { name: 'Website areas' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Website' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Settings' })).not.toHaveAttribute('aria-current');

    await user.click(screen.getByRole('button', { name: 'Website' }));
    expect(onViewChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onViewChange).toHaveBeenCalledWith('settings');
  });

  it('in Settings, shows the settings in place of the rail, canvas and page controls', () => {
    renderShell({ view: 'settings', children: <p>canvas body</p> });

    expect(screen.getByText('settings body')).toBeInTheDocument();
    expect(screen.getByTestId('settings-scroller')).toHaveClass('relative', 'overflow-y-auto');
    expect(screen.queryByRole('navigation', { name: 'Website tools' })).not.toBeInTheDocument();
    expect(screen.queryByText('canvas body')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Preview size' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('editing-page-name')).not.toBeInTheDocument();
    // Publish and Preview stay: settings are live, but drafts are still waiting.
    expect(screen.getByRole('button', { name: /Publish/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument();
  });

  it('in Website, does not render the settings', () => {
    renderShell();
    expect(screen.queryByText('settings body')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Website tools' })).toBeInTheDocument();
  });
});
