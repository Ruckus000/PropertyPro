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
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';

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

const { saveCsvFileMock } = vi.hoisted(() => ({ saveCsvFileMock: vi.fn() }));
vi.mock('@/lib/utils/save-csv-file', () => ({ saveCsvFile: saveCsvFileMock }));

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
          { name: 'Jane', email: 'jane@x.com', role: 'owner', unit_number: '101', rowNumber: 2, existingAccount: false },
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
          { name: 'Jane', email: 'jane@x.com', role: 'owner', unit_number: '101', rowNumber: 2, existingAccount: false },
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
      expect(screen.getByText('The import stopped before finishing')).toBeInTheDocument(),
    );
    expect(screen.getByText(/^Failed to import residents\. Every row that was saved is complete/)).toBeInTheDocument();
    // The spinner is gone once the request has failed.
    expect(screen.queryByText('Importing residents...')).not.toBeInTheDocument();
  });

  it("'Check what's left' re-checks the same file and returns to the preview (audit F2)", async () => {
    await advanceToPreview();
    importMutation.error = new Error('Failed to import residents');
    fireEvent.click(screen.getByRole('button', { name: /Import 1 Resident/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: "Check what's left" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: "Check what's left" }));

    // Not yet: clearing the import's error before the re-check succeeds put
    // the "Importing residents..." spinner back up with nowhere to show a
    // failed re-check (review of audit F2).
    expect(importMutation.reset).not.toHaveBeenCalled();
    // Same CSV as the first preview — not a new upload.
    expect(dryRunMutation.mutate).toHaveBeenCalledTimes(2);
    const [csvAgain, opts] = dryRunMutation.mutate.mock.calls[1]!;
    expect(csvAgain).toBe(dryRunMutation.mutate.mock.calls[0]![0]);

    // The saved row now comes back as already a member.
    (opts as { onSuccess: (d: unknown) => void }).onSuccess({
      data: {
        preview: [],
        errors: [
          {
            rowNumber: 2,
            column: 'email',
            message: "User with email 'jane@x.com' already has a role in this community",
            code: 'already_member',
          },
        ],
        header: ['name', 'email', 'role', 'unit_number'],
      },
    });
    await waitFor(() => expect(screen.getByText('0 ready to import')).toBeInTheDocument());
    expect(importMutation.reset).toHaveBeenCalledTimes(1);
    // Shown as done — not as a row to fix, and not in the rows-to-fix download.
    expect(screen.getByText('1 already a member')).toBeInTheDocument();
    expect(screen.getByText('Already in this community — nothing to import')).toBeInTheDocument();
    expect(screen.queryByText(/need(s)? fixing/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download rows to fix' })).not.toBeInTheDocument();
  });
});

describe('ImportResidentsClient — import failures (audit F2)', () => {
  async function failImport(error: Error) {
    renderClient();
    uploadCsv();
    await waitFor(() => expect(dryRunMutation.mutate).toHaveBeenCalled());
    const [, opts] = dryRunMutation.mutate.mock.calls[0]!;
    (opts as { onSuccess: (d: unknown) => void }).onSuccess({
      data: {
        preview: [{ name: 'Jane', email: 'jane@x.com', role: 'owner', unit_number: '101', rowNumber: 2, existingAccount: false }],
        errors: [],
        header: ['name'],
      },
    });
    await waitFor(() => expect(screen.getByText('1 ready to import')).toBeInTheDocument());
    importMutation.error = error;
    fireEvent.click(screen.getByRole('button', { name: /Import 1 Resident/ }));
  }

  it('a refusal (4xx) says nothing was imported and offers the preview back', async () => {
    await failImport(Object.assign(new Error('Your subscription has ended'), { status: 402 }));

    await waitFor(() => expect(screen.getByText("The import didn't start")).toBeInTheDocument());
    expect(screen.getByText('Your subscription has ended. Nothing was imported.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Check what's left" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to preview' }));
    expect(importMutation.reset).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('1 ready to import')).toBeInTheDocument());
  });

  it('a server error or lost response says rows may be saved and offers the re-check', async () => {
    await failImport(Object.assign(new Error('The request timed out'), { status: 504 }));

    await waitFor(() => expect(screen.getByText('The import stopped before finishing')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: "Check what's left" })).toBeInTheDocument();
  });

  it('a re-check that fails is shown, not swallowed', async () => {
    dryRunMutation.error = new Error('Your session has expired');
    await failImport(Object.assign(new Error('Failed to import residents'), { status: null }));

    await waitFor(() => expect(screen.getByText("We couldn't check the file again")).toBeInTheDocument());
    expect(screen.getByText('Your session has expired')).toBeInTheDocument();
    expect(screen.queryByText('Importing residents...')).not.toBeInTheDocument();
  });
});

describe('ImportResidentsClient — reset', () => {
  it('Cancel from preview resets both mutations and returns to upload', async () => {
    renderClient();
    uploadCsv();
    await waitFor(() => expect(dryRunMutation.mutate).toHaveBeenCalled());
    const [, opts] = dryRunMutation.mutate.mock.calls[0]!;
    (opts as { onSuccess: (d: unknown) => void }).onSuccess({
      data: { preview: [{ name: 'J', email: 'j@x.com', role: 'owner', unit_number: null, rowNumber: 2, existingAccount: false }], errors: [], header: [] },
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

// ---------------------------------------------------------------------------
// Onboarding audit F1: the preview lines up with the uploaded file.
// ---------------------------------------------------------------------------
describe('ImportResidentsClient — preview follows the file (audit F1)', () => {
  // Line 1 header · 2 ready · 3 two shape errors · 4 blank · 5 unit missing · 6 ready (existing account)
  const MIXED = [
    'name,email,role,unit_number',
    'Ann,ann@x.com,owner,101',
    ',bad,owner,102',
    '',
    'Cal,cal@x.com,tenant,999',
    'Dee,dee@x.com,owner,103',
  ].join('\n');

  const MIXED_RESPONSE = {
    data: {
      preview: [
        { name: 'Ann', email: 'ann@x.com', role: 'owner', unit_number: '101', rowNumber: 2, existingAccount: false },
        { name: 'Dee', email: 'dee@x.com', role: 'owner', unit_number: '103', rowNumber: 6, existingAccount: true },
      ],
      errors: [
        { rowNumber: 3, column: 'name', message: 'Name is required' },
        { rowNumber: 3, column: 'email', message: 'Invalid email address' },
        { rowNumber: 5, column: 'unit_number', message: "Unit '999' not found" },
      ],
      header: ['name', 'email', 'role', 'unit_number'],
    },
  };

  async function previewOf(csv: string, response: unknown) {
    renderClient();
    uploadCsv(csv);
    await waitFor(() => expect(dryRunMutation.mutate).toHaveBeenCalled());
    const [, opts] = dryRunMutation.mutate.mock.calls[0]!;
    (opts as { onSuccess: (d: unknown) => void }).onSuccess(response);
  }

  function bodyRows() {
    const [, ...rows] = screen.getAllByRole('row'); // drop the header row
    return rows.map((row) => within(row).getAllByRole('cell').map((c) => c.textContent));
  }

  beforeEach(() => saveCsvFileMock.mockReset());

  it('shows every line on its own line number, with rejected rows as typed', async () => {
    await previewOf(MIXED, MIXED_RESPONSE);
    await waitFor(() => expect(screen.getByText('2 ready to import')).toBeInTheDocument());

    const rows = bodyRows();
    // The blank line 4 is skipped; nothing is renumbered and nothing is hidden.
    expect(rows.map((r) => r[0])).toEqual(['2', '3', '5', '6']);
    // Each problem names its column (audit F10), so the reader knows which field to fix.
    expect(rows[1]).toEqual(['3', 'Fix', '-', 'bad', 'owner', '102', 'name: Name is required; email: Invalid email address']);
    expect(rows[2]![6]).toBe("unit_number: Unit '999' not found");
    expect(rows[3]![6]).toBe('Existing account — will be added to this community');
  });

  it('counts rows that need fixing, not error messages', async () => {
    await previewOf(MIXED, MIXED_RESPONSE);
    // Three messages, two rows.
    await waitFor(() => expect(screen.getByText('2 rows need fixing')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Import 2 Residents/ })).toBeEnabled();
  });

  it('reports a file-level problem once, as a banner, not as a table row', async () => {
    await previewOf('name,email\nAnn,ann@x.com', {
      data: {
        preview: [],
        errors: [
          { rowNumber: 1, column: 'role', message: "Missing required column 'role'" },
          { rowNumber: 2, column: 'role', message: 'Role is required' },
        ],
        header: ['name', 'email'],
      },
    });

    await waitFor(() => expect(screen.getByText("This file can't be imported as it is")).toBeInTheDocument());
    expect(screen.getByText("Missing required column 'role'")).toBeInTheDocument();
    // The whole file is blocked, so no row-by-row table or download repeats it.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download rows to fix' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Import 0 Residents/ })).toBeDisabled();
  });

  it('downloads only the rows to fix, as typed, with their line and reason', async () => {
    await previewOf(MIXED, MIXED_RESPONSE);
    await waitFor(() => expect(screen.getByText('2 ready to import')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Download rows to fix' }));

    expect(saveCsvFileMock).toHaveBeenCalledTimes(1);
    const [csv, filename] = saveCsvFileMock.mock.calls[0]!;
    expect(filename).toBe('residents-rows-to-fix.csv');
    expect((csv as string).split('\r\n')).toEqual([
      'name,email,role,unit_number,line,error',
      ',bad,owner,102,3,name: Name is required; email: Invalid email address',
      "Cal,cal@x.com,tenant,999,5,unit_number: Unit '999' not found",
    ]);
  });

  it('reads a quoted field with a comma the way the server did', async () => {
    await previewOf('name,email,role,unit_number\n"Smith, Jo",jo@x.com,owner," 101 "\n"Lee, Al",bad,owner,102', {
      data: {
        preview: [{ name: 'Smith, Jo', email: 'jo@x.com', role: 'owner', unit_number: '101', rowNumber: 2, existingAccount: false }],
        errors: [{ rowNumber: 3, column: 'email', message: 'Invalid email address' }],
        header: ['name', 'email', 'role', 'unit_number'],
      },
    });
    await waitFor(() => expect(screen.getByText('1 ready to import')).toBeInTheDocument());

    const rows = bodyRows();
    expect(rows[0]!.slice(2, 6)).toEqual(['Smith, Jo', 'jo@x.com', 'owner', '101']);
    expect(rows[1]!.slice(2, 4)).toEqual(['Lee, Al', 'bad']);

    fireEvent.click(screen.getByRole('button', { name: 'Download rows to fix' }));
    const [csv] = saveCsvFileMock.mock.calls[0]!;
    expect((csv as string).split('\r\n')[1]).toBe('"Lee, Al",bad,owner,102,3,email: Invalid email address');
  });

  it('keeps an already-member row out of the fix count and the download, beside real problems', async () => {
    await previewOf(MIXED, {
      data: {
        ...MIXED_RESPONSE.data,
        // Line 6 is already in the community instead of ready.
        preview: MIXED_RESPONSE.data.preview.filter((r) => r.rowNumber !== 6),
        errors: [
          ...MIXED_RESPONSE.data.errors,
          {
            rowNumber: 6,
            column: 'email',
            message: "User with email 'dee@x.com' already has a role in this community",
            code: 'already_member',
          },
        ],
      },
    });
    await waitFor(() => expect(screen.getByText('1 ready to import')).toBeInTheDocument());
    expect(screen.getByText('2 rows need fixing')).toBeInTheDocument();
    expect(screen.getByText('1 already a member')).toBeInTheDocument();
    const row6 = bodyRows().find((r) => r[0] === '6')!;
    expect(row6[1]).toBe('Member');
    expect(row6[6]).toBe('Already in this community — nothing to import');

    fireEvent.click(screen.getByRole('button', { name: 'Download rows to fix' }));
    const [csv] = saveCsvFileMock.mock.calls[0]!;
    expect((csv as string).split('\r\n').map((l) => l.split(',')[0])).toEqual(['name', '', 'Cal']);
  });

  it('offers no download when every row is ready', async () => {
    await previewOf('name,email,role,unit_number\nAnn,ann@x.com,owner,101', {
      data: {
        preview: [{ name: 'Ann', email: 'ann@x.com', role: 'owner', unit_number: '101', rowNumber: 2, existingAccount: false }],
        errors: [],
        header: ['name', 'email', 'role', 'unit_number'],
      },
    });
    await waitFor(() => expect(screen.getByText('1 ready to import')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Download rows to fix' })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Onboarding audit F10: the import screen for keyboard and screen-reader users.
// ---------------------------------------------------------------------------
describe('ImportResidentsClient — accessibility (audit F10)', () => {
  const RESPONSE = {
    data: {
      preview: [{ name: 'Ann', email: 'ann@x.com', role: 'owner', unit_number: '101', rowNumber: 2, existingAccount: false }],
      errors: [{ rowNumber: 3, column: 'email', message: 'Invalid email address' }],
      header: ['name', 'email', 'role', 'unit_number'],
    },
  };

  async function toPreview() {
    renderClient();
    uploadCsv('name,email,role,unit_number\nAnn,ann@x.com,owner,101\nBo,bad,owner,102');
    await waitFor(() => expect(dryRunMutation.mutate).toHaveBeenCalled());
    const [, opts] = dryRunMutation.mutate.mock.calls[0]!;
    (opts as { onSuccess: (d: unknown) => void }).onSuccess(RESPONSE);
    await waitFor(() => expect(screen.getByText('1 ready to import')).toBeInTheDocument());
  }

  it('announces the preview in one persistent live region', async () => {
    renderClient();
    const live = screen.getByRole('status');
    expect(live).toHaveTextContent('');
    uploadCsv('name,email,role,unit_number\nAnn,ann@x.com,owner,101\nBo,bad,owner,102');
    await waitFor(() => expect(dryRunMutation.mutate).toHaveBeenCalled());
    const [, opts] = dryRunMutation.mutate.mock.calls[0]!;
    (opts as { onSuccess: (d: unknown) => void }).onSuccess(RESPONSE);

    // Same element, new text: a region mounted together with its text is often not read.
    await waitFor(() => expect(live).toHaveTextContent('Preview ready: 1 ready to import, 1 to fix.'));
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('moves focus to the new step instead of leaving it on the page', async () => {
    await toPreview();
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-label', 'Import step'));
  });

  it('does not take focus on first render, even under StrictMode effect replay', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(
      <StrictMode>
        <QueryClientProvider client={qc}>
          <ImportResidentsClient communityId={42} />
        </QueryClientProvider>
      </StrictMode>,
    );
    expect(document.activeElement).toBe(document.body);
  });

  it('moves focus to the step while a file is checked (the upload controls unmount)', () => {
    const { rerender } = renderClient();
    dryRunMutation.isPending = true;
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <ImportResidentsClient communityId={42} />
      </QueryClientProvider>,
    );
    expect(document.activeElement).toHaveAttribute('aria-label', 'Import step');
  });

  it('announces a file the preview refuses as a whole, not "0 to fix"', async () => {
    renderClient();
    const live = screen.getByRole('status');
    uploadCsv('name,email\nAnn,ann@x.com');
    await waitFor(() => expect(dryRunMutation.mutate).toHaveBeenCalled());
    const [, opts] = dryRunMutation.mutate.mock.calls[0]!;
    (opts as { onSuccess: (d: unknown) => void }).onSuccess({
      data: {
        preview: [],
        errors: [{ rowNumber: 1, column: 'role', message: "Missing required column 'role'" }],
        header: ['name', 'email'],
      },
    });
    await waitFor(() => expect(live).toHaveTextContent("This file can't be imported as it is."));
  });

  it('says so when a dropped file is not a CSV, instead of doing nothing', () => {
    renderClient();
    const dropZone = screen.getByText('Drag and drop your CSV file here').closest('div')!.parentElement!;
    const file = new File(['x'], 'residents.xlsx', { type: 'application/vnd.ms-excel' });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    expect(screen.getByText(/residents\.xlsx is not a CSV file/)).toBeInTheDocument();
    expect(dryRunMutation.mutate).not.toHaveBeenCalled();
  });
});

