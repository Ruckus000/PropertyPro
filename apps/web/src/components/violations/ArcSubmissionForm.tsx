'use client';

/**
 * Resident-facing ARC application form.
 *
 * Modelled on `ViolationReportForm` — the sibling resident-submit flow — down to
 * the unit handling: a resident with one unit never sees a picker, and a
 * resident with several picks from their own, never from the community roster.
 * The server re-checks that (`createArcSubmissionForCommunity` rejects a unit
 * the submitter does not hold), so this is convenience, not the control.
 *
 * Fields mirror `createArcBodySchema` exactly. Dates are optional there and
 * optional here; sending `''` would fail the `yyyy-MM-dd` regex, so empty
 * values are normalised to `null`.
 */
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { useCreateArcSubmission } from '@/hooks/use-arc';

/**
 * Common exterior-modification categories.
 *
 * `projectType` is a free string on the server (1–120 chars), so this list is a
 * convenience, not a constraint — "Other" reveals a text input rather than
 * forcing a resident to misfile a project the association has never seen.
 */
const PROJECT_TYPES = [
  'Painting / exterior color',
  'Roof',
  'Windows or doors',
  'Fence or wall',
  'Landscaping',
  'Patio, deck or pergola',
  'Solar panels',
  'Satellite dish or antenna',
  'Driveway or walkway',
  'Awning or shutters',
] as const;

const OTHER = 'Other';

const formSchema = z.object({
  title: z.string().trim().min(1, 'Give your request a short title').max(200),
  projectType: z.string().trim().min(1, 'Select or describe the type of project').max(120),
  description: z
    .string()
    .trim()
    .min(1, 'Describe what you plan to do')
    .max(4000, 'Description must be 4000 characters or less'),
});

interface ArcSubmissionFormProps {
  communityId: number;
  /** The resident's own units. Exactly one means no picker. */
  unitIds: number[];
  defaultUnitId: number | null;
}

export function ArcSubmissionForm({
  communityId,
  unitIds,
  defaultUnitId,
}: ArcSubmissionFormProps) {
  const router = useRouter();
  const createMutation = useCreateArcSubmission(communityId);

  const [unitId, setUnitId] = useState<number | null>(defaultUnitId);
  const [title, setTitle] = useState('');
  const [projectTypeChoice, setProjectTypeChoice] = useState('');
  const [otherProjectType, setOtherProjectType] = useState('');
  const [description, setDescription] = useState('');
  const [estimatedStartDate, setEstimatedStartDate] = useState('');
  const [estimatedCompletionDate, setEstimatedCompletionDate] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');

  const projectType = projectTypeChoice === OTHER ? otherProjectType : projectTypeChoice;

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setServerError('');

      const parsed = formSchema.safeParse({ title, projectType, description });
      const errors: Record<string, string> = {};
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? 'form');
          errors[key] ??= issue.message;
        }
      }
      if (unitId === null) {
        errors.unitId = 'Select the unit this request is for';
      }
      if (
        estimatedStartDate &&
        estimatedCompletionDate &&
        estimatedCompletionDate < estimatedStartDate
      ) {
        errors.estimatedCompletionDate = 'Completion cannot be before the start date';
      }

      setFieldErrors(errors);
      if (Object.keys(errors).length > 0) return;

      try {
        await createMutation.mutateAsync({
          unitId: unitId as number,
          title: title.trim(),
          description: description.trim(),
          projectType: projectType.trim(),
          // Empty strings would fail the server's `yyyy-MM-dd` regex.
          estimatedStartDate: estimatedStartDate || null,
          estimatedCompletionDate: estimatedCompletionDate || null,
        });
        router.push(`/arc-requests?communityId=${communityId}&submitted=1`);
      } catch (err) {
        setServerError(
          err instanceof Error ? err.message : 'Unable to submit your request. Please try again.',
        );
      }
    },
    [
      communityId,
      createMutation,
      description,
      estimatedCompletionDate,
      estimatedStartDate,
      projectType,
      router,
      title,
      unitId,
    ],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {serverError && (
        <div role="alert" className="rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
          {serverError}
        </div>
      )}

      {unitIds.length > 1 && (
        <div>
          <label htmlFor="arc-unit" className="mb-1 block text-sm font-medium text-content-secondary">
            Unit
          </label>
          <select
            id="arc-unit"
            value={unitId ?? ''}
            onChange={(e) => setUnitId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
          >
            <option value="">Select a unit</option>
            {unitIds.map((id) => (
              <option key={id} value={id}>
                Unit #{id}
              </option>
            ))}
          </select>
          {fieldErrors.unitId && (
            <p className="mt-1 text-xs text-status-danger">{fieldErrors.unitId}</p>
          )}
        </div>
      )}

      <div>
        <label htmlFor="arc-title" className="mb-1 block text-sm font-medium text-content-secondary">
          Title
        </label>
        <input
          id="arc-title"
          type="text"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Replace front door"
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
        />
        {fieldErrors.title && <p className="mt-1 text-xs text-status-danger">{fieldErrors.title}</p>}
      </div>

      <div>
        <label htmlFor="arc-project-type" className="mb-1 block text-sm font-medium text-content-secondary">
          Type of project
        </label>
        <select
          id="arc-project-type"
          value={projectTypeChoice}
          onChange={(e) => setProjectTypeChoice(e.target.value)}
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
        >
          <option value="">Select a project type</option>
          {PROJECT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
          <option value={OTHER}>{OTHER}</option>
        </select>
        {projectTypeChoice === OTHER && (
          <input
            type="text"
            value={otherProjectType}
            maxLength={120}
            onChange={(e) => setOtherProjectType(e.target.value)}
            placeholder="Describe the type of project"
            aria-label="Describe the type of project"
            className="mt-2 w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
          />
        )}
        {fieldErrors.projectType && (
          <p className="mt-1 text-xs text-status-danger">{fieldErrors.projectType}</p>
        )}
      </div>

      <div>
        <label htmlFor="arc-description" className="mb-1 block text-sm font-medium text-content-secondary">
          What are you planning?
        </label>
        <textarea
          id="arc-description"
          rows={6}
          value={description}
          maxLength={4000}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the work, the materials and colors, and who will carry it out."
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
        />
        <p className="mt-1 text-xs text-content-disabled">
          The more specific you are, the less likely the committee has to come back
          with questions.
        </p>
        {fieldErrors.description && (
          <p className="mt-1 text-xs text-status-danger">{fieldErrors.description}</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="arc-start" className="mb-1 block text-sm font-medium text-content-secondary">
            Estimated start <span className="text-content-disabled">(optional)</span>
          </label>
          <input
            id="arc-start"
            type="date"
            value={estimatedStartDate}
            onChange={(e) => setEstimatedStartDate(e.target.value)}
            className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
          />
        </div>
        <div>
          <label htmlFor="arc-completion" className="mb-1 block text-sm font-medium text-content-secondary">
            Estimated completion <span className="text-content-disabled">(optional)</span>
          </label>
          <input
            id="arc-completion"
            type="date"
            value={estimatedCompletionDate}
            onChange={(e) => setEstimatedCompletionDate(e.target.value)}
            className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm focus:border-edge-focus focus:outline-none focus:ring-1 focus:ring-focus"
          />
          {fieldErrors.estimatedCompletionDate && (
            <p className="mt-1 text-xs text-status-danger">
              {fieldErrors.estimatedCompletionDate}
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-edge pt-4">
        <Button type="submit" loading={createMutation.isPending}>
          Submit request
        </Button>
      </div>
    </form>
  );
}
