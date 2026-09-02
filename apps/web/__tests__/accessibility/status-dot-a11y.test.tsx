/**
 * A StatusDot is colour and nothing else, which .claude/rules/design.md forbids:
 * "Status: NEVER color alone. Always icon + text + color."
 *
 * It shipped as `aria-hidden="true"`, so the dot was not merely unlabelled — it
 * was removed from the accessibility tree entirely, leaving screen-reader users
 * with no status signal at all, and colour-blind users unable to tell
 * `status-owner` (violet-700) from `status-board` (pink-700). The `label` prop
 * is required so a call site cannot silently reintroduce that.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusDot } from '@/components/shared/status-badge';

describe('StatusDot accessibility', () => {
  it('exposes an accessible name instead of hiding itself', () => {
    render(<StatusDot variant="owner" label="Unit owner" />);
    const dot = screen.getByRole('img', { name: 'Unit owner' });
    expect(dot).toBeInTheDocument();
    expect(dot).not.toHaveAttribute('aria-hidden', 'true');
  });

  it('still applies the variant colour class', () => {
    const { container } = render(<StatusDot variant="board" label="Board member" />);
    expect(container.firstElementChild).toHaveClass('bg-status-board');
  });
});
