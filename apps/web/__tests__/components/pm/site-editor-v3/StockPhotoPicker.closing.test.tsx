/**
 * The picker while it closes. Radix keeps the dialog's content on the page
 * through its fade-out, but jsdom runs no animation, so here the dialog is
 * stood in for by one that always renders its content: what the picker shows
 * with `open` false is what a manager sees during the fade.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { StockPhotoPicker } from '@/components/pm/site-editor-v3/inspector/forms/fields/StockPhotoPicker';

vi.mock('@/components/ui/dialog', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: Pass,
    DialogContent: Pass,
    DialogHeader: Pass,
    DialogFooter: Pass,
    DialogTitle: Pass,
    DialogDescription: Pass,
  };
});

type Props = React.ComponentProps<typeof StockPhotoPicker>;

describe('StockPhotoPicker while it closes', () => {
  it('keeps showing the choice it closed on, not the props the parent moves on to', async () => {
    const user = userEvent.setup();
    const base: Props = {
      open: true,
      onOpenChange: vi.fn(),
      lookId: 'bayfront',
      replacing: 'palm-walk',
      inUse: ['palm-walk'],
      onChoose: vi.fn(),
    };
    const view = render(<StockPhotoPicker {...base} />);
    await user.click(screen.getByRole('button', { name: 'Sea oats' }));

    // The parent applies the choice and closes: no photo being replaced any more,
    // and Sea oats is now in the welcome.
    view.rerender(<StockPhotoPicker {...base} open={false} replacing={null} inUse={['sea-oats']} />);

    const palmWalk = screen.getByRole('button', { name: 'Palm walk' }) as HTMLButtonElement;
    expect(palmWalk.disabled).toBe(false);
    expect(within(palmWalk).getByText('In use')).toBeTruthy();
    const seaOats = screen.getByRole('button', { name: 'Sea oats' }) as HTMLButtonElement;
    expect(seaOats.disabled).toBe(false);
    expect(seaOats.getAttribute('aria-pressed')).toBe('true');
    expect(within(seaOats).queryByText('Already added')).toBeNull();
  });

  it('opens on the photo it is given, whatever it closed on', async () => {
    const user = userEvent.setup();
    const base: Props = {
      open: true,
      onOpenChange: vi.fn(),
      lookId: 'bayfront',
      replacing: 'palm-walk',
      inUse: ['palm-walk'],
      onChoose: vi.fn(),
    };
    const seen: string[] = [];
    const view = render(<StockPhotoPicker {...base} />);
    await user.click(screen.getByRole('button', { name: 'Sea oats' }));
    view.rerender(<StockPhotoPicker {...base} open={false} replacing={null} inUse={['sea-oats']} />);
    view.rerender(<StockPhotoPicker {...base} open replacing="shoreline" inUse={['shoreline']} />);
    for (const button of screen.getAllByRole('button', { pressed: true })) seen.push(button.getAttribute('aria-label') ?? '');
    expect(seen).toEqual(['Morning shoreline']);
  });
});
