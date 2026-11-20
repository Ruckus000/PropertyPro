import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { stockPhotoSrc } from '@propertypro/shared';
import { StockPhotoPicker } from '@/components/pm/site-editor-v3/inspector/forms/fields/StockPhotoPicker';

type Props = React.ComponentProps<typeof StockPhotoPicker>;

function setup(over: Partial<Props> = {}) {
  const onOpenChange = vi.fn();
  const onChoose = vi.fn();
  const utils = render(
    <StockPhotoPicker
      open
      onOpenChange={onOpenChange}
      lookId="bayfront"
      replacing={null}
      inUse={[]}
      onChoose={onChoose}
      {...over}
    />,
  );
  return { onOpenChange, onChoose, ...utils };
}

const names = (el: HTMLElement) =>
  within(el)
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');

describe('StockPhotoPicker', () => {
  it('groups the look suggestions first, then the rest', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Choose a photo' })).toBeTruthy();
    expect(screen.getByText('Your site uses Bayfront')).toBeTruthy();
    const suggested = screen.getByRole('group', { name: 'Suggested for Bayfront' });
    expect(names(suggested)).toEqual(['Pilings at dusk', 'Gulf sunset', 'Morning shoreline']);
    const more = screen.getByRole('group', { name: 'More photos' });
    expect(within(more).getAllByRole('button')).toHaveLength(10);
    expect(screen.queryByRole('button', { name: 'Sunset over the water' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Palm-lined street' })).toBeNull();
  });

  it.each([null, 'plain-simple'] as const)('lookId %s has one Our photos group', (lookId) => {
    setup({ lookId });
    expect(screen.queryByRole('group', { name: /Suggested for/ })).toBeNull();
    const all = screen.getByRole('group', { name: 'Our photos' });
    expect(within(all).getAllByRole('button')).toHaveLength(13);
    if (lookId === null) expect(screen.queryByText(/Your site uses/)).toBeNull();
  });

  it('marks the photo being replaced and needs another choice', async () => {
    const user = userEvent.setup();
    const { onChoose, onOpenChange } = setup({ replacing: 'gulf-sunset' });
    const current = screen.getByRole('button', { name: 'Gulf sunset' });
    expect(current.getAttribute('aria-pressed')).toBe('true');
    expect(within(current).getByText('In use')).toBeTruthy();
    const use = screen.getByRole('button', { name: 'Use this photo' });
    expect((use as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Sea oats' }));
    expect((use as HTMLButtonElement).disabled).toBe(false);
    await user.click(use);
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith('sea-oats');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('a retired replaced photo shows no In use marker', async () => {
    const user = userEvent.setup();
    setup({ replacing: 'sunset' });
    expect(screen.queryByText('In use')).toBeNull();
    const use = screen.getByRole('button', { name: 'Use this photo' }) as HTMLButtonElement;
    expect(use.disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Palm walk' }));
    expect(use.disabled).toBe(false);
  });

  it('disables a photo already used elsewhere', () => {
    setup({ inUse: ['palm-walk'] });
    expect((screen.getByRole('button', { name: 'Palm walk' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Escape and Cancel close without choosing', async () => {
    const user = userEvent.setup();
    const { onOpenChange, onChoose } = setup();
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    onOpenChange.mockClear();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('renders each thumbnail lazily with empty alt', () => {
    setup();
    const btn = screen.getByRole('button', { name: 'Gulf sunset' });
    const img = btn.querySelector('img');
    expect(img?.getAttribute('src')).toBe(stockPhotoSrc('gulf-sunset', 480));
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('alt')).toBe('');
  });

  it('has no axe violations', async () => {
    const { baseElement } = setup({ replacing: 'gulf-sunset', inUse: ['palm-walk'] });
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
