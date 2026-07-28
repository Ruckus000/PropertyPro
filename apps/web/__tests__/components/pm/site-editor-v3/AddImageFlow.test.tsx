/**
 * The upload-first add path for Image and Gallery sections.
 *
 * Both schemas require a real uploaded storage path, so unlike every other
 * type these cannot be seeded and created empty. That ordering — upload, then
 * write — is what the assertions here pin down, along with the two ways it
 * goes wrong: describing after the upload (finalize 400s and strands bytes),
 * and retrying a failed write by re-uploading (double-charges the quota).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddImageFlow } from '@/components/pm/site-editor-v3/panels/AddImageFlow';
import { ADD_CATALOG } from '@/components/pm/site-editor-v3/panels/add-catalog';
import { DECORATIVE_PLACEHOLDER_ALT } from '@/lib/site-assets/client-image';

const uploadMutateAsync = vi.hoisted(() => vi.fn());
const upsertMutateAsync = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-image-upload', () => ({
  useImageUpload: () => ({ mutateAsync: uploadMutateAsync, isPending: false }),
}));

// Complete factory, per this directory's convention.
vi.mock('@/hooks/use-content-blocks', () => ({
  useContentBlocks: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
  usePublishedBlocks: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
  useSitePublishToken: () => ({ data: null, isPending: false, isError: false, refetch: vi.fn() }),
  useUpsertContentBlock: () => ({
    mutate: vi.fn(),
    mutateAsync: upsertMutateAsync,
    isPending: false,
  }),
  useDeleteContentBlock: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDiscardDrafts: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useReorderBlocks: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

const IMAGE_ENTRY = ADD_CATALOG.find((e) => e.blockType === 'image')!;
const GALLERY_ENTRY = ADD_CATALOG.find((e) => e.blockType === 'gallery')!;

function file(name = 'pool.jpg', type = 'image/jpeg', size = 1024) {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

const onAdded = vi.fn();
const onCancel = vi.fn();

function renderFlow(entry = IMAGE_ENTRY, blockOrder: number | null = 4) {
  return render(
    <AddImageFlow
      communityId={7}
      entry={entry}
      blockOrder={blockOrder}
      onCancel={onCancel}
      onAdded={onAdded}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadMutateAsync.mockResolvedValue({
    storagePath: '7/content/pool.jpg',
    variant1600Path: '7/content/pool.jpg.1600w.webp',
    variant800Path: '7/content/pool.jpg.800w.webp',
    altText: 'The pool',
  });
  upsertMutateAsync.mockResolvedValue(undefined);
});

describe('AddImageFlow', () => {
  it('will not submit until a file is chosen AND described', async () => {
    // Alt text is collected BEFORE the upload because finalize requires a
    // non-empty altText — describing afterwards presigns, PUTs the bytes, and
    // only then 400s, leaving an orphaned object behind every attempt.
    renderFlow();
    const submit = screen.getByRole('button', { name: /Add Image section/i });
    expect(submit).toBeDisabled();

    await userEvent.upload(screen.getByLabelText(/Photo/i), file());
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Alt text/i), 'The pool');
    expect(submit).toBeEnabled();
  });

  it('accepts a decorative image with no alt text', async () => {
    renderFlow();
    await userEvent.upload(screen.getByLabelText(/Photo/i), file());
    await userEvent.click(screen.getByLabelText(/Decorative/i));

    expect(screen.getByRole('button', { name: /Add Image section/i })).toBeEnabled();
  });

  it('uploads as a content image, then writes the block with the base path', async () => {
    renderFlow();
    await userEvent.upload(screen.getByLabelText(/Photo/i), file());
    await userEvent.type(screen.getByLabelText(/Alt text/i), 'The pool');
    await userEvent.click(screen.getByRole('button', { name: /Add Image section/i }));

    await waitFor(() =>
      expect(uploadMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'content', altText: 'The pool' }),
      ),
    );
    // The BASE path, never `variant1600Path` — the renderer appends the
    // variant suffixes itself.
    expect(upsertMutateAsync).toHaveBeenCalledWith({
      blockType: 'image',
      blockOrder: 4,
      content: { imagePath: '7/content/pool.jpg', altText: 'The pool' },
    });
    expect(onAdded).toHaveBeenCalledWith(4, IMAGE_ENTRY);
  });

  it('sends the placeholder alt to the pipeline but writes decorative into content', async () => {
    // `result.altText` for a decorative image is the pipeline's placeholder.
    // Writing it into block content would hand the image a plausible
    // description nobody wrote, passing the very gate that exists to catch a
    // missing one.
    renderFlow();
    await userEvent.upload(screen.getByLabelText(/Photo/i), file());
    await userEvent.click(screen.getByLabelText(/Decorative/i));
    await userEvent.click(screen.getByRole('button', { name: /Add Image section/i }));

    await waitFor(() =>
      expect(uploadMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ altText: DECORATIVE_PLACEHOLDER_ALT }),
      ),
    );
    expect(upsertMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        content: { imagePath: '7/content/pool.jpg', decorative: true },
      }),
    );
  });

  it('wraps the image in an images array for a gallery', async () => {
    renderFlow(GALLERY_ENTRY);
    await userEvent.upload(screen.getByLabelText(/Photo/i), file());
    await userEvent.type(screen.getByLabelText(/Alt text/i), 'The pool');
    await userEvent.click(screen.getByRole('button', { name: /Add Gallery section/i }));

    await waitFor(() =>
      expect(upsertMutateAsync).toHaveBeenCalledWith({
        blockType: 'gallery',
        blockOrder: 4,
        content: { images: [{ imagePath: '7/content/pool.jpg', altText: 'The pool' }] },
      }),
    );
  });

  it('rejects an oversized file before spending a round trip on it', async () => {
    renderFlow();
    await userEvent.upload(
      screen.getByLabelText(/Photo/i),
      file('huge.jpg', 'image/jpeg', 20 * 1024 * 1024),
    );

    expect(screen.getByText(/too large/i)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Alt text/i), 'Huge');
    expect(screen.getByRole('button', { name: /Add Image section/i })).toBeDisabled();
    expect(uploadMutateAsync).not.toHaveBeenCalled();
  });

  it('constrains the picker to the types the pipeline accepts', async () => {
    // The MIME branch of `validateImageFile` is a backstop, not the primary
    // guard, and it is unreachable through the picker: the browser (and
    // testing-library) honour `accept` and never fire a change event for a
    // file outside it. Asserting on the attribute is asserting on what
    // actually stops the PM; asserting on the error message would be
    // asserting on a state the UI cannot reach.
    renderFlow();
    expect(screen.getByLabelText(/Photo/i)).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp',
    );

    await userEvent.upload(screen.getByLabelText(/Photo/i), file('doc.pdf', 'application/pdf'));
    expect(uploadMutateAsync).not.toHaveBeenCalled();
  });

  it('retries only the write after the upload succeeded and the write failed', async () => {
    // Re-uploading would charge the community's storage quota a second time
    // and orphan the first set of bytes.
    upsertMutateAsync.mockRejectedValueOnce(new Error('Something went wrong.'));
    renderFlow();

    await userEvent.upload(screen.getByLabelText(/Photo/i), file());
    await userEvent.type(screen.getByLabelText(/Alt text/i), 'The pool');
    await userEvent.click(screen.getByRole('button', { name: /Add Image section/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/went wrong/i));
    expect(uploadMutateAsync).toHaveBeenCalledTimes(1);

    upsertMutateAsync.mockResolvedValueOnce(undefined);
    await userEvent.click(screen.getByRole('button', { name: /Try again/i }));

    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(uploadMutateAsync).toHaveBeenCalledTimes(1);
    expect(upsertMutateAsync).toHaveBeenCalledTimes(2);
  });

  it('re-uploads when the PM picks a different file after a failure', async () => {
    upsertMutateAsync.mockRejectedValueOnce(new Error('Something went wrong.'));
    renderFlow();

    await userEvent.upload(screen.getByLabelText(/Photo/i), file());
    await userEvent.type(screen.getByLabelText(/Alt text/i), 'The pool');
    await userEvent.click(screen.getByRole('button', { name: /Add Image section/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    await userEvent.upload(screen.getByLabelText(/Photo/i), file('deck.jpg'));
    await userEvent.click(screen.getByRole('button', { name: /Add Image section/i }));

    await waitFor(() => expect(uploadMutateAsync).toHaveBeenCalledTimes(2));
  });

  it('cannot submit before the slot is known', async () => {
    renderFlow(IMAGE_ENTRY, null);
    await userEvent.upload(screen.getByLabelText(/Photo/i), file());
    await userEvent.type(screen.getByLabelText(/Alt text/i), 'The pool');

    expect(screen.getByRole('button', { name: /Add Image section/i })).toBeDisabled();
  });

  it('goes back to the type list', async () => {
    renderFlow();
    await userEvent.click(screen.getByRole('button', { name: /All sections/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
