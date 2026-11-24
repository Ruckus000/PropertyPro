'use client';

/**
 * Import units from a CSV, on the page kit: choose a file, review (a dry run:
 * nothing written yet, and numbers already in the community are flagged), then
 * import the valid rows and see what was added. The step strip under the
 * header says where the import stands; each step is one Section with its
 * actions in the footer. The header has Cancel only, back to the Directory.
 */
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { Building2, Download, Upload } from 'lucide-react';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import { Section, SectionFooter, SectionHeader } from '@propertypro/ui/components/shared/section';
import { StepStrip } from '@propertypro/ui/components/shared/step-strip';
import { AlertBanner } from '@/components/shared/alert-banner';
import { PageHeader } from '@/components/shared/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useImportUnits, type ImportUnitsResponse } from '@/hooks/use-import-units';
import { directoryHref } from '@/lib/directory/directory-href';
import { saveCsvFile } from '@/lib/utils/save-csv-file';
import { UNIT_CSV_TEMPLATE, UNIT_IMPORT_MAX_ROWS } from '@/lib/utils/unit-csv-validator';
import { cn } from '@/lib/utils';

const OCCUPANCY_LABEL: Record<string, string> = { owner_occupied: 'Owner-occupied', rented: 'Rented', vacant: 'Vacant' };

const STEP_NAMES = ['Choose file', 'Review', 'Done'];

/** Padding for content that sits in a Section outside its header, table and footer. */
const BODY = 'space-y-4 px-4 py-4';

/** Form width (the cap the announcement form uses). The review step, with its table, takes the full width. */
const FORM_WIDTH = 'w-full max-w-4xl';

// Five columns (owner decision, 2026-11-24): building and floor sit under the
// unit number. Unit takes the spare width (`w-full` header, `max-w-0` cells)
// and wraps: people check their file here, so no value is ever cut. The other
// columns are as wide as their content. In a box under 480px (`cq-sm`) Beds,
// Baths and Sq ft move under the unit number too.
const FIT = 'whitespace-nowrap';
const WIDE = 'hidden cq-sm:table-cell';

type ImportedUnit = ImportUnitsResponse['units'][number];

function placeLine(u: ImportedUnit): string {
  return [u.building ? `Building ${u.building}` : '', u.floor != null ? `Floor ${u.floor}` : '']
    .filter(Boolean)
    .join(' · ');
}

function sizeLine(u: ImportedUnit): string {
  return [
    u.bedrooms != null ? `${u.bedrooms} bd` : '',
    u.bathrooms != null ? `${u.bathrooms} ba` : '',
    u.sqft != null ? `${u.sqft} sq ft` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function ImportUnitsClient({ communityId }: { communityId: number }) {
  const importer = useImportUnits(communityId);
  const fileRef = useRef<HTMLInputElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
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
  const stepIndex = result ? 2 : preview ? 1 : 0;

  // Each step replaces the last, so focus would fall to the page. Move it to
  // the new step. Keyed on the previous step, not a first-render flag, so
  // React's dev effect replay cannot take focus on load (the resident import
  // does the same).
  const previousStep = useRef(stepIndex);
  useEffect(() => {
    if (previousStep.current === stepIndex) return;
    previousStep.current = stepIndex;
    stepRef.current?.focus();
  }, [stepIndex]);

  const unitCount = shown ? shown.units.length : 0;
  const unitWord = unitCount === 1 ? 'unit' : 'units';

  return (
    <PageLayout
      template="form"
      header={
        <PageHeader
          title="Import units"
          icon={<Building2 />}
          description="Add many units at once from a spreadsheet saved as a CSV file."
          actions={
            <Button asChild variant="outline">
              <Link href={directoryHref('units', { communityId })}>Cancel</Link>
            </Button>
          }
        />
      }
      tabs={<StepStrip steps={STEP_NAMES} current={stepIndex} label="Import steps" />}
    >
      <div ref={stepRef} tabIndex={-1} role="group" aria-label="Import step" className="space-y-5">
        {!shown ? (
          <Section className={FORM_WIDTH}>
            <SectionHeader title="Choose a CSV file" />
            <div className={BODY}>
              <p className="text-sm text-content-secondary">
                Add up to {UNIT_IMPORT_MAX_ROWS.toLocaleString('en-US')} units from a spreadsheet, one row per unit. <code className="rounded bg-surface-muted px-1">unit_number</code> is required; building,
                floor, bedrooms, bathrooms, sq ft and occupancy (owner_occupied, rented or vacant) are optional. Rent comes
                from each unit&apos;s lease, so it is not imported.
              </p>
              <div className="flex flex-wrap gap-3">
                {/* The file input is visually hidden; show its keyboard focus on the button it sits in. */}
                <label className={cn(buttonVariants(), 'cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-offset-2')}>
                  <Upload aria-hidden="true" />
                  {importer.isPending ? 'Checking…' : 'Choose CSV file'}
                  <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void choose(e)} disabled={importer.isPending} />
                </label>
                <Button type="button" variant="outline" onClick={() => saveCsvFile(UNIT_CSV_TEMPLATE, 'unit-import-template.csv')}>
                  <Download aria-hidden="true" />
                  Download template
                </Button>
              </div>
              {fileName ? <p className="text-xs text-content-secondary">{fileName}</p> : null}
            </div>
          </Section>
        ) : null}

        {importer.error ? (
          <AlertBanner className={FORM_WIDTH} status="danger" title="Couldn't read that file" description={importer.error.message} />
        ) : null}

        {shown ? (
          <Section className={cn('cq', result && FORM_WIDTH)} aria-live="polite">
            <SectionHeader title={result ? 'Import finished' : 'Review the file'} description={fileName || undefined} />
            <div className={BODY}>
              {result ? (
                <AlertBanner
                  status={result.importedCount > 0 ? 'success' : 'warning'}
                  title={`${result.importedCount} ${result.importedCount === 1 ? 'unit' : 'units'} imported`}
                  description={result.skippedCount > 0 ? `${result.skippedCount} skipped — see below.` : undefined}
                />
              ) : (
                <p className="text-sm text-content">
                  <strong>{unitCount}</strong> {unitWord} ready to import
                  {shown.skippedCount > 0 ? `, ${shown.skippedCount} with problems` : ''}. Nothing has been saved yet.
                </p>
              )}

              {shown.errors.length > 0 ? (
                <div className="rounded-md border border-status-warning-border bg-status-warning-bg p-4">
                  <h3 className="text-sm font-semibold text-status-warning">Problems</h3>
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
            </div>

            {unitCount > 0 ? (
              <Table aria-label={result ? 'Imported units' : 'Units to import'} wrapperClassName="border-t border-edge">
                <TableHeader className="bg-surface-subtle">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-full">Unit</TableHead>
                    <TableHead className={cn(WIDE, FIT, 'text-right')}>Beds</TableHead>
                    <TableHead className={cn(WIDE, FIT, 'text-right')}>Baths</TableHead>
                    <TableHead className={cn(WIDE, FIT, 'text-right')}>Sq ft</TableHead>
                    <TableHead className={FIT}>Occupancy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.units.map((u) => {
                    const place = placeLine(u);
                    const size = sizeLine(u);
                    return (
                      <TableRow key={u.rowNumber}>
                        <TableCell className="max-w-0">
                          <span data-unit className="block break-words font-medium text-content">{u.unitNumber}</span>
                          {place ? (
                            <span data-place className="block break-words text-sm text-content-secondary">{place}</span>
                          ) : null}
                          {/* Narrow boxes only: what the three hidden columns say. */}
                          {size ? (
                            <span data-narrow className="block break-words text-sm text-content-secondary cq-sm:hidden">{size}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className={cn(WIDE, FIT, 'text-right')}>{u.bedrooms ?? '—'}</TableCell>
                        <TableCell className={cn(WIDE, FIT, 'text-right')}>{u.bathrooms ?? '—'}</TableCell>
                        <TableCell className={cn(WIDE, FIT, 'text-right')}>{u.sqft ?? '—'}</TableCell>
                        <TableCell className={FIT}>{u.occupancy ? OCCUPANCY_LABEL[u.occupancy] : 'Not set'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : null}

            <SectionFooter>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" onClick={startOver} disabled={importer.isPending}>
                  {result ? 'Import another file' : 'Back'}
                </Button>
                {result ? (
                  <Button asChild>
                    <Link href={directoryHref('units', { communityId })}>View units</Link>
                  </Button>
                ) : (
                  <Button type="button" onClick={() => void runImport()} disabled={importer.isPending || unitCount === 0}>
                    {importer.isPending ? 'Importing…' : `Import ${unitCount} ${unitWord}`}
                  </Button>
                )}
              </div>
            </SectionFooter>
          </Section>
        ) : null}
      </div>
    </PageLayout>
  );
}
