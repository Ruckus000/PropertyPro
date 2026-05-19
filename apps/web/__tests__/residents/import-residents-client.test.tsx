/**
 * Unit tests for ImportResidentsClient (B5 batch #18).
 *
 * Post-B5 split: the network helpers + useMutation wiring moved to
 * `@/hooks/use-import-residents`. These tests mock those hooks with
 * controllable mutation objects and drive the wizard state machine
 * (upload → preview → import → results), error states, and reset.
 *
 * Mirrors apps/web/__tests__/contracts/contract-table.test.tsx.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

interface MockMutation {
  mutate: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  isPending: boolean;
  error: Error | null;
  data: unknown;
}

function makeMutation(): MockMutation {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null,
    data: undefined,
  };
}

const dryRunMutation = makeMutation();
const importMutation = makeMutation();

vi.mock('@/hooks/use-import-residents', () => ({
  useDryRunImport: () => dryRunMutation,
  useImportResidents: () => importMutation,
}));

import { ImportResidentsClient } from '../../src/components/residents/import-residents-client';

function renderClient(communityId = 42) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ImportResidentsClient communityId={communityId} />
    </QueryClientProvider>,
  );
}

function uploadCsv(text = 'name,email,role\nJane,jane@x.com,owner') {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([text], 'residents.csv', { type: 'text/csv' });
  // jsdom FileReader.readAsText works; fire change
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  dryRunMutation.mutate.mockReset();
  dryRunMutation.reset.mockReset();
  dryRunMutation.isPending = false;
  dryRunMutation.error = null;
  dryRunMutation.data = undefined;
  importMutation.mutate.mockReset();
  importMutation.reset.mockReset();
  importMutation.isPending = false;
  importMutation.error = null;
  importMutation.data = undefined;
});

describe('ImportResidentsClient — upload step', () => {
  it('renders the upload step initially', () => {
    renderClient();
    expect(screen.getByText('Import Residents')).toBeInTheDocument();
    expect(
      screen.getByText('Drag and drop your CSV file here'),
    ).toBeInTheDocument();
  });

  it('reading a file triggers the dry-run mutation', async () => {
    renderClient();
    uploadCsv();
    await waitFor(() => expect(dryRunMutation.mutate).toHaveBeenCalledTimes(1));
    expect(dryRunMutation.mutate.mock.calls[0]![0]).toContain('jane@x.com');
  });

  it('shows the dry-run error literal on the upload step', () => {
    dryRunMutation.error = new Error('Failed to validate CSV');
    renderClient();
    expect(screen.getByText('Validation failed')).toBeInTheDocument();
    expect(screen.getByText('Failed to validate CSV')).toBeInTheDocument();
  });

  it('shows the validating spinner state when dry-run is pending', () => {
    dryRunMutation.isPending = true;
    renderClient();
    expect(screen.getByText(/Validating/)).toBeInTheDocument();
  });
});

describe('ImportResidentsClient — preview step', () => {
  it('dry-run onSuccess advances to the preview table', async () => {
    renderClient();
    uploadCsv();
    await waitFor(() => expect(dryRunMutation.mutate).toHaveBeenCalled());

    // Invoke the per-call onSuccess the component passed in.
    const [, opts] = dryRunMutation.mutate.mock.calls[0]!;
    (opts as { onSuccess: (d: unknown) => void }).onSuccess({
      data: {
        preview: [
          { name: 'Jane', email: 'jane@x.com', role: 'owner', unit_number: '101' },
        ],
        errors: [],
        header: ['name', 'email', 'role', 'unit_number'],
      },
    });

    await waitFor(() =>
      expect(screen.getByText('1 ready to import')).toBeInTheDocument(),
    );
    expect(screen.getByText('jane@x.com')).toBeInTheDocument();
  });
});

describe('ImportResidentsClient — import + results', () => {
  async function advanceToPreview() {
    renderClient();
    uploadCsv();
    await waitFor(() => expect(dryRunMutation.mutate).toHaveBeenCalled());
    const [, opts] = dryRunMutation.mutate.mock.calls[0]!;
    (opts as { onSuccess: (d: unknown) => void }).onSuccess({
      data: {
        preview: [
          { name: 'Jane', email: 'jane@x.com', role: 'owner', unit_number: '101' },
        ],
        errors: [],
        header: ['name'],
      },
    });
    await waitFor(() =>
      expect(screen.getByText('1 ready to import')).toBeInTheDocument(),
    );
  }

  it('clicking Import calls the import mutation, then results show on success', async () => {
    await advanceToPreview();

    fireEvent.click(screen.getByRole('button', { name: /Import 1 Resident/ }));
    await waitFor(() => expect(importMutation.mutate).toHaveBeenCalledTimes(1));

    const [csvArg, opts] = importMutation.mutate.mock.calls[0]!;
    expect(csvArg).toContain('jane@x.com');
    (opts as { onSuccess: (d: unknown) => void }).onSuccess({
      data: { importedCount: 1, skippedCount: 0, errors: [] },
    });

    await waitFor(() =>
      expect(
        screen.getByText('1 resident imported successfully'),
      ).toBeInTheDocument(),
    );
  });

  it('shows the import error literal during the importing step', async () => {
    await advanceToPreview();
    importMutation.error = new Error('Failed to import residents');
    fireEvent.click(screen.getByRole('button', { name: /Import 1 Resident/ }));

    await waitFor(() =>
      expect(screen.getByText('Import failed')).toBeInTheDocument(),
    );
    expect(screen.getByText('Failed to import residents')).toBeInTheDocument();
  });
});

describe('ImportResidentsClient — reset', () => {
  it('Cancel from preview resets both mutations and returns to upload', async () => {
    renderClient();
    uploadCsv();
    await waitFor(() => expect(dryRunMutation.mutate).toHaveBeenCalled());
    const [, opts] = dryRunMutation.mutate.mock.calls[0]!;
    (opts as { onSuccess: (d: unknown) => void }).onSuccess({
      data: { preview: [{ name: 'J', email: 'j@x.com', role: 'owner', unit_number: null }], errors: [], header: [] },
    });
    await waitFor(() =>
      expect(screen.getByText('1 ready to import')).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(dryRunMutation.reset).toHaveBeenCalledTimes(1);
    expect(importMutation.reset).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.getByText('Drag and drop your CSV file here'),
      ).toBeInTheDocument(),
    );
  });
});
