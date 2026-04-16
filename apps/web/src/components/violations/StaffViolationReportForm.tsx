'use client';

/**
 * Staff-only report form for filing a violation on behalf of a resident.
 * Fetches the scoped unit list via GET /api/v1/units and requires the operator
 * to explicitly pick the target unit. The server stamps the operator's userId
 * as reportedByUserId, surfacing the "staff" attribution on reads.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { createViolation } from '@/lib/api/violations';
import { uploadEvidencePhoto } from '@/lib/violations/evidence-upload';
import type { ViolationSeverity } from '@propertypro/db';

const MAX_PHOTOS = 3;
const MAX_PHOTO_SIZE_BYTES = 10 * 1024 * 1024;
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
  unitId: z.number().int().positive({ message: 'Please select a unit' }),
  category: z.string().min(1, 'Category is required'),
  description: z
    .string()
    .min(1, 'Description is required')
    .max(4000, 'Description must be 4000 characters or less'),
  severity: z.enum(['minor', 'moderate', 'major']).optional(),
});

interface UnitOption {
  id: number;
  unitNumber: string;
  building: string | null;
}
interface UnitsListResponse {
  data: Array<{ id: number; unitNumber: string; building: string | null }>;
}

interface StaffViolationReportFormProps {
  communityId: number;
}

function formatUnitLabel(unit: UnitOption): string {
  return unit.building ? `${unit.building} • Unit ${unit.unitNumber}` : `Unit ${unit.unitNumber}`;
}

export function StaffViolationReportForm({ communityId }: StaffViolationReportFormProps) {
  const router = useRouter();
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [unitsError, setUnitsError] = useState('');
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/units?communityId=${communityId}`);
        if (!res.ok) throw new Error('Failed to load units');
        const body = (await res.json()) as UnitsListResponse;
        if (cancelled) return;
        const sorted = [...body.data].sort((a, b) =>
          formatUnitLabel(a).localeCompare(formatUnitLabel(b), undefined, { numeric: true }),
        );
        setUnits(sorted);
      } catch (err) {
        if (!cancelled) {
          setUnitsError(err instanceof Error ? err.message : 'Failed to load units');
        }
      } finally {
        if (!cancelled) setUnitsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [communityId]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const total = photos.length + files.length;
    if (total > MAX_PHOTOS) {
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

  const disableSubmit = submitting || unitsLoading || units.length === 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-edge bg-surface-card p-6">
      {serverError && (
        <div role="alert" className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
          {serverError}
        </div>
      )}
      {submitted && (
        <div className="rounded-md bg-status-success-bg px-3 py-2 text-sm text-status-success">
          Violation report submitted successfully.
        </div>
      )}

      {/* Unit picker */}
      <div>
        <label htmlFor="staff-violation-unit" className="mb-1 block text-sm font-medium text-content-secondary">
          Resident's Unit <span aria-hidden="true" className="text-status-danger">*</span>
        </label>
        {unitsError ? (
          <p role="alert" className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
            {unitsError}
          </p>
        ) : (
          <select
            id="staff-violation-unit"
            value={unitId === '' ? '' : String(unitId)}
            onChange={(e) => setUnitId(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={unitsLoading || units.length === 0}
            className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus disabled:opacity-50"
          >
            <option value="">
              {unitsLoading ? 'Loading units…' : units.length === 0 ? 'No units available' : 'Select a unit…'}
            </option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {formatUnitLabel(u)}
              </option>
            ))}
          </select>
        )}
        {fieldErrors['unitId'] && (
          <p className="mt-1 text-xs text-status-danger">{fieldErrors['unitId']}</p>
        )}
      </div>

      {/* Category */}
      <div>
        <label htmlFor="staff-violation-category" className="mb-1 block text-sm font-medium text-content-secondary">
          Category
        </label>
        <select
          id="staff-violation-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
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
        <label htmlFor="staff-violation-description" className="mb-1 block text-sm font-medium text-content-secondary">
          Description
        </label>
        <textarea
          id="staff-violation-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Describe the violation in detail..."
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
        />
        <p className="mt-1 text-xs text-content-disabled">{description.length}/4000</p>
        {fieldErrors['description'] && (
          <p className="mt-1 text-xs text-status-danger">{fieldErrors['description']}</p>
        )}
      </div>

      {/* Severity */}
      <div>
        <label htmlFor="staff-violation-severity" className="mb-1 block text-sm font-medium text-content-secondary">
          Severity
        </label>
        <select
          id="staff-violation-severity"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as ViolationSeverity)}
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
        >
          {SEVERITY_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Photo evidence */}
      <div>
        <label htmlFor="staff-violation-photos" className="mb-1 block text-sm font-medium text-content-secondary">
          Photo Evidence (max {MAX_PHOTOS})
        </label>
        <input
          id="staff-violation-photos"
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
              <li
                key={idx}
                className="flex items-center justify-between rounded-md bg-surface-hover px-3 py-1.5 text-xs text-content-secondary"
              >
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

      <button
        type="submit"
        disabled={disableSubmit}
        className="w-full rounded-md bg-interactive px-4 py-2.5 text-sm font-medium text-content-inverse transition-colors duration-quick hover:bg-interactive-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {uploading ? 'Uploading photos...' : submitting ? 'Submitting...' : 'File Violation Report'}
      </button>
    </form>
  );
}
