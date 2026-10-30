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
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HeroPhotosField } from '@/components/pm/site-editor-v3/inspector/forms/fields/HeroPhotosField';
import { STOCK_PHOTO_ALT, type HeroPhoto } from '@propertypro/shared';

const uploadMock = vi.hoisted(() => vi.fn());
// Captured so a test can drive a completion the way the real queue would.
const heroPhotosHook = vi.hoisted(() => ({
  onUploaded: null as
    | ((result: { storagePath: string; altText: string }, item: unknown) => void)
    | null,
}));
vi.mock('@/hooks/use-hero-photos', () => ({
  useHeroPhotos: ({ onUploaded }: { onUploaded: never }) => {
    heroPhotosHook.onUploaded = onUploaded;
    return { uploads: [], upload: uploadMock, dismiss: vi.fn(), isUploading: false };
  },
}));

/** jsdom never fires img.onload, so an un-stubbed decode HANGS the test. */
const okDimensions = () => Promise.resolve({ width: 1920, height: 1080 });

function imageFile(name: string, bytes = 2048): File {
  const f = new File(['x'], name, { type: 'image/jpeg' });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
}

const PHOTOS: HeroPhoto[] = [
  { path: '7/hero/pool.jpg', alt: 'The pool' },
  { path: '7/hero/gym.jpg', alt: 'The gym' },
  { path: '7/hero/lobby.jpg', alt: 'The lobby' },
];

function renderField(photos: HeroPhoto[] = PHOTOS) {
  const onChange = vi.fn();
  const view = render(
    <HeroPhotosField
      communityId={7}
      blockOrder={1}
      photos={photos}
      onChange={onChange}
      readDimensions={okDimensions}
    />,
  );
  return { onChange, view };
}

beforeEach(() => {
  uploadMock.mockReset();
  heroPhotosHook.onUploaded = null;
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

describe('HeroPhotosField — stock photos', () => {
  // D3. A stock photo is one of ours, with no path: it shows its thumbnail, can be
  // reworded, removed, moved, swapped for the other one, or replaced by an upload.
  const SUNSET: HeroPhoto = { stock: 'sunset', alt: 'Sunset over the water' };
  const PALMS: HeroPhoto = { stock: 'palms', alt: 'Palm trees' };
  const POOL: HeroPhoto = { path: '7/hero/pool.jpg', alt: 'The pool' };

  /** The parent's job: hold the list, so a change shows on the next render. */
  function Harness({ initial, onList }: { initial: HeroPhoto[]; onList?: (l: HeroPhoto[]) => void }) {
    const [photos, setPhotos] = useState(initial);
    return (
      <HeroPhotosField
        communityId={7}
        blockOrder={1}
        photos={photos}
        onChange={(next) => {
          setPhotos(next);
          onList?.(next);
        }}
        readDimensions={okDimensions}
      />
    );
  }
  const thumbSrcs = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('img')).map((img) => img.getAttribute('src'));

  it('a stock photo shows its thumbnail and can be removed or replaced', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initial={[SUNSET, POOL]} />);

    // Its thumbnail, from the site's own folder.
    expect(thumbSrcs(container)[0]).toBe('/site-looks/sunset.webp');

    // Replaced by the other stock photo: its picture AND its description change.
    await user.click(screen.getByRole('button', { name: 'Use the palm-lined street photo instead' }));
    expect(thumbSrcs(container)[0]).toBe('/site-looks/palms.webp');
    expect(screen.getAllByLabelText('Alt text')[0]).toHaveValue(STOCK_PHOTO_ALT.palms);

    // Removed.
    await user.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(thumbSrcs(container)).toEqual([expect.stringContaining('7/hero/pool.jpg')]);
  });

  it('shows a stock photo with its thumbnail and an editable description', () => {
    const { view } = renderField([SUNSET, POOL]);

    const thumbs = Array.from(view.container.querySelectorAll('img'));
    expect(thumbs[0]).toHaveAttribute('src', '/site-looks/sunset.webp');
    // The description is in the field beside it; the thumbnail is not announced.
    expect(thumbs[0]).toHaveAttribute('alt', '');
    const [stockAlt] = screen.getAllByLabelText('Alt text');
    expect(stockAlt).toHaveValue('Sunset over the water');
    expect(stockAlt).not.toHaveAttribute('readonly');
    expect(stockAlt).toHaveAttribute('maxlength', '200');
    // A stock photo cannot be decorative, so only the upload has the checkbox.
    expect(screen.getAllByLabelText('Decorative')).toHaveLength(1);
  });

  it("edits a stock photo's description, and nothing else about it", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField([SUNSET, POOL]);

    await user.type(screen.getAllByLabelText('Alt text')[0]!, '!');
    expect(onChange).toHaveBeenLastCalledWith([
      { stock: 'sunset', alt: 'Sunset over the water!' },
      POOL,
    ]);
  });

  it('keeps a stock photo, unchanged, when another photo is removed', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField([SUNSET, POOL]);

    await user.click(screen.getByRole('button', { name: 'Remove photo 2' }));
    expect(onChange).toHaveBeenCalledWith([SUNSET]);
  });

  it('removes a stock photo like any other', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField([SUNSET, POOL]);

    await user.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(onChange).toHaveBeenCalledWith([POOL]);
  });

  it('moves a stock photo like any other, carrying it unchanged', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField([SUNSET, POOL]);

    await user.click(screen.getByRole('button', { name: 'Move photo 2 up' }));
    expect(onChange).toHaveBeenCalledWith([POOL, SUNSET]);
  });

  it('keeps an uploaded photo editable beside a stock one', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField([SUNSET, POOL]);

    await user.type(screen.getAllByLabelText('Alt text')[1]!, '!');
    expect(onChange).toHaveBeenLastCalledWith([SUNSET, { path: '7/hero/pool.jpg', alt: 'The pool!' }]);
  });

  describe('swapping for the other stock photo', () => {
    it('puts the other photo in the same place, with its own description', async () => {
      const user = userEvent.setup();
      const { onChange } = renderField([POOL, SUNSET]);

      await user.click(
        screen.getByRole('button', { name: 'Use the palm-lined street photo instead' }),
      );
      expect(onChange).toHaveBeenCalledWith([
        POOL,
        { stock: 'palms', alt: STOCK_PHOTO_ALT.palms },
      ]);
    });

    it('swaps back the other way', async () => {
      const user = userEvent.setup();
      const { onChange } = renderField([PALMS]);

      await user.click(screen.getByRole('button', { name: 'Use the sunset photo instead' }));
      expect(onChange).toHaveBeenCalledWith([{ stock: 'sunset', alt: STOCK_PHOTO_ALT.sunset }]);
    });

    it('drops a reworded description rather than keep it on a picture it does not describe', async () => {
      const user = userEvent.setup();
      const { onChange } = renderField([{ stock: 'sunset', alt: 'Our own wording for the sunset' }]);

      await user.click(
        screen.getByRole('button', { name: 'Use the palm-lined street photo instead' }),
      );
      expect(onChange).toHaveBeenCalledWith([{ stock: 'palms', alt: STOCK_PHOTO_ALT.palms }]);
    });

    it('is not offered when the other photo is already in the list', () => {
      renderField([SUNSET, PALMS]);
      expect(screen.queryByRole('button', { name: /instead$/ })).not.toBeInTheDocument();
    });

    it('is a touch target: 44px tall below 768px, 36px from there up', () => {
      // jsdom has no layout, so the rule (.claude/rules/design.md) is asserted on
      // the classes that carry it. The label wraps in the narrow column, so the
      // height is a floor (`min-h`), not a fixed height.
      renderField([SUNSET]);
      expect(
        screen.getByRole('button', { name: 'Use the palm-lined street photo instead' }),
      ).toHaveClass('min-h-11', 'md:min-h-9');
    });

    it('is not offered for an uploaded photo', () => {
      renderField([POOL]);
      expect(screen.queryByRole('button', { name: /instead$/ })).not.toBeInTheDocument();
    });

    it('leaves focus in the row after a swap, on the button that swaps back', async () => {
      // The swap changes the row's key, so the row remounts and the focused
      // button is gone: without the deferred focus, a keyboard user lands on <body>.
      const user = userEvent.setup();
      render(<Harness initial={[SUNSET, POOL]} />);

      await user.click(
        screen.getByRole('button', { name: 'Use the palm-lined street photo instead' }),
      );

      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByRole('button', { name: 'Use the sunset photo instead' }),
        ),
      );
    });

    it('announces the change once, in the field live region', async () => {
      const user = userEvent.setup();
      const { view } = renderField([SUNSET, POOL]);

      await user.click(
        screen.getByRole('button', { name: 'Use the palm-lined street photo instead' }),
      );
      await waitFor(() =>
        expect(view.container.querySelector('[aria-live]')).toHaveTextContent(
          'Photo 1 changed to the palm-lined street photo.',
        ),
      );
      expect(view.container.querySelectorAll('[aria-live]')).toHaveLength(1);
    });
  });

  describe('replacing with an upload', () => {
    const PICK = 'Replace the sunset photo with your own';

    /** Pick a file for the sunset row, describe it and press the button. */
    async function stageAndUpload(name = 'beach.jpg', alt = 'The beach') {
      await userEvent.upload(screen.getByLabelText(PICK), imageFile(name));
      await userEvent.type(await screen.findByLabelText(`Alt text for ${name}`), alt);
      await userEvent.click(screen.getByRole('button', { name: /add 1 photo to hero/i }));
    }
    const finish = (
      id = 'staged-1',
      name = 'beach.jpg',
      alt = 'The beach',
      storagePath = '7/hero/beach.jpg',
    ) =>
      act(() => {
        heroPhotosHook.onUploaded!(
          { storagePath, altText: 'SERVER ECHO' },
          { id, file: imageFile(name), alt, decorative: false },
        );
      });

    it('is offered on a stock photo and not on an upload', () => {
      renderField([SUNSET, POOL]);
      expect(screen.getAllByLabelText(/^Replace the .* photo with your own$/)).toHaveLength(1);
      expect(screen.getByLabelText(PICK)).toHaveAttribute('type', 'file');
    });

    it('names the photo it will replace while the file waits to be described', async () => {
      renderField([SUNSET, POOL]);
      await userEvent.upload(screen.getByLabelText(PICK), imageFile('beach.jpg'));

      expect(await screen.findByText('Replaces the sunset photo.')).toBeInTheDocument();
      expect(uploadMock).not.toHaveBeenCalled();
    });

    it('puts the upload in the stock photo\'s place once it lands', async () => {
      const { onChange } = renderField([SUNSET, POOL]);
      await stageAndUpload();
      expect(uploadMock).toHaveBeenCalledTimes(1);

      finish();

      expect(onChange).toHaveBeenCalledWith([{ path: '7/hero/beach.jpg', alt: 'The beach' }, POOL]);
    });

    it("gives the upload its own description, never the stock photo's or the server's", async () => {
      const { onChange } = renderField([SUNSET]);
      await stageAndUpload('beach.jpg', 'People on the beach');

      finish('staged-1', 'beach.jpg', 'People on the beach');

      const written = onChange.mock.calls.at(-1)![0] as HeroPhoto[];
      expect(written).toEqual([{ path: '7/hero/beach.jpg', alt: 'People on the beach' }]);
    });

    it('does not use up a place in the list while it waits', async () => {
      // It takes the stock photo's place, so the list ends the same length: one
      // place is still free to add to.
      const six = Array.from({ length: 6 }, (_, i) => ({ path: `7/hero/p${i}.jpg`, alt: `Photo ${i}` }));
      renderField([SUNSET, ...six]);
      expect(screen.getByText(/1 of 8 remaining/)).toBeInTheDocument();

      await userEvent.upload(screen.getByLabelText(PICK), imageFile('beach.jpg'));
      await screen.findByLabelText('Alt text for beach.jpg');

      expect(screen.getByText(/1 of 8 remaining/)).toBeInTheDocument();
      expect(screen.getByLabelText('Add photos')).toBeEnabled();
    });

    it('is still offered when the hero is full', async () => {
      const seven = Array.from({ length: 7 }, (_, i) => ({ path: `7/hero/p${i}.jpg`, alt: `Photo ${i}` }));
      renderField([SUNSET, ...seven]);

      // Nothing more can be added…
      expect(screen.getByLabelText('Add photos')).toBeDisabled();
      expect(screen.getByText(/Maximum of 8 photos reached/)).toBeInTheDocument();
      // …but the stock photo can still be replaced.
      expect(screen.getByLabelText(PICK)).toBeEnabled();
      await userEvent.upload(screen.getByLabelText(PICK), imageFile('beach.jpg'));
      expect(await screen.findByLabelText('Alt text for beach.jpg')).toBeInTheDocument();
    });

    it('keeps one waiting file per stock photo: choosing another replaces the first', async () => {
      const { view } = renderField([SUNSET, POOL]);
      await userEvent.upload(screen.getByLabelText(PICK), imageFile('first.jpg'));
      await screen.findByLabelText('Alt text for first.jpg');
      await userEvent.upload(screen.getByLabelText(PICK), imageFile('second.jpg'));

      expect(await screen.findByLabelText('Alt text for second.jpg')).toBeInTheDocument();
      expect(screen.queryByLabelText('Alt text for first.jpg')).not.toBeInTheDocument();
      expect(view.container.querySelectorAll('[data-staged-row]')).toHaveLength(1);
    });

    it('adds the photo at the end if the stock photo was removed while it uploaded', async () => {
      const lists: HeroPhoto[][] = [];
      render(<Harness initial={[SUNSET, POOL]} onList={(l) => lists.push(l)} />);
      await stageAndUpload();

      await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
      finish();

      expect(lists.at(-1)).toEqual([POOL, { path: '7/hero/beach.jpg', alt: 'The beach' }]);
    });

    it('a file released by a removal does not take that photo\'s place if it comes back', async () => {
      // The file was released when its photo went. A swap can put the same stock
      // photo back in the list, and the file must not latch onto it: the manager
      // chose to replace a photo that is no longer there.
      const FIVE = Array.from({ length: 5 }, (_, i) => ({ path: `7/hero/p${i}.jpg`, alt: `Photo ${i}` }));
      render(<Harness initial={[SUNSET, PALMS, ...FIVE]} />);
      await userEvent.upload(screen.getByLabelText(PICK), imageFile('beach.jpg'));
      await screen.findByLabelText('Alt text for beach.jpg');

      await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));
      await userEvent.click(screen.getByRole('button', { name: 'Use the sunset photo instead' }));

      expect(thumbSrcs(document.body)[0]).toBe('/site-looks/sunset.webp');
      expect(screen.queryByText(/^Replaces the/)).not.toBeInTheDocument();
    });

    describe('on a full hero (8 photos), where a ninth would be refused', () => {
      // heroBlockSchema holds at most 8 photos, and a hero that has 9 saves nothing.
      // A waiting replacement must therefore stay a replacement of the photo it was
      // chosen for, or become an ordinary add that the counter knows about: never a
      // surprise ninth photo.
      const SEVEN = Array.from({ length: 7 }, (_, i) => ({
        path: `7/hero/p${i}.jpg`,
        alt: `Photo ${i}`,
      }));

      /** The parent, plus a way for the list to change from outside the field (a refetch, another tab). */
      function ForeignHarness({
        initial,
        foreign,
        onList,
      }: {
        initial: HeroPhoto[];
        foreign: HeroPhoto[];
        onList: (list: HeroPhoto[]) => void;
      }) {
        const [photos, setPhotos] = useState(initial);
        return (
          <>
            <HeroPhotosField
              communityId={7}
              blockOrder={1}
              photos={photos}
              onChange={(next) => {
                setPhotos(next);
                onList(next);
              }}
              readDimensions={okDimensions}
            />
            <button
              type="button"
              onClick={() => {
                setPhotos(foreign);
                onList(foreign);
              }}
            >
              Another edit arrives
            </button>
          </>
        );
      }

      /** A full hero with beach.jpg chosen, and described, to replace its sunset photo. */
      async function fullHeroWithAWaitingFile(lists: HeroPhoto[][]) {
        render(<Harness initial={[SUNSET, ...SEVEN]} onList={(l) => lists.push(l)} />);
        await userEvent.upload(screen.getByLabelText(PICK), imageFile('beach.jpg'));
        await userEvent.type(await screen.findByLabelText('Alt text for beach.jpg'), 'The beach');
        expect(screen.getByText('Replaces the sunset photo.')).toBeInTheDocument();
      }

      describe('when its stock photo is swapped for the other one', () => {
        it('the waiting file follows it, and its note names the new photo', async () => {
          await fullHeroWithAWaitingFile([]);

          await userEvent.click(
            screen.getByRole('button', { name: 'Use the palm-lined street photo instead' }),
          );

          expect(screen.getByText('Replaces the palm-lined street photo.')).toBeInTheDocument();
          expect(screen.queryByText('Replaces the sunset photo.')).not.toBeInTheDocument();
        });

        it('the upload still lands in that slot, for 8 photos and not 9', async () => {
          const lists: HeroPhoto[][] = [];
          await fullHeroWithAWaitingFile(lists);
          await userEvent.click(
            screen.getByRole('button', { name: 'Use the palm-lined street photo instead' }),
          );

          await userEvent.click(screen.getByRole('button', { name: /add 1 photo to hero/i }));
          finish();

          const final = lists.at(-1)!;
          expect(final).toHaveLength(8);
          expect(final[0]).toEqual({ path: '7/hero/beach.jpg', alt: 'The beach' });
          expect(final.some((photo) => 'stock' in photo)).toBe(false);
        });
      });

      describe('when its stock photo is removed', () => {
        it('the waiting file stops claiming to replace anything', async () => {
          await fullHeroWithAWaitingFile([]);

          await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));

          expect(screen.queryByText(/^Replaces the/)).not.toBeInTheDocument();
        });

        it('the hero counts the file as an addition: no ninth photo can be staged', async () => {
          await fullHeroWithAWaitingFile([]);

          await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));

          // 7 photos and 1 waiting is 8.
          expect(screen.getByText(/Maximum of 8 photos reached/)).toBeInTheDocument();
          expect(screen.getByLabelText('Add photos')).toBeDisabled();
        });

        it('turns a further file away, and the upload lands at the end: 8 photos, not 9', async () => {
          const lists: HeroPhoto[][] = [];
          await fullHeroWithAWaitingFile(lists);
          await userEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }));

          // The place the removal freed belongs to the waiting file already.
          await userEvent.upload(screen.getByLabelText('Add photos'), imageFile('extra.jpg'));
          await act(async () => {}); // time to be staged, were it going to be
          expect(screen.queryByLabelText('Alt text for extra.jpg')).not.toBeInTheDocument();

          await userEvent.click(screen.getByRole('button', { name: /add 1 photo to hero/i }));
          finish();

          const final = lists.at(-1)!;
          expect(final).toHaveLength(8);
          expect(final.at(-1)).toEqual({ path: '7/hero/beach.jpg', alt: 'The beach' });
        });
      });

      describe('when its stock photo vanishes without a Remove or a Swap', () => {
        // A refetch, or another tab, can take the stock photo out of the list.
        function renderWithAnOutsideEdit(lists: HeroPhoto[][]) {
          render(
            <ForeignHarness
              initial={[SUNSET, ...SEVEN]}
              foreign={SEVEN}
              onList={(l) => lists.push(l)}
            />,
          );
        }

        it('the file stops claiming to replace anything', async () => {
          renderWithAnOutsideEdit([]);
          await userEvent.upload(screen.getByLabelText(PICK), imageFile('beach.jpg'));
          await screen.findByLabelText('Alt text for beach.jpg');
          expect(screen.getByText('Replaces the sunset photo.')).toBeInTheDocument();

          await userEvent.click(screen.getByRole('button', { name: 'Another edit arrives' }));

          expect(screen.queryByText(/^Replaces the/)).not.toBeInTheDocument();
        });

        it('the hero counts the file as an addition', async () => {
          renderWithAnOutsideEdit([]);
          await userEvent.upload(screen.getByLabelText(PICK), imageFile('beach.jpg'));
          await screen.findByLabelText('Alt text for beach.jpg');
          // While it replaces a photo it needs no place: 8 photos, none to add.
          expect(screen.getByText(/Maximum of 8 photos reached/)).toBeInTheDocument();

          await userEvent.click(screen.getByRole('button', { name: 'Another edit arrives' }));

          // Now 7 photos and 1 waiting is still 8, not "1 remaining".
          expect(screen.getByText(/Maximum of 8 photos reached/)).toBeInTheDocument();
          expect(screen.getByLabelText('Add photos')).toBeDisabled();
        });
      });

      it('lets only one waiting file take a stock photo\'s place', async () => {
        // Two waiting files can end up aimed at the same stock photo: one was chosen
        // for it, the other was retargeted onto it by a swap after an outside edit
        // had orphaned the first. Only one can take the place; the other lands at
        // the end, so the hero has to count it.
        const SIX = SEVEN.slice(0, 6);
        const lists: HeroPhoto[][] = [];
        render(
          <ForeignHarness
            initial={[SUNSET, ...SIX]}
            foreign={[PALMS, ...SIX]}
            onList={(l) => lists.push(l)}
          />,
        );

        await userEvent.upload(screen.getByLabelText(PICK), imageFile('a.jpg'));
        await userEvent.type(await screen.findByLabelText('Alt text for a.jpg'), 'A photo');
        await userEvent.click(screen.getByRole('button', { name: 'Another edit arrives' }));
        // The first file is aimed at a photo that is gone: it needs a place (7 + 1 = 8).
        expect(screen.getByText(/Maximum of 8 photos reached/)).toBeInTheDocument();

        await userEvent.upload(
          screen.getByLabelText('Replace the palm-lined street photo with your own'),
          imageFile('b.jpg'),
        );
        await userEvent.type(await screen.findByLabelText('Alt text for b.jpg'), 'B photo');
        // The second takes the palm street photo's place and needs none.
        expect(screen.getByText(/Maximum of 8 photos reached/)).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Use the sunset photo instead' }));

        // Both are now aimed at the sunset photo. One takes its place; the other
        // needs a place of its own, and the hero must not offer a ninth.
        expect(screen.getAllByText('Replaces the sunset photo.')).toHaveLength(1);
        expect(screen.getByText(/Maximum of 8 photos reached/)).toBeInTheDocument();
        expect(screen.getByLabelText('Add photos')).toBeDisabled();

        await userEvent.click(screen.getByRole('button', { name: /add 2 photos to hero/i }));
        finish('staged-1', 'a.jpg', 'A photo', '7/hero/a.jpg');
        finish('staged-2', 'b.jpg', 'B photo', '7/hero/b.jpg');

        const final = lists.at(-1)!;
        expect(final).toHaveLength(8);
        expect(final[0]).toEqual({ path: '7/hero/a.jpg', alt: 'A photo' });
        expect(final.at(-1)).toEqual({ path: '7/hero/b.jpg', alt: 'B photo' });
        expect(final.some((photo) => 'stock' in photo)).toBe(false);
      });
    });

    it('turns down a file the way "Add photos" does, and keeps the stock photo', async () => {
      const { onChange } = renderField([SUNSET]);
      await userEvent.upload(screen.getByLabelText(PICK), imageFile('huge.jpg', 12 * 1024 * 1024));

      expect(await screen.findByText(/huge\.jpg:/)).toBeInTheDocument();
      expect(screen.queryByLabelText('Alt text for huge.jpg')).not.toBeInTheDocument();
      expect(uploadMock).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
    });
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

describe('HeroPhotosField — alt text is collected before the upload', () => {
  it('stages a picked file for description instead of uploading it', async () => {
    // The bug this replaces: the file went straight to the queue with an empty
    // altText, which finalize rejects with a 400 *after* the bytes are stored.
    const { view } = renderField([]);
    await userEvent.upload(screen.getByLabelText('Add photos'), imageFile('pool.jpg'));

    expect(await screen.findByLabelText('Alt text for pool.jpg')).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(view.container.querySelectorAll('[data-staged-row]')).toHaveLength(1);
  });

  it('will not upload until every staged file is described or decorative', async () => {
    renderField([]);
    await userEvent.upload(screen.getByLabelText('Add photos'), imageFile('pool.jpg'));

    const button = await screen.findByRole('button', { name: /add 1 photo to hero/i });
    expect(button).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Alt text for pool.jpg'), 'The pool');
    expect(button).toBeEnabled();

    await userEvent.click(button);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0]![0]).toEqual([
      expect.objectContaining({ alt: 'The pool', decorative: false }),
    ]);
  });

  it('lets a decorative file upload without alt text', async () => {
    renderField([]);
    await userEvent.upload(screen.getByLabelText('Add photos'), imageFile('texture.jpg'));
    await userEvent.click(await screen.findByLabelText('Decorative — texture.jpg'));

    const button = screen.getByRole('button', { name: /add 1 photo to hero/i });
    expect(button).toBeEnabled();
    await userEvent.click(button);

    expect(uploadMock.mock.calls[0]![0]).toEqual([
      expect.objectContaining({ decorative: true, alt: '' }),
    ]);
  });

  it('commits the STAGED alt, never the value finalize echoes back', async () => {
    // The regression for the placeholder bug: an auto-filled description is a
    // valid-looking alt, so it sails through both `toCanonical` and the
    // publish gate that exists to catch a missing one.
    const { onChange } = renderField([]);
    await userEvent.upload(screen.getByLabelText('Add photos'), imageFile('pool.jpg'));
    await userEvent.type(
      await screen.findByLabelText('Alt text for pool.jpg'),
      'Sun deck by the pool',
    );
    await userEvent.click(screen.getByRole('button', { name: /add 1 photo to hero/i }));

    // Drive the completion the way the real queue does.
    heroPhotosHook.onUploaded!(
      { storagePath: '7/hero/abc.jpg', altText: 'SERVER ECHO' },
      { id: 'staged-1', file: imageFile('pool.jpg'), alt: 'Sun deck by the pool', decorative: false },
    );

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        { path: '7/hero/abc.jpg', alt: 'Sun deck by the pool' },
      ]),
    );
  });

  it('commits a decorative photo with no alt key at all', async () => {
    // heroPhotoSchema is .strict() with an alt-XOR-decorative refine, so an
    // empty `alt` alongside `decorative` would fail validation.
    const { onChange } = renderField([]);
    heroPhotosHook.onUploaded = null;
    await userEvent.upload(screen.getByLabelText('Add photos'), imageFile('texture.jpg'));
    await screen.findByLabelText('Decorative — texture.jpg');

    heroPhotosHook.onUploaded!(
      { storagePath: '7/hero/tex.jpg', altText: 'Decorative image' },
      { id: 'staged-1', file: imageFile('texture.jpg'), alt: '', decorative: true },
    );

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([{ path: '7/hero/tex.jpg', decorative: true }]),
    );
  });

  it('rejects an oversized file at pick time, before any network call', async () => {
    renderField([]);
    await userEvent.upload(
      screen.getByLabelText('Add photos'),
      imageFile('huge.jpg', 12 * 1024 * 1024),
    );

    expect(await screen.findByText(/huge\.jpg:/)).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Alt text for huge.jpg')).not.toBeInTheDocument();
  });

  it('rejects an undersized image at pick time', async () => {
    const onChange = vi.fn();
    render(
      <HeroPhotosField
        communityId={7}
        blockOrder={1}
        photos={[]}
        onChange={onChange}
        readDimensions={() => Promise.resolve({ width: 800, height: 450 })}
      />,
    );
    await userEvent.upload(screen.getByLabelText('Add photos'), imageFile('small.jpg'));

    expect(await screen.findByText(/1600×900/)).toBeInTheDocument();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('counts staged files against the cap', async () => {
    // Six committed + two staged is the maximum; the picker must close.
    const six = Array.from({ length: 6 }, (_, i) => ({
      path: `7/hero/p${i}.jpg`,
      alt: `Photo ${i}`,
    }));
    renderField(six);
    await userEvent.upload(screen.getByLabelText('Add photos'), [
      imageFile('a.jpg'),
      imageFile('b.jpg'),
    ]);

    await waitFor(() =>
      expect(screen.getByText(/Maximum of 8 photos reached/)).toBeInTheDocument(),
    );
    expect(screen.getByLabelText('Add photos')).toBeDisabled();
  });

  it('still has exactly one live region with staged rows present', async () => {
    const { view } = renderField([]);
    await userEvent.upload(screen.getByLabelText('Add photos'), imageFile('pool.jpg'));
    await screen.findByLabelText('Alt text for pool.jpg');

    expect(view.container.querySelectorAll('[aria-live]')).toHaveLength(1);
  });
});
