'use client';

/**
 * Take an empty unit offline (storm damage, renovation, model or staff unit),
 * or bring an offline unit back. Offline units are not offered for leasing and
 * do not count as vacant. Either change can be undone from the toast.
 */
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { RosterDialogProps } from '../types';
import {
  Field,
  NativeSelect,
  RosterDialogFrame,
  ServerErrorBanner,
  Summary,
  describeError,
  fieldA11y,
  fmtDate,
  isIsoDate,
  useSubmitAttempt,
  type Errors,
  type ServerErrorView,
} from './form-kit';

type OfflineReason = 'storm_damage' | 'renovation' | 'model_unit' | 'staff_unit' | 'other';

export const OFFLINE_REASONS: Array<{ value: OfflineReason; label: string }> = [
  { value: 'storm_damage', label: 'Storm or casualty damage' },
  { value: 'renovation', label: 'Renovation or repairs' },
  { value: 'model_unit', label: 'Model unit' },
  { value: 'staff_unit', label: 'Staff or office use' },
  { value: 'other', label: 'Other' },
];

function reasonLabel(value: string | null | undefined): string {
  return OFFLINE_REASONS.find((r) => r.value === value)?.label ?? value ?? 'Not recorded';
}

function asReason(value: string | null | undefined): OfflineReason {
  return OFFLINE_REASONS.some((r) => r.value === value) ? (value as OfflineReason) : 'other';
}

export function OfflineDialog(props: RosterDialogProps) {
  const { model, today, actions, onDone, onClose } = props;
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [since, setSince] = useState(today);
  const [until, setUntil] = useState('');
  const [serverError, setServerError] = useState<ServerErrorView | null>(null);
  const { tried, guard } = useSubmitAttempt();

  if (!model) {
    return (
      <RosterDialogFrame title="Unit offline" description="Unit not found." onClose={onClose} pending={false} cancelLabel="Close">
        <p className="text-sm text-content-secondary">Close this and try again.</p>
      </RosterDialogFrame>
    );
  }

  const u = model.unit;
  const unit = `Unit ${u.unitNumber}`;
  const isOffline = u.offlineSince != null || model.state.kind === 'offline';
  const pending = actions.setUnitOffline.isPending;

  if (isOffline) {
    const previous = {
      reason: asReason(u.offlineReason),
      note: u.offlineNote ?? null,
      since: u.offlineSince ?? today,
      until: u.offlineUntil ?? null,
    };
    const bringBack = async () => {
      setServerError(null);
      try {
        await actions.setUnitOffline.mutateAsync({ unitId: u.id, offline: null });
        onDone(`${unit} is back online and can be leased.`, () =>
          actions.setUnitOffline.mutateAsync({ unitId: u.id, offline: previous }),
        );
      } catch (err) {
        setServerError(describeError(err));
      }
    };
    return (
      <RosterDialogFrame
        title={`Bring back online · ${unit}`}
        description="The unit is offered for leasing again and counts as vacant."
        onClose={onClose}
        onSubmit={() => void bringBack()}
        submitLabel="Bring back online"
        pending={pending}
      >
        <ServerErrorBanner error={serverError} />
        <Summary
          rows={[
            ['Reason', reasonLabel(u.offlineReason)],
            ['Offline since', fmtDate(u.offlineSince)],
            ['Expected back', u.offlineUntil ? fmtDate(u.offlineUntil) : 'Not set'],
            ...(u.offlineNote ? ([['Note', u.offlineNote]] as Array<[string, string]>) : []),
          ]}
        />
      </RosterDialogFrame>
    );
  }

  const errors: Errors = {
    reason: reason ? null : 'Choose why the unit is offline.',
    since: !isIsoDate(since)
      ? 'Enter the date the unit went offline.'
      : since > today
        ? 'Must be today or earlier. Take the unit offline on the day work starts.'
        : null,
    until:
      until && !isIsoDate(until)
        ? 'Enter a valid date, or leave it blank.'
        : until && isIsoDate(since) && until <= since
          ? 'Must be after the offline date.'
          : null,
    note: reason === 'other' && !note.trim() ? 'Describe why the unit is offline.' : null,
  };
  const ids = { reason: 'ol-reason', since: 'ol-since', until: 'ol-until', note: 'ol-note' };

  async function takeOffline() {
    if (!guard(errors, ids)) return;
    setServerError(null);
    try {
      await actions.setUnitOffline.mutateAsync({
        unitId: u.id,
        offline: { reason: reason as OfflineReason, note: note.trim() || null, since, until: until || null },
      });
      onDone(`${unit} is offline. It no longer counts as vacant.`, () =>
        actions.setUnitOffline.mutateAsync({ unitId: u.id, offline: null }),
      );
    } catch (err) {
      setServerError(describeError(err));
    }
  }

  return (
    <RosterDialogFrame
      title={`Take unit offline · ${unit}`}
      description="Offline units are not offered for leasing and do not count as vacant or toward occupancy."
      onClose={onClose}
      onSubmit={() => void takeOffline()}
      submitLabel="Take offline"
      pending={pending}
    >
      <ServerErrorBanner error={serverError} />
      <Field id="ol-reason" label="Reason" error={errors.reason} show={tried}>
        <NativeSelect
          {...fieldA11y('ol-reason', errors.reason, tried)}
          value={reason}
          onChange={setReason}
          placeholder="Choose a reason"
          options={OFFLINE_REASONS}
        />
      </Field>
      <Field id="ol-since" label="Offline since" error={errors.since} show={tried}>
        <Input
          {...fieldA11y('ol-since', errors.since, tried)}
          type="date"
          max={today}
          value={since}
          onChange={(e) => setSince(e.target.value)}
        />
      </Field>
      <Field
        id="ol-until"
        label="Expected back"
        optional
        hint="Shown on the unit so the team knows when to expect it back."
        error={errors.until}
        show={tried}
      >
        <Input
          {...fieldA11y('ol-until', errors.until, tried, true)}
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
        />
      </Field>
      <Field id="ol-note" label="Note" optional={reason !== 'other'} error={errors.note} show={tried}>
        <Textarea
          {...fieldA11y('ol-note', errors.note, tried)}
          rows={3}
          placeholder="Scope of work, vendor, insurance claim number…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
    </RosterDialogFrame>
  );
}
