import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { GalleryBlockForm } from '@/components/pm/site-editor/GalleryBlockForm';

const uploadMutateAsync = vi.fn();
vi.mock('@/hooks/use-image-upload', () => ({
  useImageUpload: () => ({ mutateAsync: uploadMutateAsync, isPending: false }),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = vi.fn();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
  uploadMutateAsync.mockResolvedValue({
    storagePath: '42/content/uploaded.webp',
    variant1600Path: '42/content/uploaded.webp.1600w.webp',
    variant800Path: '42/content/uploaded.webp.800w.webp',
    altText: '',
  });
});

const pickFile = async (name = 'pic.jpg') => {
  const input = screen.getByLabelText(/add image/i);
  await userEvent.upload(input, new File(['img'], name, { type: 'image/jpeg' }));
};

describe('<GalleryBlockForm>', () => {
  it('renders a heading input and the add-image control, with Save disabled while empty', () => {
    render(wrap(<GalleryBlockForm communityId={42} blockOrder={2} initial={null} />));
    expect(screen.getByLabelText(/heading/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/add image/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('adds an image entry with alt, caption, and decorative controls when a file is picked', async () => {
    render(wrap(<GalleryBlockForm communityId={42} blockOrder={2} initial={null} />));
    await pickFile();
    expect(screen.getByLabelText(/image 1 alt text/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/image 1 caption/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/image 1 decorative/i)).toBeInTheDocument();
  });

  it('keeps Save disabled while a non-decorative image has no alt text', async () => {
    render(wrap(<GalleryBlockForm communityId={42} blockOrder={2} initial={null} />));
    await pickFile();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/image 1 alt text/i), 'A pool');
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
  });

  it('hides the alt input and enables Save when an image is marked decorative', async () => {
    render(wrap(<GalleryBlockForm communityId={42} blockOrder={2} initial={null} />));
    await pickFile();
    await userEvent.click(screen.getByLabelText(/image 1 decorative/i));
    expect(screen.queryByLabelText(/image 1 alt text/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
  });

  it('uploads each new file and saves the gallery block with the images array', async () => {
    render(wrap(<GalleryBlockForm communityId={42} blockOrder={3} initial={null} />));
    await pickFile();
    await userEvent.type(screen.getByLabelText(/image 1 alt text/i), 'The pool');
    await userEvent.type(screen.getByLabelText(/image 1 caption/i), 'Pool deck');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(uploadMutateAsync).toHaveBeenCalledTimes(1));
    expect(uploadMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'content', altText: 'The pool' }),
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const saveCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      ([url]) => url === '/api/v1/pm/site/blocks',
    );
    expect(saveCall).toBeDefined();
    const body = JSON.parse(saveCall![1].body as string);
    expect(body.blockType).toBe('gallery');
    expect(body.blockOrder).toBe(3);
    expect(body.content.images).toEqual([
      { imagePath: '42/content/uploaded.webp', altText: 'The pool', caption: 'Pool deck' },
    ]);
  });

  it('uploads a decorative image with a placeholder alt and stores decorative:true', async () => {
    render(wrap(<GalleryBlockForm communityId={42} blockOrder={2} initial={null} />));
    await pickFile();
    await userEvent.click(screen.getByLabelText(/image 1 decorative/i));
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // finalize requires altText.min(1) — decorative uploads send a placeholder.
    expect(uploadMutateAsync.mock.calls[0][0].altText.length).toBeGreaterThan(0);
    const saveCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      ([url]) => url === '/api/v1/pm/site/blocks',
    );
    const body = JSON.parse(saveCall![1].body as string);
    expect(body.content.images).toEqual([
      { imagePath: '42/content/uploaded.webp', decorative: true },
    ]);
  });

  it('preserves existing images from initial without re-uploading them', async () => {
    render(
      wrap(
        <GalleryBlockForm
          communityId={42}
          blockOrder={2}
          initial={{
            heading: 'Gallery',
            images: [{ imagePath: '42/content/old.webp', altText: 'Existing', caption: 'Old' }],
          }}
        />,
      ),
    );
    expect(screen.getByLabelText(/heading/i)).toHaveValue('Gallery');
    expect(screen.getByLabelText(/image 1 alt text/i)).toHaveValue('Existing');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(uploadMutateAsync).not.toHaveBeenCalled();
    const saveCall = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      ([url]) => url === '/api/v1/pm/site/blocks',
    );
    const body = JSON.parse(saveCall![1].body as string);
    expect(body.content.images).toEqual([
      { imagePath: '42/content/old.webp', altText: 'Existing', caption: 'Old' },
    ]);
  });

  it('removes an image entry when Remove is clicked', async () => {
    render(
      wrap(
        <GalleryBlockForm
          communityId={42}
          blockOrder={2}
          initial={{ images: [{ imagePath: '42/content/old.webp', altText: 'Existing' }] }}
        />,
      ),
    );
    expect(screen.getByLabelText(/image 1 alt text/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    expect(screen.queryByLabelText(/image 1 alt text/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('surfaces an upload/server error as an inline alert', async () => {
    uploadMutateAsync.mockRejectedValueOnce(new Error('Quota exceeded.'));
    render(wrap(<GalleryBlockForm communityId={42} blockOrder={2} initial={null} />));
    await pickFile();
    await userEvent.type(screen.getByLabelText(/image 1 alt text/i), 'Alt');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Quota exceeded.'));
  });
});
