/**
 * AnnouncementComposer — Shared authoring form for create/edit flows.
 *
 * Keeps the field UI and lightweight client-side validation in one place while
 * routed pages handle permission checks and data loading.
 */
'use client';

import { useCallback, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Editor lazy-loaded so TipTap only ships on routes that actually compose
// announcements. Mode 'narrow' restricts output to the existing
// sanitizeHtml allowlist exactly — no schema or sanitizer changes needed.
const Editor = dynamic(
  () => import('@propertypro/ui/editor').then((m) => ({ default: m.Editor })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border border-edge bg-surface-card px-3 py-3 text-sm text-content-secondary">
        Loading editor…
      </div>
    ),
  },
);

export type AnnouncementAudience = 'all' | 'owners_only' | 'board_only' | 'tenants_only';

export interface AnnouncementComposerValues {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  isPinned: boolean;
  /**
   * ISO-8601 instant at which the announcement stops being shown, or null for
   * "never expires" — which is the default and every pre-existing row.
   */
  expiresAt?: string | null;
}

export interface AnnouncementComposerProps {
  initialValues?: AnnouncementComposerValues;
  isSubmitting?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
  onSubmit: (data: AnnouncementComposerValues) => Promise<void>;
}

const DEFAULT_VALUES: AnnouncementComposerValues = {
  title: '',
  body: '',
  audience: 'all',
  isPinned: false,
  expiresAt: null,
};

/**
 * ISO instant → the `YYYY-MM-DDTHH:mm` a `datetime-local` input requires.
 *
 * Built from the LOCAL getters rather than by slicing `toISOString()`: the
 * input is local-time, and slicing the ISO string would silently shift a PM in
 * any non-UTC zone — every Florida association — by their UTC offset. A notice
 * set to expire at 5pm would then vanish at 1pm.
 */
function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** The inverse. Returns null for an empty or unparseable input. */
function fromLocalInputValue(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function AnnouncementComposer({
  initialValues = DEFAULT_VALUES,
  isSubmitting = false,
  submitLabel = 'Publish announcement',
  onCancel,
  onSubmit,
}: AnnouncementComposerProps) {
  const [title, setTitle] = useState(initialValues.title);
  const [body, setBody] = useState(initialValues.body);
  const [audience, setAudience] = useState<AnnouncementAudience>(initialValues.audience);
  const [isPinned, setIsPinned] = useState(initialValues.isPinned);
  const [expiresAtInput, setExpiresAtInput] = useState(
    toLocalInputValue(initialValues.expiresAt),
  );
  const [error, setError] = useState<string | null>(null);

  /*
   * A warning, not a block. A past expiry is a legitimate "take this down now"
   * action, so refusing it would remove a real capability — but it is also
   * exactly what a mistyped year looks like, and that mistake would otherwise
   * hide the announcement with no feedback at all. Saying what will happen
   * serves both readings.
   */
  const expiryIsInThePast = (() => {
    const iso = fromLocalInputValue(expiresAtInput);
    return iso !== null && new Date(iso).getTime() <= Date.now();
  })();

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);

      const nextTitle = title.trim();
      const nextBody = body.trim();

      if (nextTitle.length === 0) {
        setError('Title is required.');
        return;
      }

      if (nextBody.length === 0) {
        setError('Body is required.');
        return;
      }

      try {
        await onSubmit({
          title: nextTitle,
          body: nextBody,
          audience,
          isPinned,
          expiresAt: fromLocalInputValue(expiresAtInput),
        });
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : 'We could not save this announcement.',
        );
      }
    },
    [audience, body, expiresAtInput, isPinned, onSubmit, title],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-xl border border-edge bg-surface-card p-6 shadow-sm"
    >
      {error ? (
        <AlertBanner
          status="danger"
          variant="subtle"
          title="We couldn't save this announcement."
          description={error}
        />
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="announcement-title">Title</Label>
        <Input
          id="announcement-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Board meeting reminder"
          maxLength={500}
          className="h-11 md:h-9"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="announcement-body">Message</Label>
        <Editor
          mode="narrow"
          initialHtml={body}
          onChange={(html) => setBody(html)}
          ariaLabel="Announcement message"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="announcement-audience">Audience</Label>
          <Select value={audience} onValueChange={(value) => setAudience(value as AnnouncementAudience)}>
            <SelectTrigger id="announcement-audience" className="h-11 md:h-9">
              <SelectValue placeholder="Select audience" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All residents</SelectItem>
              <SelectItem value="owners_only">Owners only</SelectItem>
              <SelectItem value="board_only">Board members only</SelectItem>
              <SelectItem value="tenants_only">Tenants only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3 rounded-md border border-edge-subtle bg-surface-subtle px-4 py-3">
          <Checkbox
            id="announcement-pinned"
            checked={isPinned}
            onCheckedChange={(checked) => setIsPinned(checked === true)}
            disabled={isSubmitting}
          />
          <div className="space-y-1">
            <Label htmlFor="announcement-pinned">Pin announcement</Label>
            <p className="text-sm text-content-secondary">
              Keep this update at the top of the list.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="announcement-expires-at">Stop showing on (optional)</Label>
          <Input
            id="announcement-expires-at"
            type="datetime-local"
            value={expiresAtInput}
            onChange={(event) => setExpiresAtInput(event.target.value)}
            disabled={isSubmitting}
            aria-describedby="announcement-expires-at-hint"
          />
          <p id="announcement-expires-at-hint" className="text-sm text-content-secondary">
            {expiryIsInThePast
              ? 'That time has already passed, so this will be hidden as soon as you save.'
              : 'Leave empty to keep it up until you archive it. Seasonal notices can take themselves down.'}
          </p>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 md:h-9"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : null}
        <Button type="submit" className="h-11 md:h-9" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export default AnnouncementComposer;
