'use client';

import { useState, useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AlertBanner } from '@/components/shared/alert-banner';

/* ─────── Types ─────── */

interface DryRunRow {
  name: string;
  email: string;
  role: string;
  unit_number: string | null;
}

interface CsvError {
  rowNumber: number;
  column: string | null;
  message: string;
}

interface DryRunResponse {
  data: {
    preview: DryRunRow[];
    errors: CsvError[];
    header: string[];
  };
}

interface ImportResponse {
  data: {
    importedCount: number;
    skippedCount: number;
    errors: CsvError[];
  };
}

interface ImportResidentsClientProps {
  communityId: number;
}

type WizardStep = 'upload' | 'preview' | 'importing' | 'results';

/* ─────── CSV Template ─────── */

const CSV_TEMPLATE = 'name,email,role,unit_number\nJane Doe,jane@example.com,owner,101\nJohn Smith,john@example.com,tenant,102';

function downloadCsvTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'resident-import-template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─────── API helpers ─────── */

async function dryRunImport(communityId: number, csvText: string): Promise<DryRunResponse> {
  const response = await fetch('/api/v1/import-residents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ communityId, csv: csvText, dryRun: true }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(err?.message ?? 'Failed to validate CSV');
  }
  return response.json() as Promise<DryRunResponse>;
}

async function executeImport(communityId: number, csvText: string): Promise<ImportResponse> {
  const response = await fetch('/api/v1/import-residents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ communityId, csv: csvText, dryRun: false }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(err?.message ?? 'Failed to import residents');
  }
  return response.json() as Promise<ImportResponse>;
}

/* ─────── Component ─────── */

export function ImportResidentsClient({ communityId }: ImportResidentsClientProps) {
  const [step, setStep] = useState<WizardStep>('upload');
  const [csvText, setCsvText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [dryRunData, setDryRunData] = useState<DryRunResponse['data'] | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse['data'] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dryRunMutation = useMutation({
    mutationFn: (csv: string) => dryRunImport(communityId, csv),
    onSuccess: (data) => {
      setDryRunData(data.data);
      setStep('preview');
    },
  });

  const importMutation = useMutation({
    mutationFn: () => executeImport(communityId, csvText),
    onSuccess: (data) => {
      setImportResult(data.data);
      setStep('results');
    },
  });

  const handleFileRead = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      dryRunMutation.mutate(text);
    };
    reader.readAsText(file);
  }, [dryRunMutation]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileRead(file);
  }, [handleFileRead]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      handleFileRead(file);
    }
  }, [handleFileRead]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const resetWizard = useCallback(() => {
    setStep('upload');
    setCsvText('');
    setFileName('');
    setDryRunData(null);
    setImportResult(null);
    dryRunMutation.reset();
    importMutation.reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [dryRunMutation, importMutation]);

  const handleImport = useCallback(() => {
    setStep('importing');
    importMutation.mutate();
  }, [importMutation]);

  // Compute preview stats
  const validRows = dryRunData?.preview.length ?? 0;
  const errorRows = dryRunData?.errors.length ?? 0;
  const errorRowNumbers = new Set(dryRunData?.errors.map((e) => e.rowNumber) ?? []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/residents?communityId=${communityId}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-content-secondary hover:bg-surface-muted hover:text-content"
          aria-label="Back to residents"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="text-2xl font-semibold text-content">Import Residents</h1>
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <UploadStep
          dragOver={dragOver}
          isLoading={dryRunMutation.isPending}
          error={dryRunMutation.error instanceof Error ? dryRunMutation.error.message : null}
          fileName={fileName}
          fileInputRef={fileInputRef}
          onFileChange={handleFileChange}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        />
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && dryRunData && (
        <PreviewStep
          preview={dryRunData.preview}
          errors={dryRunData.errors}
          validCount={validRows}
          errorCount={errorRows}
          errorRowNumbers={errorRowNumbers}
          onImport={handleImport}
          onCancel={resetWizard}
        />
      )}

      {/* Step 3: Importing */}
      {step === 'importing' && (
        <div className="flex flex-col items-center gap-4 py-16">
          <Loader2 size={40} className="animate-spin text-interactive" aria-hidden="true" />
          <p className="text-sm text-content-secondary">Importing residents...</p>
          {importMutation.error instanceof Error && (
            <AlertBanner
              status="danger"
              title="Import failed"
              description={importMutation.error.message}
              action={
                <button
                  type="button"
                  onClick={resetWizard}
                  className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
                >
                  Start Over
                </button>
              }
            />
          )}
        </div>
      )}

      {/* Step 4: Results */}
      {step === 'results' && importResult && (
        <ResultsStep
          result={importResult}
          communityId={communityId}
          onImportMore={resetWizard}
        />
      )}
    </div>
  );
}

/* ─────── Upload Step ─────── */

interface UploadStepProps {
  dragOver: boolean;
  isLoading: boolean;
  error: string | null;
  fileName: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
}

function UploadStep({
  dragOver,
  isLoading,
  error,
  fileName,
  fileInputRef,
  onFileChange,
  onDrop,
  onDragOver,
  onDragLeave,
}: UploadStepProps) {
  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="rounded-md border border-border-default bg-surface-card p-5">
        <div className="flex items-start gap-3">
          <FileSpreadsheet size={20} className="mt-0.5 shrink-0 text-content-secondary" aria-hidden="true" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-content">
              Upload a CSV with columns: name, email, role, unit_number
            </p>
            <p className="text-sm text-content-secondary">
              Valid roles: owner, tenant, board_member, board_president, cam, site_manager, property_manager_admin.
              The unit_number column is optional for roles that do not require a unit.
            </p>
            <button
              type="button"
              onClick={downloadCsvTemplate}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-interactive hover:text-interactive-hover"
            >
              <Download size={14} aria-hidden="true" />
              Download CSV template
            </button>
          </div>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={cn(
          'flex flex-col items-center justify-center gap-4 rounded-md border-2 border-dashed p-12 transition-colors',
          dragOver
            ? 'border-interactive bg-interactive/5'
            : 'border-border-default bg-surface-card',
          isLoading && 'pointer-events-none opacity-60',
        )}
      >
        {isLoading ? (
          <>
            <Loader2 size={32} className="animate-spin text-interactive" aria-hidden="true" />
            <p className="text-sm text-content-secondary">
              Validating {fileName}...
            </p>
          </>
        ) : (
          <>
            <Upload size={32} className="text-content-secondary" aria-hidden="true" />
            <div className="text-center">
              <p className="text-sm font-medium text-content">
                Drag and drop your CSV file here
              </p>
              <p className="mt-1 text-sm text-content-secondary">or</p>
            </div>
            <label className="cursor-pointer">
              <span className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover md:min-h-[36px]">
                Browse Files
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={onFileChange}
                className="sr-only"
              />
            </label>
          </>
        )}
      </div>

      {error && (
        <AlertBanner
          status="danger"
          title="Validation failed"
          description={error}
        />
      )}
    </div>
  );
}

/* ─────── Preview Step ─────── */

interface PreviewStepProps {
  preview: DryRunRow[];
  errors: CsvError[];
  validCount: number;
  errorCount: number;
  errorRowNumbers: Set<number>;
  onImport: () => void;
  onCancel: () => void;
}

function PreviewStep({
  preview,
  errors,
  validCount,
  errorCount,
  errorRowNumbers,
  onImport,
  onCancel,
}: PreviewStepProps) {
  // Build a map of row number to error messages
  const errorsByRow = new Map<number, string[]>();
  for (const err of errors) {
    const existing = errorsByRow.get(err.rowNumber) ?? [];
    existing.push(err.message);
    errorsByRow.set(err.rowNumber, existing);
  }

  // Merge valid rows and error rows into a unified display list
  const allDisplayRows: Array<{
    rowNumber: number;
    name: string;
    email: string;
    role: string;
    unitNumber: string;
    status: 'valid' | 'error';
    errors: string[];
  }> = [];

  // Valid rows from the preview
  for (let i = 0; i < preview.length; i++) {
    const row = preview[i]!;
    allDisplayRows.push({
      rowNumber: i + 2, // CSV row 2+ (row 1 is header)
      name: row.name,
      email: row.email,
      role: row.role,
      unitNumber: row.unit_number ?? '',
      status: 'valid',
      errors: [],
    });
  }

  // Error rows (they are not in the preview array)
  for (const [rowNum, msgs] of errorsByRow) {
    // Only add if not already in the display
    if (!allDisplayRows.some((r) => r.rowNumber === rowNum)) {
      allDisplayRows.push({
        rowNumber: rowNum,
        name: '-',
        email: '-',
        role: '-',
        unitNumber: '-',
        status: 'error',
        errors: msgs,
      });
    }
  }

  allDisplayRows.sort((a, b) => a.rowNumber - b.rowNumber);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-status-success" aria-hidden="true" />
          <span className="text-sm font-medium text-content">
            {validCount} ready to import
          </span>
        </div>
        {errorCount > 0 && (
          <div className="flex items-center gap-2">
            <XCircle size={16} className="text-status-danger" aria-hidden="true" />
            <span className="text-sm font-medium text-content">
              {errorCount} {errorCount === 1 ? 'error' : 'errors'}
            </span>
          </div>
        )}
      </div>

      {/* Preview table */}
      <div className="overflow-x-auto rounded-md border border-border-default">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-default bg-surface-muted">
              <th className="h-10 px-3 text-left text-xs font-medium uppercase tracking-wider text-content-secondary">
                Status
              </th>
              <th className="h-10 px-3 text-left text-xs font-medium uppercase tracking-wider text-content-secondary">
                Row
              </th>
              <th className="h-10 px-3 text-left text-xs font-medium uppercase tracking-wider text-content-secondary">
                Name
              </th>
              <th className="h-10 px-3 text-left text-xs font-medium uppercase tracking-wider text-content-secondary">
                Email
              </th>
              <th className="h-10 px-3 text-left text-xs font-medium uppercase tracking-wider text-content-secondary">
                Role
              </th>
              <th className="h-10 px-3 text-left text-xs font-medium uppercase tracking-wider text-content-secondary">
                Unit
              </th>
            </tr>
          </thead>
          <tbody>
            {allDisplayRows.map((row) => (
              <tr
                key={row.rowNumber}
                className={cn(
                  'h-[52px] border-b border-border-default last:border-b-0',
                  row.status === 'error' && 'bg-status-danger/5',
                )}
              >
                <td className="px-3">
                  {row.status === 'valid' ? (
                    <CheckCircle2 size={16} className="text-status-success" aria-hidden="true" />
                  ) : (
                    <span title={row.errors.join('; ')}>
                      <XCircle size={16} className="text-status-danger" aria-hidden="true" />
                    </span>
                  )}
                </td>
                <td className="px-3 text-sm text-content-secondary">{row.rowNumber}</td>
                <td className="px-3 text-sm text-content">{row.name}</td>
                <td className="px-3 text-sm text-content">{row.email}</td>
                <td className="px-3 text-sm text-content">{row.role}</td>
                <td className="px-3 text-sm text-content">{row.unitNumber || '-'}</td>
              </tr>
            ))}
            {allDisplayRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-content-secondary">
                  No rows found in the CSV file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Error details */}
      {errors.length > 0 && (
        <div className="rounded-md border border-border-default bg-surface-card p-4">
          <div className="flex items-center gap-2 pb-3">
            <AlertTriangle size={16} className="text-status-warning" aria-hidden="true" />
            <span className="text-sm font-medium text-content">Row errors</span>
          </div>
          <ul className="space-y-1">
            {errors.map((err, i) => (
              <li key={i} className="text-sm text-content-secondary">
                Row {err.rowNumber}{err.column ? ` (${err.column})` : ''}: {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onImport}
          disabled={validCount === 0}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-50 md:min-h-[36px]"
        >
          Import {validCount} {validCount === 1 ? 'Resident' : 'Residents'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border-default bg-surface-card px-4 py-2 text-sm font-medium text-content hover:bg-surface-muted md:min-h-[36px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─────── Results Step ─────── */

interface ResultsStepProps {
  result: ImportResponse['data'];
  communityId: number;
  onImportMore: () => void;
}

function ResultsStep({ result, communityId, onImportMore }: ResultsStepProps) {
  return (
    <div className="space-y-6">
      {/* Success summary */}
      {result.importedCount > 0 && (
        <AlertBanner
          status="success"
          title={`${result.importedCount} ${result.importedCount === 1 ? 'resident' : 'residents'} imported successfully`}
        />
      )}

      {/* Errors */}
      {result.errors.length > 0 && (
        <AlertBanner
          status="warning"
          title={`${result.skippedCount} ${result.skippedCount === 1 ? 'row' : 'rows'} skipped`}
          description="Some rows could not be imported. See details below."
        />
      )}

      {result.errors.length > 0 && (
        <div className="rounded-md border border-border-default bg-surface-card p-4">
          <ul className="space-y-1">
            {result.errors.map((err, i) => (
              <li key={i} className="text-sm text-content-secondary">
                Row {err.rowNumber}{err.column ? ` (${err.column})` : ''}: {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No results at all */}
      {result.importedCount === 0 && result.errors.length === 0 && (
        <AlertBanner
          status="info"
          title="No residents were imported"
          description="The CSV file did not contain any valid rows to import."
        />
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/residents?communityId=${communityId}`}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover md:min-h-[36px]"
        >
          View Residents
        </Link>
        <button
          type="button"
          onClick={onImportMore}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border-default bg-surface-card px-4 py-2 text-sm font-medium text-content hover:bg-surface-muted md:min-h-[36px]"
        >
          Import More
        </button>
      </div>
    </div>
  );
}
