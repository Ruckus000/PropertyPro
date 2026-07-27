/**
 * HeroPhotosField — the largest new interactive surface in Phase 9.
 *
 * Covers the §2.4 floor for it: keyboard-only operation end to end, the live
 * region, and where focus lands after a mutation. The last one is the part
 * that breaks silently — a removal that drops focus on <body> strands a
 * keyboard user with no way back into the list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeroPhotosField } from '@/components/pm/site-editor-v3/inspector/forms/fields/HeroPhotosField';
import type { HeroPhoto } from '@propertypro/shared';

const uploadMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-hero-photos', () => ({
  useHeroPhotos: () => ({
    uploads: [],
    upload: uploadMock,
    dismiss: vi.fn(),
    isUploading: false,
  }),
}));

const PHOTOS: HeroPhoto[] = [
  { path: '7/hero/pool.jpg', alt: 'The pool' },
  { path: '7/hero/gym.jpg', alt: 'The gym' },
  { path: '7/hero/lobby.jpg', alt: 'The lobby' },
];

function renderField(photos: HeroPhoto[] = PHOTOS) {
  const onChange = vi.fn();
  const view = render(
    <HeroPhotosField communityId={7} blockOrder={1} photos={photos} onChange={onChange} />,
  );
  return { onChange, view };
}

beforeEach(() => {
  uploadMock.mockReset();
});

describe('HeroPhotosField — labelling', () => {
  it('labels every control by position, not just by action', () => {
    // "Remove" repeated three times is useless in a screen reader's element
    // list.
    renderField();
    for (const n of [1, 2, 3]) {
      expect(screen.getByRole('button', { name: `Remove photo ${n}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Move photo ${n} up` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Move photo ${n} down` })).toBeInTheDocument();
    }
  });

  it('disables the moves that would fall off the ends', () => {
    // Disabled rather than a soft no-op: unlike FloatControls, this list is
    // short and entirely visible, so unavailable reads more honestly.
    renderField();
    expect(screen.getByRole('button', { name: 'Move photo 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move photo 3 down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move photo 1 down' })).toBeEnabled();
  });

  it('gives the thumbnail an empty alt so it is not announced twice', () => {
    const { view } = renderField();
    const thumbs = view.container.querySelectorAll('img');
    expect(Array.from(thumbs).every((img) => img.getAttribute('alt') === '')).toBe(true);
  });
});

describe('HeroPhotosField — keyboard operation', () => {
  it('reorders with the keyboard alone', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField();

    screen.getByRole('button', { name: 'Move photo 2 up' }).focus();
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith([
      { path: '7/hero/gym.jpg', alt: 'The gym' },
      { path: '7/hero/pool.jpg', alt: 'The pool' },
      { path: '7/hero/lobby.jpg', alt: 'The lobby' },
    ]);
  });

  it('removes with the keyboard alone', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField();

    screen.getByRole('button', { name: 'Remove photo 2' }).focus();
    await user.keyboard('{Enter}');

    expect(onChange).toHaveBeenCalledWith([
      { path: '7/hero/pool.jpg', alt: 'The pool' },
      { path: '7/hero/lobby.jpg', alt: 'The lobby' },
    ]);
  });

  it('edits alt text', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField([{ path: '7/hero/pool.jpg', alt: 'A' }]);

    await user.type(screen.getByLabelText('Alt text'), 'B');
    expect(onChange).toHaveBeenLastCalledWith([{ path: '7/hero/pool.jpg', alt: 'AB' }]);
  });

  it('swaps alt for the decorative flag, because the schema forbids both', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField([{ path: '7/hero/pool.jpg', alt: 'The pool' }]);

    await user.click(screen.getByLabelText('Decorative'));
    expect(onChange).toHaveBeenCalledWith([{ path: '7/hero/pool.jpg', decorative: true }]);
  });
});

describe('HeroPhotosField — announcements', () => {
  it('announces a move through a single live region', () => {
    const { view } = renderField();
    // One region for the whole field, matching SiteEditorProvider. Two would
    // announce the same move twice.
    expect(view.container.querySelectorAll('[aria-live]')).toHaveLength(1);
  });

  it('states the new position after a move', async () => {
    const user = userEvent.setup();
    // Re-render with the parent's updated list, as the real form does.
    const { view } = renderField();
    await user.click(screen.getByRole('button', { name: 'Move photo 2 up' }));

    await waitFor(() =>
      expect(view.container.querySelector('[aria-live]')).toHaveTextContent(
        'Photo 2 moved to position 1 of 3.',
      ),
    );
  });

  it('states how many photos remain after a removal', async () => {
    const user = userEvent.setup();
    const { view } = renderField();
    await user.click(screen.getByRole('button', { name: 'Remove photo 3' }));

    await waitFor(() =>
      expect(view.container.querySelector('[aria-live]')).toHaveTextContent(
        'Photo 3 removed. 2 photos left.',
      ),
    );
  });
});

describe('HeroPhotosField — focus after mutation', () => {
  it('leaves focus on a real element after a removal, not on the body', async () => {
    // Focusing synchronously in the handler loses the race with the row
    // unmounting; focus lands on <body> and a keyboard user is stranded.
    const user = userEvent.setup();
    function Harness() {
      const [photos, setPhotos] = useState(PHOTOS);
      return (
        <HeroPhotosField
          communityId={7}
          blockOrder={1}
          photos={photos}
          onChange={setPhotos}
        />
      );
    }
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Remove photo 2' }));

    await waitFor(() => {
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toBeInstanceOf(HTMLElement);
    });
  });

  it('falls back to the add-photos input when the list empties', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [photos, setPhotos] = useState<HeroPhoto[]>([
        { path: '7/hero/pool.jpg', alt: 'The pool' },
      ]);
      return (
        <HeroPhotosField
          communityId={7}
          blockOrder={1}
          photos={photos}
          onChange={setPhotos}
        />
      );
    }
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'Remove photo 1' }));

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText('Add photos')),
    );
  });
});

describe('HeroPhotosField — the cap', () => {
  it('stops accepting photos at the maximum', () => {
    const full = Array.from({ length: 8 }, (_, i) => ({
      path: `7/hero/p${i}.jpg`,
      alt: `Photo ${i}`,
    }));
    renderField(full);
    expect(screen.getByLabelText('Add photos')).toBeDisabled();
    expect(screen.getByText(/Maximum of 8 photos reached/)).toBeInTheDocument();
  });

  it('reports how many slots are left', () => {
    renderField();
    expect(screen.getByText(/5 of 8 remaining/)).toBeInTheDocument();
  });
});
