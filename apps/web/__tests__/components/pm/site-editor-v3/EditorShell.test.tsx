/**
 * Editor shell — composition, the phone gate, and the tab/panel wiring.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorShell } from '@/components/pm/site-editor-v3/EditorShell';

const matchesMock = vi.hoisted(() => ({ value: true }));
vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => matchesMock.value,
  useIsDesktop: () => matchesMock.value,
}));

function renderShell(overrides: Partial<React.ComponentProps<typeof EditorShell>> = {}) {
  return render(
    <EditorShell
      communityName="Sunset Condos"
      publicSiteUrl="https://sunset-condos.example.com/"
      hasProTools
      renderToolPanel={(tool) => <p>panel:{tool}</p>}
      {...overrides}
    >
      <p>canvas</p>
    </EditorShell>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  matchesMock.value = true;
});

describe('EditorShell — phone gate', () => {
  it('renders the gate instead of the editor below the breakpoint', () => {
    matchesMock.value = false;
    renderShell();
    expect(screen.getByRole('heading', { name: /bigger screen/i })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('unmounts the editor entirely rather than hiding it', () => {
    // A hidden editor still costs its JS, its timers and its focus stops.
    matchesMock.value = false;
    renderShell();
    expect(screen.queryByText('canvas')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Publish/ })).not.toBeInTheDocument();
  });

  it('offers the public site as the one useful phone action', () => {
    matchesMock.value = false;
    renderShell();
    const link = screen.getByRole('link', { name: /View the public site/i });
    expect(link).toHaveAttribute('href', 'https://sunset-condos.example.com/');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('omits the link when the community has no public site yet', () => {
    matchesMock.value = false;
    renderShell({ publicSiteUrl: null });
    expect(screen.queryByRole('link', { name: /View the public site/i })).not.toBeInTheDocument();
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
    renderShell({ changeCount: 0 });
    const publish = screen.getByRole('button', { name: /Publish/ });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAttribute('title', 'Nothing to publish yet');
  });

  it('enables Publish once changes exist', () => {
    renderShell({ changeCount: 2 });
    expect(screen.getByRole('button', { name: /Publish/ })).toBeEnabled();
  });

  it('surfaces the pending count on the Site tab', () => {
    renderShell({ changeCount: 4 });
    expect(screen.getByRole('tab', { name: /Site/ })).toHaveTextContent('4');
  });
});
