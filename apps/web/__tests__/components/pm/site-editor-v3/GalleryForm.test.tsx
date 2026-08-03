/**
 * Gallery inspector form and its image list.
 *
 * The schema's alt/decorative refine is the thing most worth pinning: an image
 * that is neither described nor marked decorative must stop the write, because
 * the route rejects it and — more importantly — the alt rule is the reason the
 * gate exists at all.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { galleryBlockSchema } from '@propertypro/shared';
import { GalleryForm } from '@/components/pm/site-editor-v3/inspector/forms/GalleryForm';

const upsertMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-content-blocks', () => ({
  // FloatControls reads the published side to decide whether a removal is
  // staged or immediate; a factory missing it yields `undefined` at call time.
  usePublishedBlocks: () => ({ data: [] }),
  useUpsertContentBlock: () => ({ mutateAsync: upsertMock, isPending: false }),
}));

const uploadMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-image-upload', () => ({
  useImageUpload: () => ({ mutateAsync: uploadMock, isPending: false }),
}));

const DEBOUNCE_MS = 800;

async function settleAutosave() {
  await act(async () => {
    vi.advanceTimersByTime(DEBOUNCE_MS + 50);
    await Promise.resolve();
  });
}

function setupTimers() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

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
});
