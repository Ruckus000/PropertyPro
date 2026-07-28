/**
 * Tool tabs — ARIA contract and keyboard traversal.
 *
 * These tabs are hand-rolled rather than built on Radix (icon+label tiles in a
 * fixed six-across row), which means the accessibility contract Radix would
 * have given for free has to be asserted explicitly. That is what this file is
 * for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolTabs } from '@/components/pm/site-editor-v3/ToolTabs';
import { EDITOR_TOOLS } from '@/components/pm/site-editor-v3/tools';

const onSelect = vi.fn();

function renderTabs(overrides: Partial<React.ComponentProps<typeof ToolTabs>> = {}) {
  return render(
    <ToolTabs
      active="sections"
      onSelect={onSelect}
      proToolAccess={{ styling: true, domain: true }}
      panelId="panel-1"
      {...overrides}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('ToolTabs — structure', () => {
  it('exposes a labelled tablist with one tab per tool', () => {
    renderTabs();
    expect(screen.getByRole('tablist', { name: 'Website tools' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(EDITOR_TOOLS.length);
  });

  it('marks exactly one tab selected', () => {
    renderTabs();
    const selected = screen.getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveAccessibleName(/Sections/);
  });

  it('points every tab at the panel it controls', () => {
    renderTabs();
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveAttribute('aria-controls', 'panel-1');
    }
  });

  it('uses a roving tabindex so the group is one tab stop', () => {
    renderTabs();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(tabs.filter((t) => t.getAttribute('tabindex') === '-1')).toHaveLength(
      EDITOR_TOOLS.length - 1,
    );
  });
});

describe('ToolTabs — keyboard traversal', () => {
  it('moves to the next tool on ArrowRight', async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenCalledWith('add');
  });

  it('moves to the previous tool on ArrowLeft', async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.tab();
    await user.keyboard('{ArrowLeft}');
    // The tool immediately left of `sections` in EDITOR_TOOLS. Phase 7 inserted
    // `notice` between `site` and `sections`, so this reads from the registry
    // rather than naming a tool, and a future reorder does not silently pass.
    const previous = EDITOR_TOOLS[EDITOR_TOOLS.findIndex((t) => t.id === 'sections') - 1];
    expect(onSelect).toHaveBeenCalledWith(previous!.id);
  });

  it('wraps from the last tool to the first', async () => {
    const user = userEvent.setup();
    renderTabs({ active: 'help' });
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenCalledWith('site');
  });

  it('wraps from the first tool to the last', async () => {
    const user = userEvent.setup();
    renderTabs({ active: 'site' });
    await user.tab();
    await user.keyboard('{ArrowLeft}');
    expect(onSelect).toHaveBeenCalledWith('help');
  });

  it('jumps to the first and last tool on Home and End', async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.tab();
    await user.keyboard('{Home}');
    expect(onSelect).toHaveBeenCalledWith('site');
    await user.keyboard('{End}');
    expect(onSelect).toHaveBeenCalledWith('help');
  });

  it('ignores keys it does not own', async () => {
    const user = userEvent.setup();
    renderTabs();
    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('ToolTabs — gating', () => {
  it('announces Pro tools as gated without hiding them', () => {
    renderTabs({ proToolAccess: { styling: false, domain: false } });
    // Visible and reachable — the upsell only works if the tool is discoverable.
    expect(screen.getByRole('tab', { name: /Colours/ })).toBeEnabled();
    expect(screen.getByRole('tab', { name: /Colours/ })).toHaveAccessibleName(/Professional feature/);
    expect(screen.getByRole('tab', { name: /Address/ })).toHaveAccessibleName(/Professional feature/);
  });

  it('gates each Pro tool on its OWN plan feature', () => {
    // hasSiteCustomCss and hasSiteCustomDomain are independent — a community
    // can hold one without the other. Collapsing them mislabels a tab.
    renderTabs({ proToolAccess: { styling: false, domain: true } });
    expect(screen.getByRole('tab', { name: /Colours/ })).toHaveAccessibleName(/Professional feature/);
    expect(screen.getByRole('tab', { name: /Address/ })).not.toHaveAccessibleName(
      /Professional feature/,
    );
  });

  it('gates the styling tool independently of the domain tool', () => {
    renderTabs({ proToolAccess: { styling: true, domain: false } });
    expect(screen.getByRole('tab', { name: /Colours/ })).not.toHaveAccessibleName(
      /Professional feature/,
    );
    expect(screen.getByRole('tab', { name: /Address/ })).toHaveAccessibleName(/Professional feature/);
  });

  it('does not mark non-Pro tools as gated', () => {
    renderTabs({ proToolAccess: { styling: false, domain: false } });
    expect(screen.getByRole('tab', { name: /Sections/ })).not.toHaveAccessibleName(
      /Professional feature/,
    );
  });
});
