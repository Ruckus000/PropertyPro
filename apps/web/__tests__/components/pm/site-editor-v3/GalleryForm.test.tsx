/**
 * Gallery inspector form and its image list.
 *
 * The schema's alt/decorative refine is the thing most worth pinning: an image
 * that is neither described nor marked decorative must stop the write, because
 * the route rejects it and — more importantly — the alt rule is the reason the
 * gate exists at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { galleryBlockSchema } from '@propertypro/shared';
import { GalleryForm } from '@/components/pm/site-editor-v3/inspector/forms/GalleryForm';

const upsertMock = vi.hoisted(() => vi.fn());
// What `useContentBlocks` returns — the WHOLE-SITE block list the image field's
// "Choose from your photos" derives its candidates from. Reset per test.
const siteBlocks = vi.hoisted(() => ({ current: [] as unknown[] }));
vi.mock('@/hooks/use-content-blocks', () => ({
  // FloatControls reads the published side to decide whether a removal is
  // staged or immediate; a factory missing it yields `undefined` at call time.
  usePublishedBlocks: () => ({ data: [] }),
  useContentBlocks: () => ({ data: siteBlocks.current }),
  useUpsertContentBlock: () => ({ mutateAsync: upsertMock, isPending: false }),
}));

const uploadMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-image-upload', () => ({
  useImageUpload: () => ({ mutateAsync: uploadMock, isPending: false }),
}));

import { setupTimers, settleAutosave } from './autosave-harness';

function renderForm(content: unknown) {
  return render(
    <GalleryForm communityId={7} blockType="gallery" blockOrder={5} content={content} />,
  );
}

function file(name = 'deck.jpg', type = 'image/jpeg', size = 1024) {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

const ONE_IMAGE = {
  images: [{ imagePath: '7/content/pool.jpg', altText: 'The pool' }],
};

beforeEach(() => {
  siteBlocks.current = [];
  upsertMock.mockReset();
  upsertMock.mockResolvedValue(undefined);
  uploadMock.mockReset();
  uploadMock.mockResolvedValue({
    storagePath: '7/content/deck.jpg',
    variant1600Path: '7/content/deck.jpg.1600w.webp',
    variant800Path: '7/content/deck.jpg.800w.webp',
    altText: 'The deck',
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GalleryForm', () => {
  it('opens a block whose stored content fails its schema, so it can be repaired', () => {
    renderForm({ images: [{ imagePath: '7/content/pool.jpg' }], heading: 99 });
    expect(screen.getByLabelText('Alt text')).toBeInTheDocument();
  });

  it('drops rows with no image path, which this form cannot repair', () => {
    // There is no "replace this image" affordance, only add and remove, so a
    // pathless row would show an empty frame and block the save forever.
    renderForm({ images: [{ altText: 'orphan' }, { imagePath: '7/content/pool.jpg', altText: 'The pool' }] });
    expect(screen.getAllByLabelText('Alt text')).toHaveLength(1);
  });

  it('writes a schema-valid payload', async () => {
    const user = setupTimers();
    renderForm(ONE_IMAGE);

    await user.type(screen.getByLabelText('Heading'), 'Around the property');
    await settleAutosave();

    const written = upsertMock.mock.calls.at(-1)![0];
    expect(written).toEqual({
      blockType: 'gallery',
      blockOrder: 5,
      content: {
        heading: 'Around the property',
        images: [{ imagePath: '7/content/pool.jpg', altText: 'The pool' }],
      },
    });
    expect(galleryBlockSchema.safeParse(written.content).success).toBe(true);
  });

  it('omits an empty caption rather than sending an empty string', async () => {
    // `caption` is `min(1)`, so `''` would fail the schema at the route.
    const user = setupTimers();
    renderForm(ONE_IMAGE);

    await user.type(screen.getByLabelText('Alt text'), '!');
    await settleAutosave();

    expect(upsertMock.mock.calls.at(-1)![0].content.images[0]).not.toHaveProperty('caption');
  });

  it('sends a caption once it has content', async () => {
    const user = setupTimers();
    renderForm(ONE_IMAGE);

    await user.type(screen.getByLabelText('Caption'), 'Heated year round');
    await settleAutosave();

    expect(upsertMock.mock.calls.at(-1)![0].content.images[0].caption).toBe(
      'Heated year round',
    );
  });

  it('never lets decorative and altText coexist', async () => {
    // The schema refuses that combination outright; the form must mirror the
    // rule rather than approximate it.
    const user = setupTimers();
    renderForm(ONE_IMAGE);

    await user.click(screen.getByLabelText('Decorative'));
    await settleAutosave();

    const image = upsertMock.mock.calls.at(-1)![0].content.images[0];
    expect(image).toEqual({ imagePath: '7/content/pool.jpg', decorative: true });
    expect(galleryBlockSchema.safeParse({ images: [image] }).success).toBe(true);
  });

  it('refuses to write an image that is neither described nor decorative', async () => {
    const user = setupTimers();
    renderForm(ONE_IMAGE);

    await user.clear(screen.getByLabelText('Alt text'));
    await settleAutosave();

    expect(upsertMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Image 1 needs alt text/i)).toBeInTheDocument();
  });

  it('refuses to write an empty gallery and says so', async () => {
    // Reachable: the PM can remove their way down to nothing. `images` is
    // `min(1)`, so sending `images: []` would just earn a 400.
    const user = setupTimers();
    renderForm(ONE_IMAGE);

    await user.click(screen.getByRole('button', { name: 'Remove image 1' }));
    await settleAutosave();

    expect(upsertMock).not.toHaveBeenCalled();
    expect(screen.getByText(/at least one image/i)).toBeInTheDocument();
  });

  describe('image list', () => {
    const TWO_IMAGES = {
      images: [
        { imagePath: '7/content/pool.jpg', altText: 'The pool' },
        { imagePath: '7/content/gym.jpg', altText: 'The gym' },
      ],
    };

    it('reorders and reports the new position', async () => {
      const user = setupTimers();
      renderForm(TWO_IMAGES);

      await user.click(screen.getByRole('button', { name: 'Move image 1 down' }));
      await settleAutosave();

      expect(upsertMock.mock.calls.at(-1)![0].content.images.map((i: { imagePath: string }) => i.imagePath)).toEqual([
        '7/content/gym.jpg',
        '7/content/pool.jpg',
      ]);
    });

    it('disables the move controls at the ends rather than hiding them', () => {
      renderForm(TWO_IMAGES);
      expect(screen.getByRole('button', { name: 'Move image 1 up' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Move image 2 down' })).toBeDisabled();
    });

    it('uploads staged images as content, not hero', async () => {
      const user = setupTimers();
      renderForm(ONE_IMAGE);

      await user.upload(screen.getByLabelText('Add images'), file());
      await user.type(screen.getByLabelText(/Alt text for deck.jpg/), 'The deck');
      await user.click(screen.getByRole('button', { name: /Add 1 image to gallery/ }));

      await waitFor(() =>
        expect(uploadMock).toHaveBeenCalledWith(
          expect.objectContaining({ kind: 'content', altText: 'The deck' }),
        ),
      );
    });

    it('will not upload a staged image until it is described', async () => {
      // finalize requires a non-empty altText, so uploading first would
      // strand the bytes and then 400.
      const user = setupTimers();
      renderForm(ONE_IMAGE);

      await user.upload(screen.getByLabelText('Add images'), file());
      expect(screen.getByRole('button', { name: /Add 1 image to gallery/ })).toBeDisabled();

      await user.click(screen.getByLabelText(/Decorative — deck.jpg/));
      expect(screen.getByRole('button', { name: /Add 1 image to gallery/ })).toBeEnabled();
    });

    it('stores the base path from the upload, not a variant', async () => {
      const user = setupTimers();
      renderForm(ONE_IMAGE);

      await user.upload(screen.getByLabelText('Add images'), file());
      await user.type(screen.getByLabelText(/Alt text for deck.jpg/), 'The deck');
      await user.click(screen.getByRole('button', { name: /Add 1 image to gallery/ }));
      // The queue is async: wait for the committed row to appear before
      // settling the debounce, or the write under test has not been armed yet.
      await waitFor(() => expect(screen.getAllByLabelText('Alt text')).toHaveLength(2));
      await settleAutosave();

      const images = upsertMock.mock.calls.at(-1)![0].content.images;
      expect(images).toHaveLength(2);
      expect(images[1]).toEqual({ imagePath: '7/content/deck.jpg', altText: 'The deck' });
    });

    it('rejects an oversized file before spending a round trip on it', async () => {
      const user = setupTimers();
      renderForm(ONE_IMAGE);

      await user.upload(
        screen.getByLabelText('Add images'),
        file('huge.jpg', 'image/jpeg', 20 * 1024 * 1024),
      );

      expect(screen.getByText(/too large/i)).toBeInTheDocument();
      expect(uploadMock).not.toHaveBeenCalled();
    });

    it('shows each committed image by its 800w variant, never the base path', () => {
      // finalize deletes the raw upload once the variants exist, so the base
      // path is a 404; a thumbnail that drops the suffix renders as nothing.
      renderForm(ONE_IMAGE);

      const thumb = screen
        .getByLabelText('Alt text')
        .closest('[data-image-row]')!
        .querySelector('img');
      expect(thumb).toHaveAttribute(
        'src',
        expect.stringContaining('7/content/pool.jpg.800w.webp'),
      );
    });

    it('stops accepting files at the schema maximum', () => {
      const images = Array.from({ length: 24 }, (_, i) => ({
        imagePath: `7/content/p${i}.jpg`,
        altText: `Photo ${i}`,
      }));
      renderForm({ images });

      expect(screen.getByLabelText('Add images')).toBeDisabled();
      expect(screen.getByText(/Maximum of 24 images reached/)).toBeInTheDocument();
    });
  });

  describe('choose from your photos', () => {
    // uuid-prefixed as `buildSiteAssetPath` writes them; the picker strips the
    // prefix for its accessible names ("Use deck.jpg, …").
    const DECK = '7/content/3f2a9c1e-7b4d-4e8a-9f0c-1d2e3f4a5b6c-deck.jpg';
    const STRIP = '7/hero/9b1c2d3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e-strip.jpg';

    /** THIS gallery (order 5) as the server last saved it. */
    const THIS_GALLERY = {
      id: 3,
      pageId: 1,
      blockType: 'gallery',
      blockOrder: 5,
      content: ONE_IMAGE,
      isDraft: false,
      publishedAt: null,
    };

    /**
     * The whole-site list: the hero, an image section on ANOTHER page, and
     * this gallery with its saved pool photo. Two candidates, one photo that
     * is already here.
     */
    function placeSitePhotos() {
      siteBlocks.current = [
        {
          id: 1,
          pageId: 1,
          blockType: 'hero',
          blockOrder: 1,
          content: { headline: 'Welcome', photos: [{ path: STRIP, alt: 'The strip' }] },
          isDraft: false,
          publishedAt: null,
        },
        {
          id: 2,
          pageId: 2,
          blockType: 'image',
          blockOrder: 2,
          content: { imagePath: DECK, altText: 'The deck' },
          isDraft: false,
          publishedAt: null,
        },
        THIS_GALLERY,
      ];
    }

    async function chooseFromYourPhotos(user: ReturnType<typeof setupTimers>) {
      await user.click(screen.getByRole('button', { name: /Choose from your photos/i }));
    }

    it('appends a chosen photo by path, with NO upload', async () => {
      placeSitePhotos();
      const user = setupTimers();
      renderForm(ONE_IMAGE);
      await chooseFromYourPhotos(user);

      // The hero's photo is offered alongside the image section's.
      expect(screen.getByRole('button', { name: /Use strip\.jpg/i })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Use deck\.jpg/i }));
      // A chosen photo already has its variants, so its staging row shows it —
      // the `.800w.webp` variant, never the base path, which finalize deleted.
      // `alt=""` makes the image presentational, so scope by row rather than
      // by role.
      const stagedThumb = screen
        .getByLabelText(/Alt text for deck.jpg/)
        .closest('[data-staged-row]')!
        .querySelector('img');
      expect(stagedThumb).toHaveAttribute('src', expect.stringContaining(`${DECK}.800w.webp`));
      // Described in the SAME staging row a picked file gets.
      await user.type(screen.getByLabelText(/Alt text for deck.jpg/), 'The deck, from the pool');
      await user.click(screen.getByRole('button', { name: /Add 1 image to gallery/ }));
      // The assertion that makes "no quota change" true: nothing new is
      // stored, so presign, PUT and finalize never run. Checked straight
      // after the click, where the queue would have called it synchronously.
      expect(uploadMock).not.toHaveBeenCalled();

      await waitFor(() => expect(screen.getAllByLabelText('Alt text')).toHaveLength(2));
      await settleAutosave();

      const written = upsertMock.mock.calls.at(-1)![0];
      expect(written.content.images).toEqual([
        { imagePath: '7/content/pool.jpg', altText: 'The pool' },
        { imagePath: DECK, altText: 'The deck, from the pool' },
      ]);
      expect(galleryBlockSchema.safeParse(written.content).success).toBe(true);
    });

    it('asks for alt text for THIS placement — not carried over — and gates the add on it', async () => {
      placeSitePhotos();
      const user = setupTimers();
      renderForm(ONE_IMAGE);
      await chooseFromYourPhotos(user);
      await user.click(screen.getByRole('button', { name: /Use deck\.jpg/i }));

      // The image section's "The deck" is not prefilled: alt is contextual to
      // where the photo is used.
      expect(screen.getByLabelText(/Alt text for deck.jpg/)).toHaveValue('');
      expect(screen.getByRole('button', { name: /Add 1 image to gallery/ })).toBeDisabled();

      await user.click(screen.getByLabelText(/Decorative — deck.jpg/));
      expect(screen.getByRole('button', { name: /Add 1 image to gallery/ })).toBeEnabled();
      await user.click(screen.getByRole('button', { name: /Add 1 image to gallery/ }));
      expect(uploadMock).not.toHaveBeenCalled();

      await waitFor(() => expect(screen.getAllByLabelText('Alt text')).toHaveLength(2));
      await settleAutosave();

      expect(upsertMock.mock.calls.at(-1)![0].content.images[1]).toEqual({
        imagePath: DECK,
        decorative: true,
      });
    });

    it('does not offer a photo already in this gallery, committed or staged', async () => {
      // The committed list is keyed by PATH so focus follows the image rather
      // than the position (GalleryImagesField); a second row with the same
      // path would collide with the first. Refusing at the picker, rather
      // than on click, means no button that looks live and does nothing.
      placeSitePhotos();
      const user = setupTimers();
      renderForm(ONE_IMAGE);
      await chooseFromYourPhotos(user);

      expect(screen.queryByRole('button', { name: /Use pool\.jpg/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Use strip\.jpg/i })).toBeInTheDocument();

      // Staged holds a slot too: picked, it leaves the list…
      await user.click(screen.getByRole('button', { name: /Use deck\.jpg/i }));
      expect(screen.queryByRole('button', { name: /Use deck\.jpg/i })).not.toBeInTheDocument();

      // …and discarded, it comes back.
      await user.click(screen.getByRole('button', { name: 'Discard deck.jpg' }));
      expect(screen.getByRole('button', { name: /Use deck\.jpg/i })).toBeInTheDocument();
    });

    it('says so when every photo on the site is already in this gallery', async () => {
      siteBlocks.current = [THIS_GALLERY];
      const user = setupTimers();
      renderForm(ONE_IMAGE);
      await chooseFromYourPhotos(user);

      expect(screen.getByText(/already in this gallery/i)).toBeInTheDocument();
      // NOT the picker's own empty copy — there ARE photos on the site, and
      // "upload one and it will be available here" would be untrue.
      expect(screen.queryByText(/No photos on your site yet/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Use /i })).not.toBeInTheDocument();
    });

    it('disables the picker at the schema maximum and says so', async () => {
      // Same handling as the file input: a disabled control with the cap
      // message under it, not a live-looking button that silently drops the
      // pick.
      placeSitePhotos();
      const images = Array.from({ length: 24 }, (_, i) => ({
        imagePath: `7/content/p${i}.jpg`,
        altText: `Photo ${i}`,
      }));
      const user = setupTimers();
      renderForm({ images });
      await chooseFromYourPhotos(user);

      expect(screen.getByRole('button', { name: /Use deck\.jpg/i })).toBeDisabled();
      expect(screen.getByText(/Maximum of 24 images reached/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Add \d+ image/ })).not.toBeInTheDocument();
      expect(uploadMock).not.toHaveBeenCalled();
    });

    it('commits chosen photos without a round trip and still uploads staged files', async () => {
      // A mixed batch is the case that exercises the `imagesRef` discipline:
      // the chosen photo is appended synchronously, and the upload that
      // completes afterwards must append BEHIND it rather than to the list
      // this callback last closed over.
      uploadMock.mockResolvedValue({
        storagePath: '7/content/new.jpg',
        variant1600Path: '7/content/new.jpg.1600w.webp',
        variant800Path: '7/content/new.jpg.800w.webp',
        altText: 'New',
      });
      placeSitePhotos();
      const user = setupTimers();
      renderForm(ONE_IMAGE);

      await user.upload(screen.getByLabelText('Add images'), file('new.jpg'));
      await chooseFromYourPhotos(user);
      // Switching source keeps the staged file.
      expect(screen.getByLabelText(/Alt text for new.jpg/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Use deck\.jpg/i }));

      await user.type(screen.getByLabelText(/Alt text for new.jpg/), 'New');
      await user.type(screen.getByLabelText(/Alt text for deck.jpg/), 'Deck');
      await user.click(screen.getByRole('button', { name: /Add 2 images to gallery/ }));

      await waitFor(() => expect(screen.getAllByLabelText('Alt text')).toHaveLength(3));
      await settleAutosave();

      // One upload — the file's. The chosen photo never reached the pipeline.
      expect(uploadMock).toHaveBeenCalledTimes(1);
      expect(uploadMock).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'content', altText: 'New' }),
      );
      const paths = upsertMock.mock.calls
        .at(-1)![0]
        .content.images.map((i: { imagePath: string }) => i.imagePath);
      // Chosen photos land first: they need no round trip, so they are
      // committed before the queue starts and the queue appends behind them.
      expect(paths).toEqual(['7/content/pool.jpg', DECK, '7/content/new.jpg']);
    });
  });
});
