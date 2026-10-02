/**
 * v4 tool rail — disclosure contract and keyboard traversal.
 *
 * Hand-rolled, so the accessibility contract a library would give for free is
 * asserted here: one labelled landmark, disclosure buttons whose state and
 * `aria-controls` track the open panel, a single roving tab stop, and arrow-key
 * traversal that moves focus without opening anything.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolRail } from '@/components/pm/site-editor-v3/ToolRail';
import { EDITOR_TOOLS } from '@/components/pm/site-editor-v3/tools';

const onSelect = vi.fn();

function renderRail(overrides: Partial<React.ComponentProps<typeof ToolRail>> = {}) {
  return render(
    <ToolRail
      active={null}
      onSelect={onSelect}
      proToolAccess={{ domain: true }}
      panelId="panel-1"
      {...overrides}
    />,
  );
}

function tiles() {
  return screen.getAllByTestId(/^site-editor-tool-/);
}

beforeEach(() => vi.clearAllMocks());

describe('ToolRail — structure', () => {
  it('is one labelled landmark with a tile per tool, in rail order', () => {
    renderRail();
    expect(screen.getByRole('navigation', { name: 'Website tools' })).toBeInTheDocument();
    expect(tiles().map((t) => t.textContent)).toEqual(EDITOR_TOOLS.map((t) => t.label));
  });

  it('puts Add first — the action the rail exists to make obvious', () => {
    renderRail();
    expect(tiles()[0]).toHaveAccessibleName('Add');
  });

  it('reports every tile collapsed while no panel is open', () => {
    renderRail();
    for (const tile of tiles()) {
      expect(tile).toHaveAttribute('aria-expanded', 'false');
      expect(tile).not.toHaveAttribute('aria-controls');
    }
  });

  it('marks only the open tool expanded, pointing at the panel', () => {
    renderRail({ active: 'pages' });
    const pages = screen.getByRole('button', { name: 'Pages' });
    expect(pages).toHaveAttribute('aria-expanded', 'true');
    expect(pages).toHaveAttribute('aria-controls', 'panel-1');
    expect(tiles().filter((t) => t.getAttribute('aria-expanded') === 'true')).toHaveLength(1);
  });

  it('labels a locked Pro tool for screen readers without disabling it', () => {
    renderRail({ proToolAccess: { domain: false } });
    const address = screen.getByRole('button', { name: /Address/ });
    expect(address).toHaveAccessibleName('Address (Professional feature)');
    expect(address).toBeEnabled();
  });
});

describe('ToolRail — clicking', () => {
  it('opens a closed tool', async () => {
    renderRail();
    await userEvent.click(screen.getByRole('button', { name: 'Notice' }));
    expect(onSelect).toHaveBeenCalledWith('notice');
  });

  it('closes the open tool when its own tile is clicked again', async () => {
    renderRail({ active: 'notice' });
    await userEvent.click(screen.getByRole('button', { name: 'Notice' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('switches straight to another tool without closing first', async () => {
    renderRail({ active: 'notice' });
    await userEvent.click(screen.getByRole('button', { name: 'Pages' }));
    expect(onSelect).toHaveBeenCalledWith('pages');
  });
});

describe('ToolRail — keyboard', () => {
  it('has exactly one tab stop, on the open tool', () => {
    renderRail({ active: 'help' });
    const stops = tiles().filter((t) => t.tabIndex === 0);
    expect(stops).toEqual([screen.getByRole('button', { name: 'Help' })]);
  });

  it('puts the tab stop on the first tile when nothing is open', () => {
    renderRail();
    expect(tiles().filter((t) => t.tabIndex === 0)).toEqual([tiles()[0]]);
  });

  it('moves focus with the arrows, wrapping, without opening anything', async () => {
    const user = userEvent.setup();
    renderRail();
    tiles()[0]!.focus();
    await user.keyboard('{ArrowDown}');
    expect(tiles()[1]).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(tiles()[tiles().length - 1]).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('jumps to the ends with Home and End', async () => {
    const user = userEvent.setup();
    renderRail();
    tiles()[3]!.focus();
    await user.keyboard('{End}');
    expect(tiles()[tiles().length - 1]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(tiles()[0]).toHaveFocus();
  });

  it('opens the focused tool with Enter', async () => {
    const user = userEvent.setup();
    renderRail();
    tiles()[0]!.focus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onSelect).toHaveBeenCalledWith('pages');
  });
});
