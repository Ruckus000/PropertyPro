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
    altText: '',
  };
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
      await result.current.upload([file('a.jpg'), file('b.jpg'), file('c.jpg')], '');
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
      await result.current.upload([file('a.jpg'), file('b.jpg')], '');
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
      await result.current.upload([file('a.jpg')], '');
    });

    expect(onUploaded).toHaveBeenCalledWith(
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
      await result.current.upload([file('a.jpg'), file('b.jpg')], '');
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
      await result.current.upload([], '');
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
      pending = result.current.upload([file('a.jpg')], '');
    });

    await waitFor(() => expect(result.current.isUploading).toBe(true));

    await act(async () => {
      release!();
      await pending!;
    });

    expect(result.current.isUploading).toBe(false);
  });
});
