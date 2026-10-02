'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { Download, Upload } from 'lucide-react';
import { AlertBanner } from '@/components/shared/alert-banner';
import { PageHeader } from '@/components/shared/page-header';
import { Table } from '@/components/ui/table';
import { useImportUnits, type ImportUnitsResponse } from '@/hooks/use-import-units';
import { directoryHref } from '@/lib/directory/directory-href';
import { saveCsvFile } from '@/lib/utils/save-csv-file';
import { UNIT_CSV_TEMPLATE, UNIT_IMPORT_MAX_ROWS } from '@/lib/utils/unit-csv-validator';
import { cn } from '@/lib/utils';

const OCCUPANCY_LABEL: Record<string, string> = { owner_occupied: 'Owner-occupied', rented: 'Rented', vacant: 'Vacant' };
const BUTTON =
  'inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:min-h-9';

/**
 * Import units from a CSV: choose a file → preview (nothing written yet, and
 * numbers already in the community are flagged) → import the valid rows →
 * results. Same shape as the resident import.
 */
export function ImportUnitsClient({ communityId }: { communityId: number }) {
  const importer = useImportUnits(communityId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportUnitsResponse | null>(null);
  const [result, setResult] = useState<ImportUnitsResponse | null>(null);

  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setResult(null);
    setPreview(await importer.mutateAsync({ csv: text, dryRun: true }).catch(() => null));
  }

  async function runImport() {
    const res = await importer.mutateAsync({ csv, dryRun: false }).catch(() => null);
    if (res) {
      setResult(res);
      setPreview(null);
    }
  }

  function startOver() {
    setCsv('');
    setFileName('');
    setPreview(null);
    setResult(null);
    importer.reset();
    if (fileRef.current) fileRef.current.value = '';
  }

  const shown = result ?? preview;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Import units" />

      {!shown ? (
        <section className="flex flex-col gap-4 rounded-lg border border-edge bg-surface-card p-6">
          <p className="text-sm text-content-secondary">
            Add up to {UNIT_IMPORT_MAX_ROWS.toLocaleString('en-US')} units from a spreadsheet, one row per unit. <code className="rounded bg-surface-muted px-1">unit_number</code> is required; building,
            floor, bedrooms, bathrooms, sq ft and occupancy (owner_occupied, rented or vacant) are optional. Rent comes
            from each unit&apos;s lease, so it is not imported.
          </p>
          <div className="flex flex-wrap gap-3">
            <label className={cn(BUTTON, 'cursor-pointer bg-interactive text-content-inverse hover:bg-interactive-hover focus-within:ring-2 focus-within:ring-focus')}>
              <Upload size={16} aria-hidden="true" />
              {importer.isPending ? 'Checking…' : 'Choose CSV file'}
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void choose(e)} disabled={importer.isPending} />
            </label>
            <button
              type="button"
              onClick={() => saveCsvFile(UNIT_CSV_TEMPLATE, 'unit-import-template.csv')}
              className={cn(BUTTON, 'border border-edge bg-surface-card text-content hover:bg-surface-hover')}
            >
              <Download size={16} aria-hidden="true" />
              Download template
            </button>
          </div>
          {fileName ? <p className="text-xs text-content-tertiary">{fileName}</p> : null}
        </section>
      ) : null}

      {importer.error ? (
        <AlertBanner status="danger" title="Couldn't read that file" description={importer.error.message} />
      ) : null}

      {shown ? (
        <section aria-live="polite" className="flex flex-col gap-4">
          {result ? (
            <AlertBanner
              status={result.importedCount > 0 ? 'success' : 'warning'}
              title={`${result.importedCount} ${result.importedCount === 1 ? 'unit' : 'units'} imported`}
              description={result.skippedCount > 0 ? `${result.skippedCount} skipped — see below.` : undefined}
            />
          ) : (
            <p className="text-sm text-content">
              <strong>{shown.units.length}</strong> {shown.units.length === 1 ? 'unit' : 'units'} ready to import
              {shown.skippedCount > 0 ? `, ${shown.skippedCount} with problems` : ''}. Nothing has been saved yet.
            </p>
          )}

          {shown.errors.length > 0 ? (
            <div className="rounded-md border border-status-warning-border bg-status-warning-bg p-4">
              <h2 className="text-sm font-semibold text-status-warning">Problems</h2>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-content">
                {shown.errors.map((e, i) => (
                  <li key={`${e.rowNumber}-${e.column}-${i}`}>
                    {e.rowNumber > 1 ? `Row ${e.rowNumber}: ` : ''}
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {shown.units.length > 0 ? (
            <div className="rounded-md border border-edge">
              <Table className="w-full text-left text-sm">
                <caption className="sr-only">{result ? 'Imported units' : 'Units to import'}</caption>
                <thead className="bg-surface-subtle text-xs font-semibold uppercase tracking-wide text-content-tertiary">
                  <tr>
                    {['Unit', 'Building', 'Floor', 'Beds', 'Baths', 'Sq ft', 'Occupancy'].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge-subtle">
                  {shown.units.map((u) => (
                    <tr key={u.rowNumber}>
                      <td className="px-3 py-2 font-medium">{u.unitNumber}</td>
                      <td className="px-3 py-2">{u.building ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{u.floor ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{u.bedrooms ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{u.bathrooms ?? '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{u.sqft ?? '—'}</td>
                      <td className="px-3 py-2">{u.occupancy ? OCCUPANCY_LABEL[u.occupancy] : 'Not set'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            {result ? (
              <Link href={directoryHref('units', { communityId })} className={cn(BUTTON, 'bg-interactive text-content-inverse hover:bg-interactive-hover')}>
                View units
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void runImport()}
                disabled={importer.isPending || shown.units.length === 0}
                className={cn(BUTTON, 'bg-interactive text-content-inverse hover:bg-interactive-hover disabled:opacity-60')}
              >
                {importer.isPending ? 'Importing…' : `Import ${shown.units.length} ${shown.units.length === 1 ? 'unit' : 'units'}`}
              </button>
            )}
            <button type="button" onClick={startOver} disabled={importer.isPending} className={cn(BUTTON, 'border border-edge bg-surface-card text-content hover:bg-surface-hover')}>
              {result ? 'Import another file' : 'Choose a different file'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
