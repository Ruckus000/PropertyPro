// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PresetCards, type PresetCardData } from '@/components/pm/site-editor-v3/panels/preset-cards';

const SAMPLE_PRESETS: PresetCardData[] = [
  {
    slug: 'bay-light',
    displayName: 'Bay Light',
    description: 'Tidewater default — warm ivory ground.',
    tokens: {
      primaryColor: '#0e3338',
      secondaryColor: '#f6f1e6',
      accentColor: '#c66f49',
      headingFont: 'Fraunces',
      bodyFont: 'Manrope',
    },
    tier: 'essentials',
    isFeatured: true,
  },
  {
    slug: 'midnight-coast',
    displayName: 'Midnight Coast',
    description: 'Deep navy + sunlit ochre + seafoam.',
    tokens: {
      primaryColor: '#1f2a44',
      secondaryColor: '#f4ede1',
      accentColor: '#d68a2a',
      headingFont: 'Newsreader',
      bodyFont: 'Manrope',
    },
    tier: 'essentials',
    isFeatured: true,
  },
  {
    slug: 'noir-coastal',
    displayName: 'Noir Coastal',
    description: 'Charcoal-warm + pale stone + brass accent.',
    tokens: {
      primaryColor: '#2b2a27',
      secondaryColor: '#d4cbb6',
      accentColor: '#8c7355',
      headingFont: 'Cormorant Garamond',
      bodyFont: 'Manrope',
    },
    tier: 'essentials',
    isFeatured: false,
  },
];

describe('<PresetCards>', () => {
  it('lets a card be chosen', () => {
    const onChoose = vi.fn();
    render(<PresetCards presets={SAMPLE_PRESETS} selected="bay-light" onChoose={onChoose} name="cards" />);

    expect(screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).disabled)).toBe(true);
    fireEvent.click(screen.getByLabelText(/midnight coast/i));

    expect(onChoose).toHaveBeenCalledWith('midnight-coast');
  });

  it('holds every card still while disabled, and says so in the card', async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(<PresetCards presets={SAMPLE_PRESETS} selected="bay-light" onChoose={onChoose} name="cards" disabled />);

    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios).toHaveLength(SAMPLE_PRESETS.length);
    expect(radios.every((radio) => radio.disabled)).toBe(true);
    // A person's click, on the card or on its radio: neither chooses it.
    await user.click(screen.getByTestId('preset-card-midnight-coast'));
    await user.click(screen.getByLabelText(/midnight coast/i));

    expect(onChoose).not.toHaveBeenCalled();
    // The card itself shows it, so a pointer is not offered a click that does nothing.
    expect(screen.getByTestId('preset-card-midnight-coast')).toHaveClass('cursor-not-allowed');
    expect(screen.getByTestId('preset-card-midnight-coast')).not.toHaveClass('cursor-pointer');
  });

  // Combined plan Task 28: the cards moved from the 340px rail panel to the
  // wide Design tab, so they flow into columns. jsdom has no layout; this pins
  // the classes that do it. Revert check: back to `grid grid-cols-1 gap-3`.
  it('lays the cards out in columns on the wide Design tab', () => {
    render(<PresetCards presets={SAMPLE_PRESETS} selected={null} onChoose={vi.fn()} name="p" />);
    expect(screen.getByRole('group', { name: 'Theme preset' })).toHaveClass(
      'grid-cols-1',
      'sm:grid-cols-2',
      'xl:grid-cols-3',
    );
  });
});
