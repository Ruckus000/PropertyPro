'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button, Card } from '@propertypro/ui';
import { useCreateMeeting, useMeeting, useUpdateMeeting } from '@/hooks/use-meetings';
import {
  utcDateToWallClockValue,
  wallClockValueToUtcIso,
} from '@/lib/utils/zoned-datetime';

type MeetingTypeOption = 'board' | 'annual' | 'special' | 'budget' | 'committee';

interface FormState {
  title: string;
  meetingType: MeetingTypeOption;
  startsAt: string;
  endsAt: string;
  location: string;
}

interface MeetingFormProps {
  communityId: number;
  communityTimezone: string;
  meetingId?: number | null;
  onClose: () => void;
  onSuccess?: () => void;
}

const EMPTY_FORM: FormState = {
  title: '',
  meetingType: 'board',
  startsAt: '',
  endsAt: '',
  location: '',
};

function buildDefaultStart(): string {
  const nextHour = new Date();
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  const year = nextHour.getFullYear();
  const month = String(nextHour.getMonth() + 1).padStart(2, '0');
  const day = String(nextHour.getDate()).padStart(2, '0');
  const hour = String(nextHour.getHours()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:00`;
}

function addOneHour(value: string): string {
  if (!value) {
    return '';
  }

  const localDate = new Date(`${value}:00`);
  if (Number.isNaN(localDate.getTime())) {
    return '';
  }
  localDate.setHours(localDate.getHours() + 1);

  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  const hour = String(localDate.getHours()).padStart(2, '0');
  const minute = String(localDate.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function validateForm(state: FormState, isEditing: boolean): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!state.title.trim()) {
    errors.title = 'Title is required.';
  }
  if (!state.location.trim()) {
    errors.location = 'Location is required.';
  }
  if (!state.startsAt) {
    errors.startsAt = 'Start time is required.';
  }
  if (state.startsAt && !isEditing) {
    const startsAt = new Date(`${state.startsAt}:00`);
    if (!Number.isNaN(startsAt.getTime()) && startsAt.getTime() < Date.now()) {
      errors.startsAt = 'New meetings must start in the future.';
    }
  }
  if (state.endsAt && state.startsAt) {
    const startsAt = new Date(`${state.startsAt}:00`);
    const endsAt = new Date(`${state.endsAt}:00`);
    if (endsAt.getTime() <= startsAt.getTime()) {
      errors.endsAt = 'End time must be after the start time.';
    }
  }

  return errors;
}

export function MeetingForm({
  communityId,
  communityTimezone,
  meetingId,
  onClose,
  onSuccess,
}: MeetingFormProps) {
  const isEditing = meetingId !== null && meetingId !== undefined;
  const detailQuery = useMeeting(communityId, meetingId ?? null);
  const createMutation = useCreateMeeting(communityId);
  const updateMutation = useUpdateMeeting(communityId);

  const [formState, setFormState] = useState<FormState>(() => {
    const startsAt = buildDefaultStart();
    return {
      ...EMPTY_FORM,
      startsAt,
      endsAt: addOneHour(startsAt),
    };
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loadedMeetingId, setLoadedMeetingId] = useState<number | null>(null);

  useEffect(() => {
    if (!detailQuery.data || !isEditing || detailQuery.data.id === loadedMeetingId) {
      return;
    }

    const startsAt = utcDateToWallClockValue(
      new Date(detailQuery.data.startsAt),
      communityTimezone,
    );
    const endsAt = detailQuery.data.endsAt
      ? utcDateToWallClockValue(new Date(detailQuery.data.endsAt), communityTimezone)
      : addOneHour(startsAt);

    setFormState({
      title: detailQuery.data.title,
      meetingType: detailQuery.data.meetingType as MeetingTypeOption,
      startsAt,
      endsAt,
      location: detailQuery.data.location,
    });
    setLoadedMeetingId(detailQuery.data.id);
  }, [communityTimezone, detailQuery.data, isEditing, loadedMeetingId]);

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    const nextErrors = validateForm(formState, isEditing);
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const payload = {
      title: formState.title.trim(),
      meetingType: formState.meetingType,
      startsAt: wallClockValueToUtcIso(formState.startsAt, communityTimezone),
      endsAt: formState.endsAt
        ? wallClockValueToUtcIso(formState.endsAt, communityTimezone)
        : null,
      location: formState.location.trim(),
    };

    try {
      if (isEditing && meetingId) {
        await updateMutation.mutateAsync({ id: meetingId, ...payload });
        setSuccessMessage('Meeting updated.');
      } else {
        await createMutation.mutateAsync(payload);
        setSuccessMessage('Meeting created.');
      }

      window.setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 400);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save meeting.');
    }
  }

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setFormState((current) => {
      const nextState = { ...current, [key]: value };

      if (key === 'startsAt' && !current.endsAt) {
        nextState.endsAt = addOneHour(String(value));
      }

      return nextState;
    });
    setFieldErrors((current) => {
      if (!current[key]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[key];
      return nextErrors;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <Card
        className="w-full max-w-2xl overflow-hidden bg-[var(--surface-card)] shadow-[var(--elevation-e3)]"
        noPadding
      >
        <Card.Header bordered>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Card.Title>{isEditing ? 'Edit Meeting' : 'Create Meeting'}</Card.Title>
              <Card.Subtitle>
                Meetings are stored in UTC and shown in {communityTimezone}.
              </Card.Subtitle>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--radius-sm)] p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-secondary)]"
              disabled={isSubmitting}
            >
              <X size={18} />
            </button>
          </div>
        </Card.Header>
        <Card.Body>
          {isEditing && detailQuery.isLoading ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
              Loading meeting details...
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-5 md:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">Title</span>
                  <input
                    type="text"
                    value={formState.title}
                    onChange={(event) => updateField('title', event.target.value)}
                    className="h-10 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-page)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--focus-ring-color)] focus:ring-2 focus:ring-[var(--focus-ring-color)]/20"
                    maxLength={200}
                  />
                  {fieldErrors.title ? (
                    <span className="text-xs text-[var(--status-danger)]">{fieldErrors.title}</span>
                  ) : null}
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">Meeting Type</span>
                  <select
                    value={formState.meetingType}
                    onChange={(event) => updateField('meetingType', event.target.value as MeetingTypeOption)}
                    className="h-10 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-page)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--focus-ring-color)] focus:ring-2 focus:ring-[var(--focus-ring-color)]/20"
                  >
                    <option value="board">Board</option>
                    <option value="annual">Annual</option>
                    <option value="special">Special</option>
                    <option value="budget">Budget</option>
                    <option value="committee">Committee</option>
                  </select>
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">Start</span>
                  <input
                    type="datetime-local"
                    value={formState.startsAt}
                    onChange={(event) => updateField('startsAt', event.target.value)}
                    className="h-10 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-page)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--focus-ring-color)] focus:ring-2 focus:ring-[var(--focus-ring-color)]/20"
                  />
                  {fieldErrors.startsAt ? (
                    <span className="text-xs text-[var(--status-danger)]">{fieldErrors.startsAt}</span>
                  ) : null}
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">End</span>
                  <input
                    type="datetime-local"
                    value={formState.endsAt}
                    onChange={(event) => updateField('endsAt', event.target.value)}
                    className="h-10 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-page)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--focus-ring-color)] focus:ring-2 focus:ring-[var(--focus-ring-color)]/20"
                  />
                  {fieldErrors.endsAt ? (
                    <span className="text-xs text-[var(--status-danger)]">{fieldErrors.endsAt}</span>
                  ) : (
                    <span className="text-xs text-[var(--text-tertiary)]">Optional. Defaults to one hour after the start.</span>
                  )}
                </label>
              </div>

              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-[var(--text-primary)]">Location</span>
                <input
                  type="text"
                  value={formState.location}
                  onChange={(event) => updateField('location', event.target.value)}
                  className="h-10 rounded-[var(--radius-sm)] border border-[var(--border-default)] bg-[var(--surface-page)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--focus-ring-color)] focus:ring-2 focus:ring-[var(--focus-ring-color)]/20"
                  maxLength={200}
                />
                {fieldErrors.location ? (
                  <span className="text-xs text-[var(--status-danger)]">{fieldErrors.location}</span>
                ) : null}
              </label>

              {formError ? (
                <div className="rounded-[var(--radius-md)] border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger)]">
                  {formError}
                </div>
              ) : null}

              {successMessage ? (
                <div className="rounded-[var(--radius-md)] border border-[var(--status-success-border)] bg-[var(--status-success-bg)] px-3 py-2 text-sm text-[var(--status-success)]">
                  {successMessage}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" loading={isSubmitting}>
                  {isEditing ? 'Save Changes' : 'Create Meeting'}
                </Button>
              </div>
            </form>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}
