'use client';

/**
 * Violation report form for owners/residents.
 * The resident picks the unit where the problem is — usually a neighbour's
 * (D1); a problem in a shared space is not a violation against anyone and goes
 * to a maintenance request instead, which the form says up front.
 * Allows submitting a violation with category, description, severity, and photo evidence.
 * Photos are uploaded through the dedicated hidden evidence flow
 * (/api/v1/upload -> /api/v1/violations/evidence), returning document IDs stored
 * in evidenceDocumentIds.
 */
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { createViolation } from '@/lib/api/violations';
import { uploadEvidencePhoto } from '@/lib/violations/evidence-upload';
import type { ViolationSeverity } from '@propertypro/db';
import { operationsTabHref } from '@/lib/operations/routes';
import { ViolationUnitPicker, useViolationUnitOptions } from './ViolationUnitPicker';

const MAX_PHOTOS = 3;
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif';

const VIOLATION_CATEGORIES = [
  { value: 'noise', label: 'Noise' },
  { value: 'parking', label: 'Parking' },
  { value: 'unauthorized_modification', label: 'Unauthorized Modification' },
  { value: 'pet', label: 'Pet Violation' },
  { value: 'trash', label: 'Trash / Debris' },
  { value: 'common_area_misuse', label: 'Common Area Misuse' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'property_damage', label: 'Property Damage' },
  { value: 'other', label: 'Other' },
] as const;

const SEVERITY_OPTIONS: { value: ViolationSeverity; label: string }[] = [
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'major', label: 'Major' },
];

const formSchema = z.object({
  // `error` covers the empty picker too: zod 4 reports undefined as an
  // invalid_type issue, which `.positive({ message })` never reaches.
  unitId: z.number({ error: 'Please select the unit the report is about' }).int().positive({ error: 'Please select the unit the report is about' }),
  category: z.string().min(1, 'Category is required'),
  description: z.string().min(1, 'Description is required').max(4000, 'Description must be 4000 characters or less'),
  severity: z.enum(['minor', 'moderate', 'major']).optional(),
});

interface ViolationReportFormProps {
  communityId: number;
  /** The reporter's own units, marked in the picker. */
  ownUnitIds: number[];
}

export function ViolationReportForm({ communityId, ownUnitIds }: ViolationReportFormProps) {
  const router = useRouter();
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
  const [submitted, setSubmitted] = useState(false);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const total = photos.length + files.length;
    if (total > MAX_PHOTOS) {
      setServerError(`Maximum ${MAX_PHOTOS} photos allowed`);
      return;
    }

    // Client-side size validation
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

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
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
        // Upload photos first, collecting document IDs
        let evidenceDocumentIds: number[] | undefined;
        if (photos.length > 0) {
          setUploading(true);
          const ids: number[] = [];
          for (let i = 0; i < photos.length; i++) {
            const docId = await uploadEvidencePhoto(communityId, photos[i]!, i);
            ids.push(docId);
          }
          evidenceDocumentIds = ids;
          setUploading(false);
        }

        await createViolation({
          communityId,
          unitId: parsed.data.unitId,
          category: parsed.data.category,
          description: parsed.data.description,
          severity: parsed.data.severity,
          evidenceDocumentIds,
        });

        setUnitId('');
        setCategory('');
        setDescription('');
        setSeverity('minor');
        setPhotos([]);
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), 4000);
        // Refresh server components to show the new violation in the list below
        router.refresh();
      } catch (err) {
        setServerError(err instanceof Error ? err.message : 'Failed to submit violation report');
      } finally {
        setSubmitting(false);
        setUploading(false);
      }
    },
    [communityId, unitId, category, description, severity, photos, router],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-edge bg-surface-card p-6">
      {serverError && (
        <div role="alert" className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">{serverError}</div>
      )}
      {submitted && (
        <div className="rounded-md bg-status-success-bg px-3 py-2 text-sm text-status-success">
          Violation report submitted successfully.
        </div>
      )}

      <p className="text-sm text-content-secondary">
        Report a rule being broken at a specific home. For a problem in a shared space — a
        hallway, the pool, the parking garage — or something that needs fixing,{' '}
        <Link
          href={operationsTabHref(communityId, 'requests')}
          className="font-medium text-content-link underline-offset-2 hover:underline"
        >
          submit a maintenance request
        </Link>{' '}
        instead. Only the board and management see who filed a report.
      </p>

      <ViolationUnitPicker
        id="violation-unit"
        label="Unit the report is about"
        options={unitOptions}
        value={unitId}
        onChange={setUnitId}
        error={fieldErrors['unitId']}
        ownUnitIds={ownUnitIds}
      />

      {/* Category */}
      <div>
        <label htmlFor="violation-category" className="mb-1 block text-sm font-medium text-content-secondary">
          Category
        </label>
        <select
          id="violation-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
        >
          <option value="">Select a category...</option>
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

      {/* Description */}
      <div>
        <label htmlFor="violation-description" className="mb-1 block text-sm font-medium text-content-secondary">
          Description
        </label>
        <textarea
          id="violation-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Describe the violation in detail..."
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
        />
        <p className="mt-1 text-xs text-content-disabled">{description.length}/4000</p>
        {fieldErrors['description'] && (
          <p className="mt-1 text-xs text-status-danger">{fieldErrors['description']}</p>
        )}
      </div>

      {/* Severity */}
      <div>
        <label htmlFor="violation-severity" className="mb-1 block text-sm font-medium text-content-secondary">
          Severity
        </label>
        <select
          id="violation-severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as ViolationSeverity)}
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
        >
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Photo Evidence */}
      <div>
        <label htmlFor="violation-photos" className="mb-1 block text-sm font-medium text-content-secondary">
          Photo Evidence (max {MAX_PHOTOS})
        </label>
        <input
          id="violation-photos"
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          multiple
          disabled={photos.length >= MAX_PHOTOS}
          onChange={handlePhotoChange}
          className="mt-1 block w-full text-sm text-content-tertiary file:mr-2 file:rounded-md file:border-0 file:bg-interactive-subtle file:px-3 file:py-1 file:text-sm file:font-medium file:text-content-link hover:file:bg-interactive-muted disabled:opacity-50"
        />
        <p className="mt-1 text-xs text-content-disabled">
          JPEG, PNG, WebP, or GIF. Up to 10 MB each.
        </p>
        {photos.length > 0 && (
          <ul className="mt-2 space-y-1">
            {photos.map((f, idx) => (
              <li key={idx} className="flex items-center justify-between rounded-md bg-surface-hover px-3 py-1.5 text-xs text-content-secondary">
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removePhoto(idx)}
                  className="ml-2 shrink-0 text-status-danger hover:text-status-danger"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || unitOptions.loading || unitOptions.units.length === 0}
        className="w-full rounded-md bg-interactive px-4 py-2.5 text-sm font-medium text-content-inverse transition-colors duration-quick hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? 'Uploading photos...' : submitting ? 'Submitting...' : 'Submit Violation Report'}
      </button>
    </form>
  );
}
