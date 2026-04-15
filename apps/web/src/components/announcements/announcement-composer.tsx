/**
 * AnnouncementComposer — Shared authoring form for create/edit flows.
 *
 * Keeps the field UI and lightweight client-side validation in one place while
 * routed pages handle permission checks and data loading.
 */
'use client';

import { useCallback, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';

export type AnnouncementAudience = 'all' | 'owners_only' | 'board_only' | 'tenants_only';

export interface AnnouncementComposerValues {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  isPinned: boolean;
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
};

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
  const [error, setError] = useState<string | null>(null);

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
        });
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : 'We could not save this announcement.',
        );
      }
    },
    [audience, body, isPinned, onSubmit, title],
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
        <Textarea
          id="announcement-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Share the update residents should see."
          rows={10}
          className="min-h-40"
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

        <div className="flex items-center gap-3 rounded-md border border-edge-subtle bg-surface-muted/40 px-4 py-3">
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
        <Button type="submit" className="h-11 md:h-9" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export default AnnouncementComposer;
