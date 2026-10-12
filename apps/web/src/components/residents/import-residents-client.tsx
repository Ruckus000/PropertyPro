'use client';

import { useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Upload,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AlertBanner } from '@/components/shared/alert-banner';
import { PageHeader } from '@/components/shared/page-header';
import {
  useDryRunImport,
  useImportResidents,
  type DryRunRow,
  type CsvError,
  type DryRunResponse,
  type ImportResponse,
} from '@/hooks/use-import-residents';
import { directoryHref } from '@/lib/directory/directory-href';
import {
  buildImportDisplayRows,
  buildRowsToFixCsv,
  countRowsWithErrors,
  fileLevelErrors,
  rowsToFixFileName,
} from '@/lib/utils/resident-import-rows';
import { saveCsvFile } from '@/lib/utils/save-csv-file';

/* ─────── Types ─────── */

// Re-exported so existing import sites of these types keep working.
export type { DryRunRow, CsvError, DryRunResponse, ImportResponse };

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

/* ─────── Component ─────── */

export function ImportResidentsClient({ communityId }: ImportResidentsClientProps) {
  const [step, setStep] = useState<WizardStep>('upload');
  const [csvText, setCsvText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [dryRunData, setDryRunData] = useState<DryRunResponse['data'] | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse['data'] | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dryRunMutation = useDryRunImport(communityId);
  const importMutation = useImportResidents(communityId);

  const handleFileRead = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setCsvText(text);
      dryRunMutation.mutate(text, {
        onSuccess: (data) => {
          setDryRunData(data.data);
          setStep('preview');
        },
      });
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
    importMutation.mutate(csvText, {
      onSuccess: (data) => {
        setImportResult(data.data);
        setStep('results');
      },
    });
  }, [importMutation, csvText]);


  return (
    <div className="space-y-6">
      <PageHeader
        title="Import Residents"
      />

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
          csvText={csvText}
          fileName={fileName}
          preview={dryRunData.preview}
          errors={dryRunData.errors}
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
          csvText={csvText}
          fileName={fileName}
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
      <div className="rounded-md border border-edge bg-surface-card p-5">
        <div className="flex items-start gap-3">
          <FileSpreadsheet size={20} className="mt-0.5 shrink-0 text-content-secondary" aria-hidden="true" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-content">
              Upload a CSV with columns: name, email, role, unit_number
            </p>
            <p className="text-sm text-content-secondary">
              Valid roles: owner, tenant. Every row needs a unit_number.
              Board and manager access is assigned from Roles &amp; Access after import.
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
            ? 'border-interactive bg-interactive-subtle'
            : 'border-edge bg-surface-card',
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

/* ─────── Rows to fix ─────── */

function DownloadRowsToFix({
  csvText,
  fileName,
  errors,
}: {
  csvText: string;
  fileName: string;
  errors: CsvError[];
}) {
  return (
    <button
      type="button"
      onClick={() => saveCsvFile(buildRowsToFixCsv(csvText, errors), rowsToFixFileName(fileName))}
      className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content hover:bg-surface-muted md:min-h-[36px]"
    >
      <Download size={14} aria-hidden="true" />
      Download rows to fix
    </button>
  );
}

/* ─────── Preview Step ─────── */

interface PreviewStepProps {
  csvText: string;
  fileName: string;
  preview: DryRunRow[];
  errors: CsvError[];
  onImport: () => void;
  onCancel: () => void;
}

function PreviewStep({ csvText, fileName, preview, errors, onImport, onCancel }: PreviewStepProps) {
  // Every line of the uploaded file, on its own line number, with the values
  // as typed — ready and rejected alike.
  const rows = buildImportDisplayRows(csvText, preview, errors);
  const fileErrors = fileLevelErrors(errors);
  const readyCount = preview.length;
  const fixCount = countRowsWithErrors(errors);
  // A file-level problem (a missing column, too many rows) blocks the whole
  // file; listing every line under it would only repeat the banner.
  const showRows = fileErrors.length === 0;

  return (
    <div className="space-y-6">
      {fileErrors.length > 0 && (
        <AlertBanner
          status="danger"
          title="This file can't be imported as it is"
          description={fileErrors.map((e) => e.message).join('. ')}
        />
      )}

      {showRows && (
        <>
          {/* Summary — counts are rows, not messages */}
          <div className="flex flex-wrap items-center gap-4" role="status">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-status-success" aria-hidden="true" />
              <span className="text-sm font-medium text-content">
                {readyCount} ready to import
              </span>
            </div>
            {fixCount > 0 && (
              <div className="flex items-center gap-2">
                <XCircle size={16} className="text-status-danger" aria-hidden="true" />
                <span className="text-sm font-medium text-content">
                  {fixCount} {fixCount === 1 ? 'row needs' : 'rows need'} fixing
                </span>
              </div>
            )}
          </div>

          {fixCount > 0 && (
            <p className="text-sm text-content-secondary">
              Rows that need fixing are left out of the import. Download them, correct them, and upload
              that file afterwards. Each row keeps its line number from your file.
            </p>
          )}

          {/* Preview table */}
          <div className="overflow-x-auto rounded-md border border-edge">
            <table className="w-full">
              <thead>
                <tr className="border-b border-edge bg-surface-muted">
                  {['Line', 'Status', 'Name', 'Email', 'Role', 'Unit', 'Details'].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="h-10 px-3 text-left text-xs font-medium uppercase tracking-wider text-content-secondary"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.rowNumber}
                    className={cn(
                      'h-[52px] border-b border-edge last:border-b-0',
                      row.status === 'error' && 'bg-status-danger-bg',
                    )}
                  >
                    <td className="px-3 text-sm text-content-secondary">{row.rowNumber}</td>
                    <td className="px-3">
                      {row.status === 'ready' ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-content">
                          <CheckCircle2 size={16} className="text-status-success" aria-hidden="true" />
                          Ready
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm text-content">
                          <XCircle size={16} className="text-status-danger" aria-hidden="true" />
                          Fix
                        </span>
                      )}
                    </td>
                    <td className="px-3 text-sm text-content">{row.name || '-'}</td>
                    <td className="px-3 text-sm text-content">{row.email || '-'}</td>
                    <td className="px-3 text-sm text-content">{row.role || '-'}</td>
                    <td className="px-3 text-sm text-content">{row.unitNumber || '-'}</td>
                    <td className="px-3 py-2 text-sm text-content-secondary">
                      {row.status === 'error'
                        ? row.problems.join('; ') || 'Not imported'
                        : row.existingAccount
                          ? 'Existing account — will be added to this community'
                          : 'New account'}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-sm text-content-secondary">
                      No rows found in the CSV file.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onImport}
          disabled={readyCount === 0}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-50 md:min-h-[36px]"
        >
          Import {readyCount} {readyCount === 1 ? 'Resident' : 'Residents'}
        </button>
        {showRows && fixCount > 0 && (
          <DownloadRowsToFix csvText={csvText} fileName={fileName} errors={errors} />
        )}
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content hover:bg-surface-muted md:min-h-[36px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─────── Results Step ─────── */

interface ResultsStepProps {
  csvText: string;
  fileName: string;
  result: ImportResponse['data'];
  communityId: number;
  onImportMore: () => void;
}

function ResultsStep({ csvText, fileName, result, communityId, onImportMore }: ResultsStepProps) {
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
        <div className="rounded-md border border-edge bg-surface-card p-4">
          <div className="flex items-center gap-2 pb-3">
            <AlertTriangle size={16} className="text-status-warning" aria-hidden="true" />
            <span className="text-sm font-medium text-content">Skipped rows</span>
          </div>
          <ul className="space-y-1">
            {result.errors.map((err, i) => (
              <li key={i} className="text-sm text-content-secondary">
                Line {err.rowNumber}{err.column ? ` (${err.column})` : ''}: {err.message}
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
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={directoryHref('residents', { communityId })}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover md:min-h-[36px]"
        >
          View Residents
        </Link>
        {countRowsWithErrors(result.errors) > 0 && (
          <DownloadRowsToFix csvText={csvText} fileName={fileName} errors={result.errors} />
        )}
        <button
          type="button"
          onClick={onImportMore}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-edge bg-surface-card px-4 py-2 text-sm font-medium text-content hover:bg-surface-muted md:min-h-[36px]"
        >
          Import More
        </button>
      </div>
    </div>
  );
}
