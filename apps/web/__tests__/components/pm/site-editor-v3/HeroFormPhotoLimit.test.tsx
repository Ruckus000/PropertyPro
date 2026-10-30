/**
 * The hero holds at most MAX_HERO_PHOTOS photos (`heroBlockSchema`). A ninth would
 * make the route refuse every autosave ("Invalid hero block content") until a photo
 * was taken away, so the form is the last place that can refuse it first.
 *
 * The photo field keeps the list within the maximum itself, which is why this file
 * gives the form a field that does not: a stand-in that can push a photo past the
 * limit. What is under test is the form's own refusal, not the field's counting.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MAX_HERO_PHOTOS, heroBlockSchema, type HeroPhoto } from '@propertypro/shared';

const updateHeroMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-hero-block', () => ({
  useHeroBlock: () => ({ data: null }),
  useUpdateHeroBlock: () => ({ mutateAsync: updateHeroMock, isPending: false }),
}));

vi.mock('@/components/pm/site-editor-v3/inspector/forms/fields/HeroPhotosField', async () => {
  const { createElement: h } = await import('react');
  return {
    HeroPhotosField: ({
      photos,
      onChange,
    }: {
      photos: HeroPhoto[];
      onChange: (next: HeroPhoto[]) => void;
    }) =>
      h(
        'div',
        null,
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              onChange([
                ...photos,
                { path: `7/hero/extra-${photos.length}.jpg`, alt: 'Another photo' },
              ]),
          },
          'Add a photo past the limit',
        ),
        h(
          'button',
          { type: 'button', onClick: () => onChange(photos.slice(0, -1)) },
          'Remove the last photo',
        ),
      ),
  };
});

import { HeroForm } from '@/components/pm/site-editor-v3/inspector/forms/HeroForm';
import { settleAutosave } from './autosave-harness';

const FULL: HeroPhoto[] = Array.from({ length: MAX_HERO_PHOTOS }, (_, i) => ({
  path: `7/hero/p${i}.jpg`,
  alt: `Photo ${i}`,
}));
const CONTENT = { headline: 'Welcome to Sunset Condos', photos: FULL };

const LIMIT_SENTENCE = 'The hero can show up to 8 photos. Remove one to save your changes.';
const GENERAL_SENTENCE = /Add a headline, describe every photo/;

function renderHero() {
  return render(<HeroForm communityId={7} blockType="hero" blockOrder={1} content={CONTENT} />);
}
const addNinth = () => fireEvent.click(screen.getByRole('button', { name: 'Add a photo past the limit' }));
const removeLast = () => fireEvent.click(screen.getByRole('button', { name: 'Remove the last photo' }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  updateHeroMock.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('HeroForm — the photo limit', () => {
  it('is the schema that sets the limit: 8 photos are valid and 9 are not', () => {
    // Anti-vacuity for everything below: the fixture is the largest valid hero.
    expect(heroBlockSchema.safeParse(CONTENT).success).toBe(true);
    expect(
      heroBlockSchema.safeParse({
        ...CONTENT,
        photos: [...FULL, { path: '7/hero/p8.jpg', alt: 'Photo 8' }],
      }).success,
    ).toBe(false);
  });

  it('words the limit from the shared maximum', () => {
    expect(LIMIT_SENTENCE).toBe(
      `The hero can show up to ${MAX_HERO_PHOTOS} photos. Remove one to save your changes.`,
    );
  });

  it('says nothing and saves nothing for a hero at the maximum', async () => {
    renderHero();
    await settleAutosave();

    expect(screen.queryByText(LIMIT_SENTENCE)).not.toBeInTheDocument();
    expect(screen.queryByText(GENERAL_SENTENCE)).not.toBeInTheDocument();
    expect(updateHeroMock).not.toHaveBeenCalled();
  });

  it('refuses a ninth photo: nothing is saved', async () => {
    renderHero();

    addNinth();
    await settleAutosave();

    expect(updateHeroMock).not.toHaveBeenCalled();
  });

  it('says why, in the sentence of its own', async () => {
    renderHero();

    addNinth();
    await settleAutosave();

    expect(screen.getByText(LIMIT_SENTENCE)).toBeInTheDocument();
    // The general sentence is about the headline, descriptions and button; none of
    // those is the problem, so it must not be offered as the reason.
    expect(screen.queryByText(GENERAL_SENTENCE)).not.toBeInTheDocument();
  });

  it('saves again, with the maximum, once a photo is taken away', async () => {
    renderHero();

    addNinth();
    await settleAutosave();
    expect(updateHeroMock).not.toHaveBeenCalled();

    removeLast();
    await settleAutosave();

    expect(screen.queryByText(LIMIT_SENTENCE)).not.toBeInTheDocument();
    // Back to what is stored, so there is nothing new to write; a further edit saves.
    fireEvent.change(screen.getByLabelText(/headline/i), { target: { value: 'Welcome home' } });
    await settleAutosave();
    expect(updateHeroMock).toHaveBeenCalledTimes(1);
    expect(updateHeroMock.mock.calls[0]![0].photos).toHaveLength(MAX_HERO_PHOTOS);
  });

  it('keeps the general sentence for a different problem', async () => {
    renderHero();

    fireEvent.change(screen.getByLabelText(/headline/i), { target: { value: '' } });
    await settleAutosave();

    expect(screen.getByText(GENERAL_SENTENCE)).toBeInTheDocument();
    expect(screen.queryByText(LIMIT_SENTENCE)).not.toBeInTheDocument();
    expect(updateHeroMock).not.toHaveBeenCalled();
  });
});
