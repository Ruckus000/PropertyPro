import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { ImageBlockForm } from '@/components/pm/site-editor/ImageBlockForm';

vi.mock('react-image-crop', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="crop">{children}</div>,
}));
vi.mock('react-image-crop/dist/ReactCrop.css', () => ({}));

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  global.URL.createObjectURL = vi.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = vi.fn();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) });
});

describe('<ImageBlockForm>', () => {
  it('renders file input, decorative checkbox, alt text, and caption fields', () => {
    render(wrap(<ImageBlockForm communityId={42} blockOrder={1} initial={null} />));
    // Use the specific id-based label for the file input to avoid matching "Decorative image"
    expect(screen.getByLabelText('Image')).toBeInTheDocument();
    expect(screen.getByLabelText(/decorative image/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Alt text *')).toBeInTheDocument();
    expect(screen.getByLabelText(/caption/i)).toBeInTheDocument();
  });

  it('hides alt text input when decorative is checked', async () => {
    render(wrap(<ImageBlockForm communityId={42} blockOrder={1} initial={null} />));
    expect(screen.getByLabelText('Alt text *')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/decorative image/i));
    expect(screen.queryByLabelText('Alt text *')).not.toBeInTheDocument();
  });

  it('disables Save when no file and no initial', () => {
    render(wrap(<ImageBlockForm communityId={42} blockOrder={1} initial={null} />));
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('disables Save when non-decorative with empty alt text but file provided', async () => {
    render(wrap(<ImageBlockForm communityId={42} blockOrder={1} initial={null} />));
    const fileInput = screen.getByLabelText('Image');
    const file = new File(['img'], 'test.jpg', { type: 'image/jpeg' });
    await userEvent.upload(fileInput, file);
    // alt text is still empty — should remain disabled
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('pre-fills from initial prop', () => {
    render(
      wrap(
        <ImageBlockForm
          communityId={42}
          blockOrder={1}
          initial={{ imagePath: 'communities/42/hero.jpg', altText: 'A photo', caption: 'Nice view' }}
        />,
      ),
    );
    expect(screen.getByLabelText('Alt text *')).toHaveValue('A photo');
    expect(screen.getByLabelText(/caption/i)).toHaveValue('Nice view');
  });

  it('displays server error in role=alert', async () => {
    // Provide initial so file gate is satisfied; save call will fail
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Upload service unavailable.' } }),
    });
    render(
      wrap(
        <ImageBlockForm
          communityId={42}
          blockOrder={1}
          initial={{ imagePath: 'communities/42/photo.jpg', altText: 'Alt' }}
        />,
      ),
    );
    // With initial + altText pre-filled, save should be enabled
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    // Wait for error to appear
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('Upload service unavailable.');
  });
});
