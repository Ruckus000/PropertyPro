/**
 * Editor shell — composition, the phone gate, and the tab/panel wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
function renderShell(overrides: Partial<EditorShellProps> = {}) {
  return render(
    <EditorShell
      communityName="Sunset Condos"
      publicSiteUrl="https://sunset-condos.example.com/"
      proToolAccess={{ styling: true, domain: true }}
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
      {...overrides}
    >
      <p>canvas</p>
    </EditorShell>,
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
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
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
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
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

  it('opens on the Sections tool', () => {
    renderShell();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(/Sections/);
    expect(screen.getByText('panel:sections')).toBeInTheDocument();
  });

  it('swaps the panel body and heading when a tool is chosen', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('tab', { name: /Address/ }));
    expect(screen.getByText('panel:domain')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Web address' })).toBeInTheDocument();
  });

  it('labels the panel by its active tab', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('tab', { name: /Help/ }));
    expect(screen.getByRole('tabpanel')).toHaveAttribute(
      'aria-labelledby',
      'site-editor-tab-help',
    );
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
});
