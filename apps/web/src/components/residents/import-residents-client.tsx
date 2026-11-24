'use client';

/**
 * Import residents from a CSV, on the page kit: upload, review (a dry run,
 * nothing saved), import, done. The step strip under the header says where
 * the import stands; each step is one Section with its actions in the footer.
 * The header has Cancel only, back to the Directory.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Upload, Download, FileSpreadsheet, Loader2, Users } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { Section, SectionFooter, SectionHeader } from '@propertypro/ui/components/shared/section';
import { StatusGlyph, type StatusGlyphKind } from '@propertypro/ui/components/shared/status-glyph';
import { StepStrip } from '@propertypro/ui/components/shared/step-strip';
import { cn } from '@/lib/utils';
import { AlertBanner } from '@/components/shared/alert-banner';
import { PageHeader } from '@/components/shared/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useDryRunImport,
  useImportResidents,
  type ImportRequestError,
  type DryRunRow,
  type CsvError,
  type DryRunResponse,
  type ImportResponse,
} from '@/hooks/use-import-residents';
import { directoryHref } from '@/lib/directory/directory-href';
import {
  buildImportDisplayRows,
  buildRowsToFixCsv,
  countAlreadyMembers,
  countRowsWithErrors,
  fileLevelErrors,
  rowsToFixFileName,
  type ImportDisplayRow,
} from '@/lib/utils/resident-import-rows';
import { saveCsvFile } from '@/lib/utils/save-csv-file';

/* ─────── Types ─────── */

// Re-exported so existing import sites of these types keep working.
export type { DryRunRow, CsvError, DryRunResponse, ImportResponse };

interface ImportResidentsClientProps {
  communityId: number;
}

type WizardStep = 'upload' | 'preview' | 'importing' | 'results';

/** The step strip, in the order of `WizardStep`. */
const STEP_NAMES = ['Upload', 'Review', 'Import', 'Done'];
const STEP_INDEX: Record<WizardStep, number> = { upload: 0, preview: 1, importing: 2, results: 3 };

/** Padding for content that sits in a Section outside its header, table and footer. */
const BODY = 'space-y-4 px-4 py-4';

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
  const [dropError, setDropError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);

  const dryRunMutation = useDryRunImport(communityId);
  const importMutation = useImportResidents(communityId);

  const handleFileRead = useCallback((file: File) => {
    setDropError(null);
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
    if (!file) return;
    if (file.name.toLowerCase().endsWith('.csv')) {
      handleFileRead(file);
    } else {
      // Dropping anything else used to do nothing at all.
      setDropError(`${file.name} is not a CSV file. Save the spreadsheet as CSV and try again.`);
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

  // After an import request fails part-way: every row it saved is complete
  // (one transaction per row), so re-checking the same file shows exactly
  // what is left — saved rows come back as already members. The import's
  // error is cleared only once the re-check has succeeded: clearing it first
  // would put the "Importing residents..." spinner back up, and a failed
  // re-check would then have nowhere to show.
  const handleCheckWhatsLeft = useCallback(() => {
    dryRunMutation.mutate(csvText, {
      onSuccess: (data) => {
        importMutation.reset();
        setDryRunData(data.data);
        setStep('preview');
      },
    });
  }, [importMutation, dryRunMutation, csvText]);

  // A refusal (4xx) happens before any row is written; go back to the preview.
  const handleBackToPreview = useCallback(() => {
    importMutation.reset();
    setStep('preview');
  }, [importMutation]);

  const importError = importMutation.error instanceof Error ? importMutation.error : null;
  const importStatus = (importError as ImportRequestError | null)?.status ?? null;
  // No response, or a server error: some rows may have been saved.
  const mayHavePartlyImported = importError !== null && (importStatus === null || importStatus >= 500);

  // Each step replaces the last, so focus would fall to the page and a screen
  // reader would hear nothing. Move focus to the new step and say what
  // happened in one persistent live region (a region mounted together with its
  // text is often not announced). Errors announce themselves via AlertBanner.
  // Keyed on the previous view, not a first-render flag, so React's dev
  // effect replay cannot steal focus on load. Checking a file counts: the
  // upload controls unmount while it runs.
  const view = `${step}:${dryRunMutation.isPending}`;
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current === view) return;
    previousView.current = view;
    stepRef.current?.focus();
  }, [view]);
  const announcement =
    step === 'upload' && dryRunMutation.isPending
      ? `Checking ${fileName}.`
      : step === 'preview' && dryRunData && fileLevelErrors(dryRunData.errors).length > 0
        ? "This file can't be imported as it is."
        : step === 'preview' && dryRunData
        ? `Preview ready: ${dryRunData.preview.length} ready to import, ${countRowsWithErrors(dryRunData.errors)} to fix.`
        : step === 'importing' && !importError
          ? 'Importing residents.'
          : step === 'results' && importResult
            ? `Import finished: ${importResult.importedCount} imported, ${importResult.skippedCount} skipped.`
            : '';


  return (
    <PageLayout
      template="form"
      header={
        <PageHeader
          title="Import Residents"
          icon={<Users />}
          description="Add many residents at once from a spreadsheet saved as a CSV file."
          actions={
            <Button asChild variant="outline">
              <Link href={directoryHref('residents', { communityId })}>Cancel</Link>
            </Button>
          }
        />
      }
      tabs={<StepStrip steps={STEP_NAMES} current={STEP_INDEX[step]} label="Import steps" />}
    >
      <p role="status" className="sr-only">{announcement}</p>

      <div ref={stepRef} tabIndex={-1} role="group" aria-label="Import step" className="space-y-5">

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <UploadStep
          dragOver={dragOver}
          isLoading={dryRunMutation.isPending}
          error={dropError ?? (dryRunMutation.error instanceof Error ? dryRunMutation.error.message : null)}
          fileName={fileName}
          fileInputRef={fileInputRef}
          onFileChange={handleFileChange}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        />
      )}

      {/* Step 2: Review */}
      {step === 'preview' && dryRunData && (
        <PreviewStep
          csvText={csvText}
          fileName={fileName}
          preview={dryRunData.preview}
          errors={dryRunData.errors}
          onImport={handleImport}
          onBack={resetWizard}
        />
      )}

      {/* Step 3: Import */}
      {step === 'importing' && !importError && (
        <Section>
          <div className="flex flex-col items-center gap-4 px-4 py-16">
            <Loader2 className="size-10 animate-spin text-interactive" aria-hidden="true" />
            <p className="text-sm text-content-secondary">Importing residents...</p>
          </div>
        </Section>
      )}
      {step === 'importing' && importError && !mayHavePartlyImported && (
        <Section>
          <div className={BODY}>
            <AlertBanner
              status="danger"
              title="The import didn't start"
              description={`${importError.message.replace(/\.$/, '')}. Nothing was imported.`}
            />
          </div>
          <SectionFooter>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={resetWizard}>
                Start over
              </Button>
              <Button type="button" onClick={handleBackToPreview}>
                Back to preview
              </Button>
            </div>
          </SectionFooter>
        </Section>
      )}
      {step === 'importing' && importError && mayHavePartlyImported && (
        <Section>
          <div className={BODY}>
            <AlertBanner
              status="danger"
              title="The import stopped before finishing"
              description={`${importError.message.replace(/\.$/, '')}. Every row that was saved is complete, and nothing is half-saved. Check the file again to see which rows are left.`}
            />
            {dryRunMutation.error instanceof Error && (
              <AlertBanner
                status="warning"
                title="We couldn't check the file again"
                description={dryRunMutation.error.message}
              />
            )}
          </div>
          <SectionFooter>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={resetWizard}>
                Start over
              </Button>
              <Button type="button" onClick={handleCheckWhatsLeft} disabled={dryRunMutation.isPending}>
                {dryRunMutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                {dryRunMutation.isPending ? 'Checking...' : "Check what's left"}
              </Button>
            </div>
          </SectionFooter>
        </Section>
      )}

      {/* Step 4: Done */}
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
    </PageLayout>
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
    <Section>
      <SectionHeader title="Choose a CSV file" />
      <div className={BODY}>
        {/* Instructions */}
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-content-secondary" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-content">
              Upload a CSV with columns: name, email, role, unit_number
            </p>
            <p className="text-sm text-content-secondary">
              Valid roles: owner, tenant. Every row needs a unit_number.
              Board and manager access is assigned from Roles &amp; Access after import.
            </p>
            <Button type="button" variant="link" onClick={downloadCsvTemplate} className="px-0">
              <Download aria-hidden="true" />
              Download CSV template
            </Button>
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
              : 'border-edge-control bg-surface-card',
            isLoading && 'pointer-events-none opacity-60',
          )}
        >
          {isLoading ? (
            <>
              <Loader2 className="size-8 animate-spin text-interactive" aria-hidden="true" />
              <p className="text-sm text-content-secondary">
                Validating {fileName}...
              </p>
            </>
          ) : (
            <>
              <Upload className="size-8 text-content-secondary" aria-hidden="true" />
              <div className="text-center">
                <p className="text-sm font-medium text-content">
                  Drag and drop your CSV file here
                </p>
                <p className="mt-1 text-sm text-content-secondary">or</p>
              </div>
              {/* The file input is visually hidden; show its keyboard focus on the button it sits in. */}
              <label className="cursor-pointer rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-offset-2">
                <span className={buttonVariants()}>Browse Files</span>
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
    </Section>
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
    <Button
      type="button"
      variant="outline"
      onClick={() => saveCsvFile(buildRowsToFixCsv(csvText, errors), rowsToFixFileName(fileName))}
    >
      <Download aria-hidden="true" />
      Download rows to fix
    </Button>
  );
}

/* ─────── Preview Step ─────── */

const ROW_STATUS: Record<ImportDisplayRow['status'], { kind: StatusGlyphKind; word: string }> = {
  ready: { kind: 'done', word: 'Ready' },
  member: { kind: 'not-started', word: 'Member' },
  error: { kind: 'overdue', word: 'Fix' },
};

function rowDetails(row: ImportDisplayRow): string {
  if (row.status === 'error') return row.problems.join('; ') || 'Not imported';
  if (row.status === 'member') return 'Already in this community — nothing to import';
  return row.existingAccount ? 'Existing account — will be added to this community' : 'New account';
}

// Five columns (owner decision, 2026-11-24): the line number sits under the
// status and the email under the name. The table is `table-fixed`, so it can
// never be wider than its Section: Status, Role and Unit have set widths,
// Details takes two fifths and wraps, and Resident takes the rest and
// truncates. In a box under 720px (`cq-md`) only Status and Resident are
// columns, and the Resident cell carries role, unit and details beneath.
const WIDE = 'hidden cq-md:table-cell';

interface PreviewStepProps {
  csvText: string;
  fileName: string;
  preview: DryRunRow[];
  errors: CsvError[];
  onImport: () => void;
  onBack: () => void;
}

function PreviewStep({ csvText, fileName, preview, errors, onImport, onBack }: PreviewStepProps) {
  // Every line of the uploaded file, on its own line number, with the values
  // as typed — ready and rejected alike.
  const rows = buildImportDisplayRows(csvText, preview, errors);
  const fileErrors = fileLevelErrors(errors);
  const readyCount = preview.length;
  const fixCount = countRowsWithErrors(errors);
  const memberCount = countAlreadyMembers(errors);
  // A file-level problem (a missing column, too many rows) blocks the whole
  // file; listing every line under it would only repeat the banner.
  const showRows = fileErrors.length === 0;

  return (
    <Section className="cq">
      <SectionHeader title="Review the file" description={fileName || undefined} />

      {fileErrors.length > 0 && (
        <div className={BODY}>
          <AlertBanner
            status="danger"
            title="This file can't be imported as it is"
            description={fileErrors.map((e) => e.message).join('. ')}
          />
        </div>
      )}

      {showRows && (
        <>
          {/* Summary — counts are rows, not messages */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-edge px-4 py-3">
            <StatusGlyph kind="done" label={`${readyCount} ready to import`} />
            {memberCount > 0 && (
              <StatusGlyph
                kind="not-started"
                label={`${memberCount} already ${memberCount === 1 ? 'a member' : 'members'}`}
              />
            )}
            {fixCount > 0 && (
              <StatusGlyph
                kind="overdue"
                label={`${fixCount} ${fixCount === 1 ? 'row needs' : 'rows need'} fixing`}
              />
            )}
          </div>

          {fixCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-4 py-3">
              <p className="min-w-0 flex-1 basis-64 text-sm text-content-secondary">
                Rows that need fixing are left out of the import. Download them, correct them, and upload
                that file afterwards. Each row keeps its line number from your file.
              </p>
              <DownloadRowsToFix csvText={csvText} fileName={fileName} errors={errors} />
            </div>
          )}

          <Table aria-label="Rows in the file" className="table-fixed">
            <TableHeader className="bg-surface-subtle">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-28">Status</TableHead>
                <TableHead>Resident</TableHead>
                <TableHead className={cn(WIDE, 'w-24')}>Role</TableHead>
                <TableHead className={cn(WIDE, 'w-20')}>Unit</TableHead>
                <TableHead className={cn(WIDE, 'w-2/5')}>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const status = ROW_STATUS[row.status];
                const details = rowDetails(row);
                const roleAndUnit = [row.role, row.unitNumber ? `Unit ${row.unitNumber}` : '']
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <TableRow
                    key={row.rowNumber}
                    data-row-status={row.status}
                    className={cn(row.status === 'error' && 'bg-status-danger-bg hover:bg-status-danger-bg')}
                  >
                    <TableCell className="align-top">
                      <StatusGlyph kind={status.kind} label={status.word} />
                      <span data-line className="block text-sm text-content-secondary">
                        Line {row.rowNumber}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <span data-name className="block truncate font-medium text-content">
                        {row.name || '-'}
                      </span>
                      <span data-email className="block truncate text-sm text-content-secondary">
                        {row.email || '-'}
                      </span>
                      {/* Narrow boxes only: what the three hidden columns say. */}
                      <span data-narrow className="block text-sm text-content-secondary cq-md:hidden">
                        {roleAndUnit ? <span className="block truncate">{roleAndUnit}</span> : null}
                        <span className="block break-words">{details}</span>
                      </span>
                    </TableCell>
                    <TableCell className={cn(WIDE, 'truncate align-top')}>{row.role || '-'}</TableCell>
                    <TableCell className={cn(WIDE, 'truncate align-top')}>{row.unitNumber || '-'}</TableCell>
                    <TableCell className={cn(WIDE, 'break-words align-top text-sm text-content-secondary')}>
                      {details}
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-content-secondary">
                    No rows found in the CSV file.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </>
      )}

      <SectionFooter>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button type="button" onClick={onImport} disabled={readyCount === 0}>
            Import {readyCount} {readyCount === 1 ? 'Resident' : 'Residents'}
          </Button>
        </div>
      </SectionFooter>
    </Section>
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
    <Section>
      <SectionHeader title="Import finished" />
      <div className={BODY}>
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
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-content">Skipped rows</h3>
              {countRowsWithErrors(result.errors) > 0 && (
                <DownloadRowsToFix csvText={csvText} fileName={fileName} errors={result.errors} />
              )}
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
      </div>

      <SectionFooter>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onImportMore}>
            Import More
          </Button>
          <Button asChild>
            <Link href={directoryHref('residents', { communityId })}>View Residents</Link>
          </Button>
        </div>
      </SectionFooter>
    </Section>
  );
}
