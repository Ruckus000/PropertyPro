/**
 * HeroForm — the reconciliation cases that only the hero exercises.
 *
 * The hero is the one form whose `toDraft` -> `toCanonical` deliberately does
 * NOT round-trip: it migrates a legacy `heroImagePath`/`heroImageAlt` pair into
 * a `photos` array, so the canonical projection of an untouched legacy hero
 * differs from the content it was built from. That made an earlier version of
 * `useBlockForm` treat every legacy hero as permanently dirty, because it
 * compared the canonical projection against the RAW stored content.
 *
 * These tests pin the projection-vs-projection comparison that replaced it, and
 * the `markClean` call that stops an adoption from being written back.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

const updateHeroMock = vi.fn();
vi.mock('@/hooks/use-hero-block', () => ({
  useHeroBlock: () => ({ data: null }),
  useUpdateHeroBlock: () => ({ mutateAsync: updateHeroMock, isPending: false }),
}));

// HeroPhotosField reaches the upload queue; this form's reconciliation is what
// is under test, so the queue is stubbed out entirely.
vi.mock('@/hooks/use-hero-photos', () => ({
  useHeroPhotos: () => ({
    uploads: [],
    upload: vi.fn(),
    dismiss: vi.fn(),
    isUploading: false,
  }),
}));

import { HeroForm } from '@/components/pm/site-editor-v3/inspector/forms/HeroForm';
import { settleAutosave } from './autosave-harness';

/** A hero as stored before `photos` existed. */
const LEGACY = {
  headline: 'Welcome to Sunset Condos',
  heroImagePath: '7/hero/pool.jpg.1600w.webp',
  heroImageAlt: 'The pool',
};

function renderHero(content: unknown) {
  return render(
    <HeroForm communityId={7} blockType="hero" blockOrder={1} content={content} />,
  );
}

const headline = () => screen.getByLabelText(/headline/i) as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  updateHeroMock.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
});

/** Past the 800ms autosave debounce. */

describe('HeroForm — reconciliation', () => {
  it('opens a legacy hero with its image already resolved into the photo list', () => {
    renderHero(LEGACY);
    expect(headline().value).toBe('Welcome to Sunset Condos');
    // The variant suffix is stripped and the pair becomes one photo row.
    expect(screen.getByDisplayValue('The pool')).toBeInTheDocument();
  });

  it('does not write anything on mount for a legacy hero', async () => {
    // The migration is a read-time upgrade. If mounting the form were enough
    // to write it, merely LOOKING at a hero would produce a publish diff.
    renderHero(LEGACY);
    await settleAutosave();
    expect(updateHeroMock).not.toHaveBeenCalled();
  });

  it('adopts a foreign change on a pristine legacy hero', async () => {
    // THE regression. `toCanonical` emits `{headline, photos:[...]}` while the
    // stored content is `{headline, heroImagePath, heroImageAlt}` — comparing
    // the projection against the raw content made this hero read as dirty from
    // the very first render, so this update was silently ignored.
    const { rerender } = renderHero(LEGACY);
    expect(headline().value).toBe('Welcome to Sunset Condos');

    rerender(
      <HeroForm
        communityId={7}
        blockType="hero"
        blockOrder={1}
        content={{ ...LEGACY, headline: 'Reverted headline' }}
      />,
    );

    expect(headline().value).toBe('Reverted headline');
  });

  it('does not write back content it merely adopted', async () => {
    // Adoption changes `canonical`, which arms the debounce. Without
    // `markClean` the editor writes the adopted content — including the hero
    // photos migration — one window later, caused by a background refetch
    // rather than by the PM.
    const { rerender } = renderHero(LEGACY);
    rerender(
      <HeroForm
        communityId={7}
        blockType="hero"
        blockOrder={1}
        content={{ ...LEGACY, headline: 'Reverted headline' }}
      />,
    );

    await settleAutosave();
    expect(updateHeroMock).not.toHaveBeenCalled();
  });

  it('keeps the PM edit when a foreign change arrives mid-edit', async () => {
    // The deliberate limitation of this phase: last-writer-wins, the PM's text
    // is not thrown away. Pinned so changing it is a decision, not a drift.
    const { rerender } = renderHero(LEGACY);

    await act(async () => {
      headline().focus();
      // Simulate typing via the controlled input's onChange.
      const input = headline();
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(input, 'PM is typing this');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(headline().value).toBe('PM is typing this');

    rerender(
      <HeroForm
        communityId={7}
        blockType="hero"
        blockOrder={1}
        content={{ ...LEGACY, headline: 'Someone else saved this' }}
      />,
    );

    expect(headline().value).toBe('PM is typing this');
  });

  it('migrates the legacy pair to photos when the PM actually edits', async () => {
    const { rerender: _ } = renderHero(LEGACY);

    await act(async () => {
      const input = headline();
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(input, 'A new headline');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settleAutosave();

    expect(updateHeroMock).toHaveBeenCalledTimes(1);
    const sent = updateHeroMock.mock.calls[0]![0];
    expect(sent.headline).toBe('A new headline');
    // The migration: base path in `photos`, and the legacy keys are gone —
    // heroBlockSchema refuses content carrying both shapes.
    expect(sent.photos).toEqual([{ path: '7/hero/pool.jpg', alt: 'The pool' }]);
    expect(sent).not.toHaveProperty('heroImagePath');
    expect(sent).not.toHaveProperty('heroImageAlt');
  });
});
