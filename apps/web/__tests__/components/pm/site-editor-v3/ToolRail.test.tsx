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
import { EDITOR_TOOLS, HELP_RAIL_ITEM } from '@/components/pm/site-editor-v3/tools';

const onSelect = vi.fn();
const onHelpToggle = vi.fn();

function renderRail(overrides: Partial<React.ComponentProps<typeof ToolRail>> = {}) {
  return render(
    <ToolRail
      active={null}
      onSelect={onSelect}
      panelId="panel-1"
      helpOpen={false}
      onHelpToggle={onHelpToggle}
      helpId="help-1"
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
    expect(tiles().map((t) => t.textContent)).toEqual([
      ...EDITOR_TOOLS.map((t) => t.label),
      HELP_RAIL_ITEM.label,
    ]);
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
});

describe('ToolRail — attention badges', () => {
  it('shows a count on the tool and says it in the accessible name', () => {
    renderRail({ badges: { documents: 2 } });
    const documents = screen.getByTestId('site-editor-tool-documents');
    expect(documents).toHaveAccessibleName('Documents (2 need attention)');
    expect(documents).toHaveTextContent('2');
  });

  it('uses the singular for one', () => {
    renderRail({ badges: { documents: 1 } });
    expect(screen.getByTestId('site-editor-tool-documents')).toHaveAccessibleName(
      'Documents (1 needs attention)',
    );
  });

  it('shows nothing for zero', () => {
    renderRail({ badges: { documents: 0 } });
    const documents = screen.getByTestId('site-editor-tool-documents');
    expect(documents).toHaveAccessibleName('Documents');
    expect(documents.textContent).toBe('Documents');
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

describe('ToolRail — Help tile', () => {
  it('toggles the Help drawer instead of choosing a tool panel', async () => {
    renderRail({ active: 'pages' });
    await userEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(onHelpToggle).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('reports the drawer, not the tool panel, as what it controls', () => {
    renderRail({ active: 'pages', helpOpen: true });
    const help = screen.getByRole('button', { name: 'Help' });
    expect(help).toHaveAttribute('aria-expanded', 'true');
    expect(help).toHaveAttribute('aria-controls', 'help-1');
    // The open tool keeps its own state beside it.
    expect(screen.getByRole('button', { name: 'Pages' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('is collapsed with no aria-controls while the drawer is closed', () => {
    renderRail();
    const help = screen.getByRole('button', { name: 'Help' });
    expect(help).toHaveAttribute('aria-expanded', 'false');
    expect(help).not.toHaveAttribute('aria-controls');
  });
});

describe('ToolRail — keyboard', () => {
  it('has exactly one tab stop, on the open tool', () => {
    renderRail({ active: 'notice' });
    const stops = tiles().filter((t) => t.tabIndex === 0);
    expect(stops).toEqual([screen.getByRole('button', { name: 'Notice' })]);
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
