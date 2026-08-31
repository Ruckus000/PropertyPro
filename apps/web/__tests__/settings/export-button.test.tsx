/**
 * Unit tests for ExportButton (B5 batch #8 drain).
 *
 * Post-B5 split: the data fetch + error parsing + filename derivation moved
 * to `useExportData`; the component still owns the browser/DOM side-effects
 * (object-URL lifecycle, `<a download>` click) and the error-state render.
 *
 * These tests mock `useExportData` and `useReauth` so we exercise only the
 * component's DOM behavior:
 * - click → triggers re-auth then the mutation
 * - pending disables the button
 * - success creates an object URL + clicks an `<a download>` with the filename
 * - error renders the exact danger literal
 * - unmount cleanup revokes the blob URL
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const mutateAsyncMock = vi.fn();
const useExportDataMock = vi.fn();

vi.mock('@/hooks/use-export-data', () => ({
  useExportData: () => useExportDataMock(),
}));

const triggerReauthMock = vi.fn();
vi.mock('@/hooks/use-reauth', () => ({
  useReauth: () => ({
    triggerReauth: triggerReauthMock,
    isOpen: false,
    onCancel: vi.fn(),
    verify: vi.fn(),
  }),
}));

vi.mock('@/components/auth/reauth-modal', () => ({
  ReauthModal: () => null,
}));

import { ExportButton } from '../../src/components/settings/export-button';

function setMutationState(state: {
  isPending?: boolean;
  mutateAsync?: typeof mutateAsyncMock;
}) {
  useExportDataMock.mockReturnValue({
    isPending: state.isPending ?? false,
    mutateAsync: state.mutateAsync ?? mutateAsyncMock,
  });
}

describe('ExportButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    triggerReauthMock.mockResolvedValue(true);
    setMutationState({});
    vi.stubGlobal(
      'URL',
      Object.assign(globalThis.URL, {
        createObjectURL: vi.fn(() => 'blob:mock-url'),
        revokeObjectURL: vi.fn(),
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the default button label', () => {
    render(<ExportButton communityId={1} />);
    // Renamed when the async full-archive export landed alongside it: this
    // button is now the *quick CSV* path, and "Download Community Data" would
    // have implied it was the complete record set. It is not — no document files.
    expect(screen.getByText('Download CSV export')).toBeDefined();
  });

  it('disables the button and shows pending label while pending', () => {
    setMutationState({ isPending: true });
    render(<ExportButton communityId={1} />);
    const btn = screen.getByRole('button');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Exporting…')).toBeDefined();
  });

  it('does not call the mutation when re-auth is cancelled', async () => {
    triggerReauthMock.mockResolvedValue(false);
    render(<ExportButton communityId={5} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(triggerReauthMock).toHaveBeenCalled());
    expect(mutateAsyncMock).not.toHaveBeenCalled();
  });

  it('on success creates an object URL and clicks an <a download> with the filename', async () => {
    const blob = new Blob(['zip'], { type: 'application/zip' });
    mutateAsyncMock.mockResolvedValue({ blob, filename: 'community-export-5.zip' });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    render(<ExportButton communityId={5} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() =>
      expect(mutateAsyncMock).toHaveBeenCalledWith({ communityId: 5 }),
    );
    await waitFor(() => expect(clickSpy).toHaveBeenCalledTimes(1));
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    clickSpy.mockRestore();
  });

  it('revokes the previous blob URL before creating a new one on a second export', async () => {
    const blob = new Blob(['zip'], { type: 'application/zip' });
    mutateAsyncMock.mockResolvedValue({ blob, filename: 'x.zip' });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<ExportButton communityId={5} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('renders the error message from a thrown Error', async () => {
    mutateAsyncMock.mockRejectedValue(new Error('You lack permission to export.'));
    render(<ExportButton communityId={5} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'You lack permission to export.',
      ),
    );
  });

  it('renders the Export failed fallback for a non-Error rejection', async () => {
    mutateAsyncMock.mockRejectedValue('boom');
    render(<ExportButton communityId={5} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('Export failed'),
    );
  });

  it('revokes the blob URL on unmount', async () => {
    const blob = new Blob(['zip'], { type: 'application/zip' });
    mutateAsyncMock.mockResolvedValue({ blob, filename: 'x.zip' });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { unmount } = render(<ExportButton communityId={5} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));

    (URL.revokeObjectURL as ReturnType<typeof vi.fn>).mockClear();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
