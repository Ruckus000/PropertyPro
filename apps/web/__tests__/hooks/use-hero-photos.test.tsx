/**
 * useHeroPhotos — the hero photo upload queue.
 *
 * The behaviour worth pinning is sequencing and failure isolation. Both are
 * invisible in the happy path and expensive when wrong: parallel presigns race
 * the per-plan storage-quota check, and a queue that aborts on the first bad
 * file silently drops the rest of a PM's selection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useHeroPhotos } from '@/hooks/use-hero-photos';

const mutateAsyncMock = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-image-upload', () => ({
  // Mocked at the existing-pipeline boundary on purpose: this hook must not
  // add a second upload path, so there is nothing below here to test.
  useImageUpload: () => ({ mutateAsync: mutateAsyncMock }),
}));

function file(name: string): File {
  return new File(['bytes'], name, { type: 'image/jpeg' });
}

function resultFor(name: string) {
  return {
    storagePath: `7/hero/${name}`,
    variant1600Path: `7/hero/${name}.1600w.webp`,
    variant800Path: `7/hero/${name}.800w.webp`,
    // finalize echoes back whatever it was sent. Deliberately NOT the alt the
    // caller staged, so a test that reads this instead of the item fails.
    altText: 'SERVER ECHO',
  };
}

/** A described file, ready to upload. */
function item(name: string, alt = `A photo called ${name}`) {
  return { id: `staged-${name}`, file: file(name), alt, decorative: false };
}

beforeEach(() => {
  mutateAsyncMock.mockReset();
});

describe('useHeroPhotos', () => {
  it('uploads strictly one at a time', async () => {
    // Parallel presigns race the quota check and stack sharp resizes.
    let inFlight = 0;
    let maxInFlight = 0;
    mutateAsyncMock.mockImplementation(async ({ file: f }: { file: File }) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return resultFor(f.name);
    });

    const onUploaded = vi.fn();
    const { result } = renderHook(() => useHeroPhotos({ communityId: 7, onUploaded }));

    await act(async () => {
      await result.current.upload([item('a.jpg'), item('b.jpg'), item('c.jpg')]);
    });

    expect(maxInFlight).toBe(1);
    expect(mutateAsyncMock).toHaveBeenCalledTimes(3);
  });

  it('reports each file as it finalizes, not once at the end', async () => {
    // finalize has already written the variants and charged the quota; nothing
    // references them until this callback lands them in block content, so
    // reporting late widens the orphan window.
    mutateAsyncMock.mockImplementation(async ({ file: f }: { file: File }) =>
      resultFor(f.name),
    );
    const onUploaded = vi.fn();
    const { result } = renderHook(() => useHeroPhotos({ communityId: 7, onUploaded }));

    await act(async () => {
      await result.current.upload([item('a.jpg'), item('b.jpg')]);
    });

    expect(onUploaded).toHaveBeenCalledTimes(2);
    expect(onUploaded.mock.calls[0]![0].storagePath).toBe('7/hero/a.jpg');
  });

  it('hands back the BASE storage path, not the 1600w variant', async () => {
    // The renderer appends the variant suffixes; storing the suffixed path is
    // the legacy convention that `stripVariantSuffix` exists to undo.
    mutateAsyncMock.mockResolvedValue(resultFor('a.jpg'));
    const onUploaded = vi.fn();
    const { result } = renderHook(() => useHeroPhotos({ communityId: 7, onUploaded }));

    await act(async () => {
      await result.current.upload([item('a.jpg')]);
    });

    expect(onUploaded.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ storagePath: '7/hero/a.jpg' }),
    );
  });

  it('keeps going after one file fails, and surfaces which', async () => {
    mutateAsyncMock
      .mockRejectedValueOnce(new Error('File too large'))
      .mockResolvedValueOnce(resultFor('b.jpg'));

    const onUploaded = vi.fn();
    const { result } = renderHook(() => useHeroPhotos({ communityId: 7, onUploaded }));

    await act(async () => {
      await result.current.upload([item('a.jpg'), item('b.jpg')]);
    });

    // The good file still landed.
    expect(onUploaded).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      const failed = result.current.uploads.find((u) => u.status === 'error');
      expect(failed?.filename).toBe('a.jpg');
      expect(failed?.error).toBe('File too large');
    });
  });

  it('does nothing for an empty selection', async () => {
    const onUploaded = vi.fn();
    const { result } = renderHook(() => useHeroPhotos({ communityId: 7, onUploaded }));

    await act(async () => {
      await result.current.upload([]);
    });

    expect(mutateAsyncMock).not.toHaveBeenCalled();
    expect(result.current.uploads).toEqual([]);
  });

  it('reports uploading state so the picker can disable itself', async () => {
    let release: (() => void) | undefined;
    mutateAsyncMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(resultFor('a.jpg'));
        }),
    );
    const { result } = renderHook(() =>
      useHeroPhotos({ communityId: 7, onUploaded: vi.fn() }),
    );

    let pending: Promise<void>;
    act(() => {
      pending = result.current.upload([item('a.jpg')]);
    });

    await waitFor(() => expect(result.current.isUploading).toBe(true));

    await act(async () => {
      release!();
      await pending!;
    });

    expect(result.current.isUploading).toBe(false);
  });

  it('never sends an empty altText to finalize', async () => {
    // THE regression. finalize requires `altText: z.string().min(1)`, so an
    // empty string presigns, PUTs the bytes, and only then 400s — leaving an
    // orphaned object every attempt. This is why alt is collected before the
    // upload rather than typed into the row afterwards.
    mutateAsyncMock.mockImplementation(async ({ file: f }: { file: File }) =>
      resultFor(f.name),
    );
    const { result } = renderHook(() =>
      useHeroPhotos({ communityId: 7, onUploaded: vi.fn() }),
    );

    await act(async () => {
      await result.current.upload([
        item('described.jpg', 'The pool at sunset'),
        { id: 'staged-deco', file: file('deco.jpg'), alt: '', decorative: true },
      ]);
    });

    for (const call of mutateAsyncMock.mock.calls) {
      expect(call[0].altText).not.toBe('');
      expect(call[0].altText.length).toBeGreaterThan(0);
    }
    // A decorative photo carries no block-content alt, so the pipeline gets a
    // placeholder purely to satisfy the contract.
    expect(mutateAsyncMock.mock.calls[1]![0].altText).toBe('Decorative image');
  });

  it('sends each file its own alt text', async () => {
    mutateAsyncMock.mockImplementation(async ({ file: f }: { file: File }) =>
      resultFor(f.name),
    );
    const { result } = renderHook(() =>
      useHeroPhotos({ communityId: 7, onUploaded: vi.fn() }),
    );

    await act(async () => {
      await result.current.upload([
        item('a.jpg', 'The lobby'),
        item('b.jpg', 'The gym'),
      ]);
    });

    expect(mutateAsyncMock.mock.calls[0]![0].altText).toBe('The lobby');
    expect(mutateAsyncMock.mock.calls[1]![0].altText).toBe('The gym');
  });

  it('hands the staged item back so the caller never needs result.altText', async () => {
    mutateAsyncMock.mockResolvedValue(resultFor('a.jpg'));
    const onUploaded = vi.fn();
    const { result } = renderHook(() => useHeroPhotos({ communityId: 7, onUploaded }));

    await act(async () => {
      await result.current.upload([item('a.jpg', 'The real description')]);
    });

    expect(onUploaded.mock.calls[0]![1]).toEqual(
      expect.objectContaining({ alt: 'The real description', decorative: false }),
    );
  });

  it('errors a blank non-decorative row instead of uploading it', async () => {
    // Belt and braces behind the UI gate: sending '' would strand bytes in the
    // bucket before the 400 lands, so the row fails locally instead.
    const { result } = renderHook(() =>
      useHeroPhotos({ communityId: 7, onUploaded: vi.fn() }),
    );

    await act(async () => {
      await result.current.upload([
        { id: 'staged-blank', file: file('blank.jpg'), alt: '   ', decorative: false },
      ]);
    });

    expect(mutateAsyncMock).not.toHaveBeenCalled();
    await waitFor(() => {
      const row = result.current.uploads.find((u) => u.localId === 'staged-blank');
      expect(row?.status).toBe('error');
    });
  });
});
