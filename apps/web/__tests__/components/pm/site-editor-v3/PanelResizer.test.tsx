/**
 * Panel resizer — keyboard operation is the primary contract, not a fallback.
 *
 * Also covers the clamping rules, including the case that actually bites in
 * production: a corrupt or out-of-range persisted width must not be able to
 * restore the panel at a size that hides the canvas.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PanelResizer } from '@/components/pm/site-editor-v3/PanelResizer';
import {
  clampPanelWidth,
  PANEL_MIN_WIDTH,
  PANEL_MAX_WIDTH,
  PANEL_DEFAULT_WIDTH,
} from '@/components/pm/site-editor-v3/use-panel-width';

const onWidthChange = vi.fn();

function renderResizer(width = 340) {
  return render(<PanelResizer width={width} onWidthChange={onWidthChange} />);
}

beforeEach(() => vi.clearAllMocks());

describe('PanelResizer — ARIA', () => {
  it('is a labelled vertical separator carrying its range', () => {
    renderResizer(340);
    const sep = screen.getByRole('separator', { name: 'Resize the tools panel' });
    expect(sep).toHaveAttribute('aria-orientation', 'vertical');
    expect(sep).toHaveAttribute('aria-valuenow', '340');
    expect(sep).toHaveAttribute('aria-valuemin', String(PANEL_MIN_WIDTH));
    expect(sep).toHaveAttribute('aria-valuemax', String(PANEL_MAX_WIDTH));
  });

  it('is focusable', async () => {
    const user = userEvent.setup();
    renderResizer();
    await user.tab();
    expect(screen.getByRole('separator')).toHaveFocus();
  });
});

describe('PanelResizer — keyboard', () => {
  it('moves by 16px on arrow keys', async () => {
    const user = userEvent.setup();
    renderResizer(340);
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(onWidthChange).toHaveBeenCalledWith(356);
    await user.keyboard('{ArrowLeft}');
    expect(onWidthChange).toHaveBeenCalledWith(324);
  });

  it('moves by 48px with Shift held', async () => {
    const user = userEvent.setup();
    renderResizer(340);
    await user.tab();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(onWidthChange).toHaveBeenCalledWith(388);
  });

  it('jumps to the bounds on Home and End', async () => {
    const user = userEvent.setup();
    renderResizer(340);
    await user.tab();
    await user.keyboard('{Home}');
    expect(onWidthChange).toHaveBeenCalledWith(PANEL_MIN_WIDTH);
    await user.keyboard('{End}');
    expect(onWidthChange).toHaveBeenCalledWith(PANEL_MAX_WIDTH);
  });

  it('ignores unrelated keys', async () => {
    const user = userEvent.setup();
    renderResizer();
    await user.tab();
    await user.keyboard('{Enter}{ArrowUp}a');
    expect(onWidthChange).not.toHaveBeenCalled();
  });
});

describe('clampPanelWidth', () => {
  it('passes values already in range', () => {
    expect(clampPanelWidth(340)).toBe(340);
    expect(clampPanelWidth(PANEL_MIN_WIDTH)).toBe(PANEL_MIN_WIDTH);
    expect(clampPanelWidth(PANEL_MAX_WIDTH)).toBe(PANEL_MAX_WIDTH);
  });

  it('clamps at both ends rather than erroring', () => {
    expect(clampPanelWidth(10)).toBe(PANEL_MIN_WIDTH);
    expect(clampPanelWidth(99_999)).toBe(PANEL_MAX_WIDTH);
    expect(clampPanelWidth(-500)).toBe(PANEL_MIN_WIDTH);
  });

  it('parses the string form localStorage returns', () => {
    expect(clampPanelWidth('420')).toBe(420);
    expect(clampPanelWidth('900')).toBe(PANEL_MAX_WIDTH);
  });

  it('falls back to the default on garbage', () => {
    // A corrupt localStorage entry must not be able to collapse the panel.
    for (const bad of ['', 'abc', null, undefined, NaN, Infinity, {}, []]) {
      expect(clampPanelWidth(bad)).toBe(PANEL_DEFAULT_WIDTH);
    }
  });

  it('rounds fractional widths to whole pixels', () => {
    expect(clampPanelWidth(340.6)).toBe(341);
  });
});
