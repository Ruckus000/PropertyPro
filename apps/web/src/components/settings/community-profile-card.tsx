'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CircleAlert } from 'lucide-react';
import {
  requiredSectionStatute,
  requirementLevel,
  unitThreshold,
  type CommunityType,
} from '@propertypro/shared';
// From the file, as settings-layout.tsx does.
import { cn } from '@propertypro/ui/utils/cn';
import { AlertBanner } from '@/components/shared/alert-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsCardHeader,
  SettingsRow,
} from '@/components/settings/settings-layout';
import { CommunityProfileCardSkeleton } from '@/components/settings/community-profile-card-skeleton';
import {
  useCommunityProfile,
  useUpdateCommunityProfile,
  type CommunityProfilePatch,
} from '@/hooks/use-community-profile';
import { useUpdateCommunityUnitCount } from '@/hooks/use-community-unit-count';
import { ApiRequestError } from '@/lib/api/request-json';
import type { CommunityProfilePayload } from '@/app/api/v1/community/profile/contract';

/**
 * The association's profile: its name (and a short name for headlines),
 * address, office hours and public contact details, plus the unit (or parcel)
 * count that decides which Florida website rules apply. Managers only, like the
 * routes it saves through.
 *
 * One Save button does the whole card:
 *   - The profile goes to `PATCH /api/v1/community/profile` as only the fields
 *     that differ from what the server holds. A box the person emptied is sent
 *     as `null`, which the server stores as "not set" and the website hides.
 *   - The count has its own route, so a changed count is a second request, sent
 *     after the first.
 *   - Each box is compared with what the server holds, not with what it held when
 *     the page loaded. If the second request fails, the first stays saved, Save
 *     stays on for what is left, and sending again repeats only that.
 *   - A saved rename refreshes the page's server-rendered parts, so the sidebar
 *     shows the new name at once.
 *
 * Nothing is published: the public site is rendered on each request, so a saved
 * change shows on its next load. The limits on the boxes mirror the route
 * contract; the server is the authority, and its reasons are shown if it refuses.
 */

/** The profile fields held in text boxes: the route's PATCH body, less the community and the count. */
type TextField = keyof CommunityProfilePatch;
type ClearableField = Exclude<TextField, 'name'>;
type Drafts = Partial<Record<TextField, string>>;

/** A field added to the route's PATCH body fails to compile until it has an entry here: the prompt to give it a box. */
const MAX_LENGTH: Record<TextField, number> = {
  name: 120,
  shortName: 60,
  addressLine1: 120,
  addressLine2: 120,
  city: 80,
  state: 2,
  zipCode: 10,
  officeHours: 200,
  contactName: 120,
  contactEmail: 254,
  contactPhone: 40,
};
const CLEARABLE_FIELDS = (Object.keys(MAX_LENGTH) as TextField[]).filter(
  (field): field is ClearableField => field !== 'name',
);

/** Bound of `PATCH /api/v1/community/unit-count` (its contract's UNIT_COUNT_MAX). */
const UNIT_COUNT_MAX = 100_000;

const NAME_REQUIRED = 'Enter your community’s name.';
const OTHERS_SAVED = 'Your other changes were saved.';

/**
 * The boxes that differ from the saved profile, as the PATCH body wants them:
 * trimmed, and `null` for a box with nothing left in it. (A state is in capitals
 * by now: `edit` upcases it as it is typed.)
 */
function collectChanges(drafts: Drafts, saved: CommunityProfilePayload) {
  const patch: CommunityProfilePatch = {};

  // The name cannot be cleared, so an emptied box is a mistake to point out, not a change to send.
  const name = drafts.name?.trim();
  const nameBlank = name === '';
  if (name !== undefined && name !== '' && name !== saved.name.trim()) patch.name = name;

  for (const field of CLEARABLE_FIELDS) {
    const text = drafts[field];
    if (text === undefined) continue;
    const next = text.trim() || null;
    if (next !== (saved[field]?.trim() || null)) patch[field] = next;
  }
  return { nameBlank, patch };
}

type CountEdit = { kind: 'same' } | { kind: 'invalid' } | { kind: 'set'; value: number };

function readCountEdit(draft: string | null, saved: number | null): CountEdit {
  if (draft === null) return { kind: 'same' };
  const text = draft.trim();
  // A count cannot go back to unknown, so an emptied box over a saved count is a mistake, not a change.
  if (text === '') return saved === null ? { kind: 'same' } : { kind: 'invalid' };
  const value = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  if (!(value >= 1 && value <= UNIT_COUNT_MAX)) return { kind: 'invalid' };
  return value === saved ? { kind: 'same' } : { kind: 'set', value };
}

/** What Florida law says about an association this size, from the saved count. No line when no website statute applies. */
function unitCountLine(communityType: CommunityType, unitCount: number | null): string | null {
  const threshold = unitThreshold(communityType);
  const statute = requiredSectionStatute(communityType);
  const level = requirementLevel({ communityType, unitCount });
  if (!threshold || !statute || level === 'none') return null;

  const law = `Florida law (${statute}) applies to associations of ${threshold.minUnits} or more ${threshold.unitNoun}.`;
  if (level === 'recommended') {
    return `${law} Yours has ${unitCount}, so its website list is a recommendation.`;
  }
  return unitCount === null
    ? `${law} Until you add your count, we treat its website rules as applying.`
    : `${law} Yours has ${unitCount}.`;
}

/**
 * The server's own words, when it said why it turned a save down: a message per
 * value for a 400, or the one sentence of a 403 (a demo past its trial, a role that
 * may not change this), for which "try again" alone could never help. Any other
 * failure has nothing a reader should be shown.
 */
function refusalReasons(error: unknown): string | undefined {
  if (!(error instanceof ApiRequestError)) return undefined;
  if (error.fields) return error.fields.map((field) => field.message).join(' ');
  return error.status === 403 ? error.message : undefined;
}

export interface CommunityProfileCardProps {
  communityId: number;
  /** Decides which Florida website rule the unit-count line explains. */
  communityType: CommunityType;
}

export function CommunityProfileCard({ communityId, communityType }: CommunityProfileCardProps) {
  const { data: profile, isError, error } = useCommunityProfile(communityId);

  // A profile already in hand wins over a failed refresh of it.
  if (profile) {
    // Keyed by community, so an edit made for one can never be saved into another.
    return (
      <ProfileForm
        key={communityId}
        communityId={communityId}
        communityType={communityType}
        profile={profile}
      />
    );
  }

  if (isError) {
    const lapsed = error instanceof ApiRequestError && error.code === 'SUBSCRIPTION_REQUIRED';
    return (
      <SettingsCard>
        <div className="px-5 py-4">
          <AlertBanner
            status="danger"
            title="We couldn't load your community profile."
            description={lapsed ? error.message : 'Please refresh the page to try again.'}
          />
        </div>
      </SettingsCard>
    );
  }

  return <CommunityProfileCardSkeleton />;
}

interface FormProps extends CommunityProfileCardProps {
  profile: CommunityProfilePayload;
}

function ProfileForm({ communityId, communityType, profile }: FormProps) {
  const router = useRouter();
  const updateProfile = useUpdateCommunityProfile(communityId);
  const updateUnitCount = useUpdateCommunityUnitCount(communityId);

  const [drafts, setDrafts] = React.useState<Drafts>({});
  const [countDraft, setCountDraft] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<{ name?: string; unitCount?: string }>({});
  const [failure, setFailure] = React.useState<{ description: string | undefined } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement>(null);
  const countRef = React.useRef<HTMLInputElement>(null);

  const noun = unitThreshold(communityType)?.unitNoun ?? 'units';
  const countLine = unitCountLine(communityType, profile.unitCount);
  const { nameBlank, patch } = collectChanges(drafts, profile);
  const countEdit = readCountEdit(countDraft, profile.unitCount);
  const changed = nameBlank || Object.keys(patch).length > 0 || countEdit.kind !== 'same';

  function edit(field: TextField, text: string) {
    setDrafts((current) => ({ ...current, [field]: field === 'state' ? text.toUpperCase() : text }));
    if (field === 'name') setErrors(({ name: _cleared, ...rest }) => rest);
  }

  /** What a ProfileField needs to show one box and take edits to it. */
  const bind = (field: TextField) => ({
    field,
    value: drafts[field] ?? profile[field] ?? '',
    readOnly: saving,
    onChange: (text: string) => edit(field, text),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !changed) return;

    const problems = {
      ...(nameBlank ? { name: NAME_REQUIRED } : {}),
      ...(countEdit.kind === 'invalid'
        ? { unitCount: `Enter a whole number of ${noun}, from 1 to ${UNIT_COUNT_MAX.toLocaleString('en-US')}.` }
        : {}),
    };
    setErrors(problems);
    if (problems.name || problems.unitCount) {
      (problems.name ? nameRef : countRef).current?.focus();
      return;
    }

    setFailure(null);
    setSaving(true);
    let profileSaved = false;
    try {
      if (Object.keys(patch).length > 0) {
        await updateProfile.mutateAsync(patch);
        profileSaved = true;
        setDrafts({});
        // The sidebar shows the community's name and is rendered on the server.
        if (patch.name !== undefined) router.refresh();
      }
      if (countEdit.kind === 'set') {
        await updateUnitCount.mutateAsync(countEdit.value);
        setCountDraft(null);
      }
      toast.success('Community profile saved.');
    } catch (cause) {
      const description = [refusalReasons(cause), profileSaved ? OTHERS_SAVED : undefined]
        .filter(Boolean)
        .join(' ');
      setFailure({ description: description || undefined });
    } finally {
      setSaving(false);
    }
  }

  const countId = 'community-profile-unit-count';
  const countDescribedBy =
    [countLine ? `${countId}-law` : null, errors.unitCount ? `${countId}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <SettingsCard>
        <FieldGroup id="community-profile-group-name" title="Name">
          <ProfileField
            {...bind('name')}
            label="Community name"
            required
            error={errors.name}
            inputRef={nameRef}
          />
          <ProfileField
            {...bind('shortName')}
            label="Short name"
            help="Used on your website instead of the full name. Leave blank to use the full name."
          />
        </FieldGroup>

        <FieldGroup
          id="community-profile-group-address"
          title="Address"
          description="Shown in the Contact section of your website."
        >
          <ProfileField {...bind('addressLine1')} label="Street address" />
          <ProfileField {...bind('addressLine2')} label="Address line 2" />
          <ProfileField {...bind('city')} label="City" className="sm:col-span-3" />
          <ProfileField {...bind('state')} label="State" className="sm:col-span-1" autoCapitalize="characters" />
          <ProfileField {...bind('zipCode')} label="ZIP code" className="sm:col-span-2" />
        </FieldGroup>

        <SettingsRow
          label={
            <Label htmlFor={countId} className="text-base">
              Number of {noun}
            </Label>
          }
          control={
            <Input
              id={countId}
              ref={countRef}
              type="number"
              inputMode="numeric"
              min={1}
              max={UNIT_COUNT_MAX}
              step={1}
              value={countDraft ?? (profile.unitCount === null ? '' : String(profile.unitCount))}
              readOnly={saving}
              onChange={(event) => {
                setCountDraft(event.target.value);
                setErrors(({ unitCount: _cleared, ...rest }) => rest);
              }}
              aria-invalid={errors.unitCount ? true : undefined}
              aria-describedby={countDescribedBy}
              className={cn('h-11 w-full sm:w-32 md:h-9', errors.unitCount && 'border-edge-error')}
            />
          }
        >
          {countLine ? (
            <p id={`${countId}-law`} className="text-sm text-content-secondary">
              {countLine}
            </p>
          ) : null}
          {errors.unitCount ? <FieldError id={`${countId}-error`}>{errors.unitCount}</FieldError> : null}
        </SettingsRow>

        <FieldGroup
          id="community-profile-group-contact"
          title="Shown on your website"
          description="Leave a field blank to hide it on your website."
        >
          <ProfileField {...bind('contactName')} label="Contact name" className="sm:col-span-3" />
          <ProfileField {...bind('contactEmail')} label="Contact email" type="email" className="sm:col-span-3" />
          <ProfileField {...bind('contactPhone')} label="Contact phone" type="tel" className="sm:col-span-3" />
          <ProfileField
            {...bind('officeHours')}
            label="Office hours"
            multiline
            placeholder="Monday to Friday, 9am to 5pm"
          />
        </FieldGroup>

        {failure ? (
          <div className="px-5 py-4">
            <AlertBanner
              status="danger"
              title="We couldn't save your changes. Please try again."
              description={failure.description}
            />
          </div>
        ) : null}

        <SettingsCardFooter note="Changes show on your website right away.">
          <Button type="submit" size="sm" className="h-11 md:h-8" disabled={!changed || saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </Button>
        </SettingsCardFooter>
      </SettingsCard>
    </form>
  );
}

/**
 * A titled run of boxes inside the card, named and described as a group so a
 * screen reader says what the boxes are for as it enters them. On wide screens a
 * six-column grid, so a field says how many columns it takes.
 */
function FieldGroup({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-labelledby={`${id}-title`}
      aria-describedby={description ? `${id}-description` : undefined}
    >
      <SettingsCardHeader
        title={title}
        description={description}
        titleId={`${id}-title`}
        descriptionId={`${id}-description`}
      />
      <div className="grid gap-4 px-5 pb-5 sm:grid-cols-6">{children}</div>
    </div>
  );
}

interface ProfileFieldProps {
  field: TextField;
  label: string;
  value: string;
  onChange: (text: string) => void;
  readOnly: boolean;
  help?: string;
  error?: string | undefined;
  /** Marks the box as one that cannot be left empty. */
  required?: boolean;
  /** Grid placement on wide screens; a field with none takes the full row. */
  className?: string;
  multiline?: boolean;
  type?: 'text' | 'email' | 'tel';
  placeholder?: string;
  autoCapitalize?: string;
  inputRef?: React.Ref<HTMLInputElement>;
}

function ProfileField({
  field,
  label,
  value,
  onChange,
  readOnly,
  help,
  error,
  required = false,
  className,
  multiline = false,
  type = 'text',
  placeholder,
  autoCapitalize,
  inputRef,
}: ProfileFieldProps) {
  const id = `community-profile-${field}`;
  const describedBy =
    [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  const shared = {
    id,
    value,
    readOnly,
    placeholder,
    autoCapitalize,
    maxLength: MAX_LENGTH[field],
    // These describe the association, not the person filling the form in.
    autoComplete: 'off',
    'aria-required': required ? (true as const) : undefined,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': describedBy,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };

  return (
    <div className={cn('space-y-1.5 sm:col-span-6', className)}>
      <div className="flex items-baseline gap-1">
        <Label htmlFor={id}>{label}</Label>
        {required ? (
          <span aria-hidden="true" className="text-sm text-status-danger">
            *
          </span>
        ) : null}
      </div>
      {multiline ? (
        <Textarea {...shared} rows={3} className={cn(error && 'border-edge-error')} />
      ) : (
        <Input {...shared} ref={inputRef} type={type} className={cn('h-11 md:h-9', error && 'border-edge-error')} />
      )}
      {help ? (
        <p id={`${id}-help`} className="text-sm text-content-secondary">
          {help}
        </p>
      ) : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}

/** An inline problem with one box: icon and words, never colour alone. */
function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-sm text-status-danger">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
