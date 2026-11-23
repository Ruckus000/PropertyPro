'use client';

/**
 * Report a violation on the page kit (preview only). One Section holds the
 * fields, a footer holds the one primary button. Behaviour matches
 * ViolationReportForm: same validation, same photo limits, photos uploaded in
 * order before the report is created. Success navigates to the list with the
 * new id; a failed upload leaves the form filled in.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TriangleAlert } from 'lucide-react';
import { z } from 'zod';
import type { ViolationSeverity } from '@propertypro/db';
import { PageLayout } from '@propertypro/ui/components/shared/page-layout';
import {
  Section,
  SectionHeader,
  SectionFooter,
  SectionFirstRun,
} from '@propertypro/ui/components/shared/section';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { createViolation } from '@/lib/api/violations';
import { uploadEvidencePhoto } from '@/lib/violations/evidence-upload';
import { operationsTabHref } from '@/lib/operations/routes';
import { SEVERITY_OPTIONS, VIOLATION_CATEGORIES } from '@/lib/violations/vocabulary';
import { ViolationUnitPicker, useViolationUnitOptions } from './ViolationUnitPicker';

const MAX_PHOTOS = 3;
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif';

const INPUT_CLASS =
  'w-full rounded-sm border border-edge-strong bg-surface-card px-3 py-2 text-sm text-content focus:border-edge-focus focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus';
const LABEL_CLASS = 'mb-1 block text-sm font-medium text-content-secondary';

const formSchema = z.object({
  // `error` covers the empty picker too: zod 4 reports undefined as an
  // invalid_type issue, which `.positive({ message })` never reaches.
  unitId: z.number({ error: 'Please select the unit the report is about' }).int().positive({ error: 'Please select the unit the report is about' }),
  category: z.string().min(1, 'Category is required'),
  description: z.string().min(1, 'Description is required').max(4000, 'Description must be 4000 characters or less'),
  severity: z.enum(['minor', 'moderate', 'major']).optional(),
});

interface ReportViolationPageProps {
  communityId: number;
  mode: 'resident' | 'resident_no_unit' | 'staff';
  /** The reporter's own units, marked in the picker. */
  ownUnitIds: number[];
}

export function ReportViolationPage({ communityId, mode, ownUnitIds }: ReportViolationPageProps) {
  const router = useRouter();
  const staff = mode === 'staff';
  const unitOptions = useViolationUnitOptions(communityId);
  const [unitId, setUnitId] = useState<number | ''>('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<ViolationSeverity>('minor');
  const [photos, setPhotos] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const cancelHref = staff
    ? `/violations?communityId=${communityId}`
    : `/violations?tab=mine&communityId=${communityId}`;

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (photos.length + files.length > MAX_PHOTOS) {
      setServerError(`Maximum ${MAX_PHOTOS} photos allowed`);
      return;
    }
    const oversized = files.find((f) => f.size > MAX_PHOTO_SIZE_BYTES);
    if (oversized) {
      setServerError(`${oversized.name} exceeds the 10 MB size limit`);
      return;
    }
    setPhotos((prev) => [...prev, ...files].slice(0, MAX_PHOTOS));
    setServerError('');
    // Reset the input so the same file can be re-selected if removed
    e.target.value = '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setServerError('');

    const parsed = formSchema.safeParse({
      unitId: typeof unitId === 'number' ? unitId : undefined,
      category,
      description,
      severity,
    });
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[issue.path[0] as string] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      let evidenceDocumentIds: number[] | undefined;
      if (photos.length > 0) {
        setUploading(true);
        const ids: number[] = [];
        for (let i = 0; i < photos.length; i++) {
          ids.push(await uploadEvidencePhoto(communityId, photos[i]!, i));
        }
        evidenceDocumentIds = ids;
        setUploading(false);
      }

      const { data } = await createViolation({
        communityId,
        unitId: parsed.data.unitId,
        category: parsed.data.category,
        description: parsed.data.description,
        severity: parsed.data.severity,
        evidenceDocumentIds,
      });

      router.push(
        staff
          ? `/violations?reported=${data.id}&communityId=${communityId}`
          : `/violations?tab=mine&reported=${data.id}&communityId=${communityId}`,
      );
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to submit violation report');
      setSubmitting(false);
      setUploading(false);
    }
  }

  const description_ = staff ? (
    "File a report on a resident's behalf. Your name is recorded as the reporter."
  ) : (
    <>
      Tell the board about a problem at a home. Describe what you saw and add photos if you have
      them. Your name is shown only to you and the board, never to the household you report.
      {mode === 'resident' ? (
        <>
          {' '}
          <Link
            href={`/violations?tab=mine&communityId=${communityId}`}
            className="font-medium text-content-link underline-offset-2 hover:underline"
          >
            See your reports
          </Link>
        </>
      ) : null}
    </>
  );

  return (
    <PageLayout
      template="form"
      header={
        <PageHeader
          title="Report a violation"
          icon={<TriangleAlert />}
          description={description_}
          actions={
            <Button asChild variant="outline">
              <Link href={cancelHref}>Cancel</Link>
            </Button>
          }
        />
      }
    >
      {mode === 'resident_no_unit' ? (
        <Section>
          <SectionFirstRun
            headingLevel={2}
            title="You're not linked to a unit yet"
            description="Contact your community manager to be assigned to a unit, then return here to file a report."
            action={
              <Button asChild variant="outline">
                <Link href={`/dashboard?communityId=${communityId}`}>Back to dashboard</Link>
              </Button>
            }
          />
        </Section>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <Section>
            <SectionHeader title="What happened" />
            <div className="space-y-5 px-4 py-4">
              <div>
                <ViolationUnitPicker
                  id="violation-unit"
                  label={staff ? "Resident's unit" : 'Unit the report is about'}
                  options={unitOptions}
                  value={unitId}
                  onChange={setUnitId}
                  error={fieldErrors['unitId']}
                  ownUnitIds={ownUnitIds}
                />
                <p className="mt-1 text-xs text-content-secondary">
                  Any unit in the community. For a shared space or a repair,{' '}
                  <Link
                    href={operationsTabHref(communityId, 'requests')}
                    className="font-medium text-content-link underline-offset-2 hover:underline"
                  >
                    submit a maintenance request
                  </Link>{' '}
                  instead.
                </p>
              </div>

              <div>
                <label htmlFor="violation-category" className={LABEL_CLASS}>
                  Category
                </label>
                <select
                  id="violation-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Select a category…</option>
                  {VIOLATION_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {fieldErrors['category'] && (
                  <p className="mt-1 text-xs text-status-danger">{fieldErrors['category']}</p>
                )}
              </div>

              <fieldset>
                <legend className={LABEL_CLASS}>Severity</legend>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {SEVERITY_OPTIONS.map((s) => (
                    <label
                      key={s.value}
                      className="flex min-h-11 items-center gap-2 text-sm text-content md:min-h-0"
                    >
                      <input
                        type="radio"
                        name="violation-severity"
                        value={s.value}
                        checked={severity === s.value}
                        onChange={() => setSeverity(s.value)}
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="violation-description" className={LABEL_CLASS}>
                  Description
                </label>
                <textarea
                  id="violation-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  maxLength={4000}
                  placeholder="Describe what you saw…"
                  className={INPUT_CLASS}
                />
                <p className="mt-1 text-right text-xs text-content-secondary">
                  {description.length}/4000
                </p>
                {fieldErrors['description'] && (
                  <p className="mt-1 text-xs text-status-danger">{fieldErrors['description']}</p>
                )}
              </div>

              <div>
                <label htmlFor="violation-photos" className={LABEL_CLASS}>
                  Photos (up to {MAX_PHOTOS})
                </label>
                <input
                  id="violation-photos"
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES}
                  multiple
                  disabled={photos.length >= MAX_PHOTOS}
                  onChange={handlePhotoChange}
                  className="block w-full text-sm text-content-secondary file:mr-2 file:rounded-sm file:border-0 file:bg-interactive-subtle file:px-3 file:py-1 file:text-sm file:font-medium file:text-content-link disabled:opacity-50"
                />
                <p className="mt-1 text-xs text-content-secondary">
                  JPEG, PNG, WebP, or GIF. Up to 10 MB each.
                </p>
                {photos.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {photos.map((f, idx) => (
                      <li
                        key={`${f.name}-${idx}`}
                        className="flex items-center justify-between rounded-sm bg-surface-muted px-3 py-1.5 text-xs text-content-secondary"
                      >
                        <span className="truncate">{f.name}</span>
                        <button
                          type="button"
                          onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                          className="ml-2 min-h-11 shrink-0 text-sm font-medium text-content-link hover:text-content-link-hover md:min-h-0"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {serverError && (
              <div
                role="alert"
                className="mx-4 mb-4 flex items-start gap-2 border-l-4 border-status-danger bg-status-danger-bg px-3 py-2 text-sm text-status-danger"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <p>
                  <span className="font-semibold">Couldn&apos;t send.</span> {serverError}
                </p>
              </div>
            )}

            <SectionFooter>
              <Button
                type="submit"
                disabled={submitting || unitOptions.loading || unitOptions.units.length === 0}
              >
                {uploading
                  ? 'Uploading photos…'
                  : submitting
                    ? 'Submitting…'
                    : staff
                      ? 'File report'
                      : 'Submit report'}
              </Button>
            </SectionFooter>
          </Section>
        </form>
      )}
    </PageLayout>
  );
}
