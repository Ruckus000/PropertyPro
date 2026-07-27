import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { ImageBlockForm, scaleCropToNatural } from '@/components/pm/site-editor/ImageBlockForm';

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

  it('creates the preview object URL once per file (not on every keystroke)', async () => {
    const createSpy = global.URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;
    render(wrap(<ImageBlockForm communityId={42} blockOrder={1} initial={null} />));
    const fileInput = screen.getByLabelText('Image');
    const file = new File(['img'], 'test.jpg', { type: 'image/jpeg' });
    await userEvent.upload(fileInput, file);
    expect(createSpy).toHaveBeenCalledTimes(1);
    // Type into alt text — should NOT recreate the object URL.
    await userEvent.type(screen.getByLabelText('Alt text *'), 'a description');
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('revokes the preview object URL on unmount', async () => {
    const revokeSpy = global.URL.revokeObjectURL as unknown as ReturnType<typeof vi.fn>;
    const { unmount } = render(wrap(<ImageBlockForm communityId={42} blockOrder={1} initial={null} />));
    const fileInput = screen.getByLabelText('Image');
    const file = new File(['img'], 'test.jpg', { type: 'image/jpeg' });
    await userEvent.upload(fileInput, file);
    unmount();
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock');
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

  it('sends a non-empty altText to finalize for a decorative image', async () => {
    // REGRESSION. finalize requires `altText: z.string().min(1)`, so sending
    // '' presigned and PUT the bytes and only then 400'd — every decorative
    // image upload failed with an object already stranded in the bucket.
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      // The PUT step's body is a File, not JSON — parsing it unguarded throws
      // and the upload never reaches finalize.
      let body: Record<string, unknown> = {};
      if (typeof init?.body === 'string') {
        try {
          body = JSON.parse(init.body) as Record<string, unknown>;
        } catch {
          body = {};
        }
      }
      calls.push({ url: String(url), body });
      if (String(url).includes('/presign')) {
        return {
          ok: true,
          json: async () => ({
            data: { uploadUrl: 'https://x/up', token: 't', storagePath: '1/content/a.jpg' },
          }),
        } as Response;
      }
      if (String(url).includes('/finalize')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              variant1600Path: '1/content/a.jpg.1600w.webp',
              variant800Path: '1/content/a.jpg.800w.webp',
              altText: body.altText,
            },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ data: { ok: true } }) } as Response;
    }) as unknown as typeof fetch;

    render(wrap(<ImageBlockForm communityId={1} blockOrder={3} initial={null} />));

    const file = new File(['x'], 'deco.jpg', { type: 'image/jpeg' });
    await userEvent.upload(screen.getByLabelText('Image'), file);
    await userEvent.click(screen.getByLabelText(/decorative image/i));
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      const finalize = calls.find((c) => c.url.includes('/finalize'));
      expect(finalize).toBeDefined();
      expect(finalize!.body.altText).not.toBe('');
      expect(String(finalize!.body.altText).length).toBeGreaterThan(0);
    });
  });
});

describe('scaleCropToNatural (ultrareview bug_028 regression)', () => {
  // ReactCrop returns CSS-pixel coords of the rendered <img>. The preview is
  // styled max-w-full and shrinks to ~600px in the editor column, so for a
  // typical 2400×1350 source the rendered img reports clientWidth=600 /
  // clientHeight=337. Without scaling, sharp.extract would treat the
  // display-pixel crop coords as source-pixel coords and crop a tiny region
  // from the upper-left of the source — silent UX corruption. The scaler
  // multiplies by naturalWidth/clientWidth so the coords sent to the server
  // match the user's intended region on the source.

  it('scales display-pixel crop coords up to source-pixel coords', () => {
    const result = scaleCropToNatural(
      { x: 50, y: 80, width: 500, height: 281, unit: 'px' },
      { naturalWidth: 2400, naturalHeight: 1350, clientWidth: 600, clientHeight: 337 },
    );
    expect(result).not.toBeNull();
    // ratioX = 2400/600 = 4, ratioY ≈ 1350/337 ≈ 4.0059
    expect(result!.x).toBe(200);
    expect(result!.width).toBe(2000);
    expect(result!.y).toBeCloseTo(320, -1);   // ratioY ≈ 4.006
    expect(result!.height).toBeCloseTo(1125, -1);
  });

  it('is the identity when displayed and natural sizes match (no shrink)', () => {
    const result = scaleCropToNatural(
      { x: 10, y: 20, width: 100, height: 56, unit: 'px' },
      { naturalWidth: 600, naturalHeight: 337, clientWidth: 600, clientHeight: 337 },
    );
    expect(result).toEqual({ x: 10, y: 20, width: 100, height: 56 });
  });

  it('returns null when the preview img has zero client dimensions (not yet laid out)', () => {
    const result = scaleCropToNatural(
      { x: 10, y: 20, width: 100, height: 56, unit: 'px' },
      { naturalWidth: 1600, naturalHeight: 900, clientWidth: 0, clientHeight: 0 },
    );
    expect(result).toBeNull();
  });
});