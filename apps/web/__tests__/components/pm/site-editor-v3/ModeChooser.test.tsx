/**
 * Website builder v4, Phase 3 — the first-run chooser.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModeChooser } from '@/components/pm/site-editor-v3/guidance/ModeChooser';

describe('ModeChooser', () => {
  it('offers Guide me (recommended) and Let me edit freely, and reports the choice', async () => {
    const onChoose = vi.fn();
    render(<ModeChooser onChoose={onChoose} onDismiss={vi.fn()} />);
    expect(
      screen.getByRole('dialog', { name: 'How would you like to work on your website?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guide me/i })).toHaveTextContent('Recommended');
    await userEvent.click(screen.getByRole('button', { name: /let me edit freely/i }));
    expect(onChoose).toHaveBeenCalledWith('free');
  });

  it('is dismissed by Escape without a choice', async () => {
    const onChoose = vi.fn();
    const onDismiss = vi.fn();
    render(<ModeChooser onChoose={onChoose} onDismiss={onDismiss} />);
    await userEvent.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('makes no promise about Florida fines', () => {
    render(<ModeChooser onChoose={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.queryByText(/\$50|fine/i)).not.toBeInTheDocument();
  });
});
