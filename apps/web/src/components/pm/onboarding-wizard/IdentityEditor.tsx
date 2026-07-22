'use client';

/**
 * Step 3 of the onboarding wizard — community identity.
 *
 * Ships the tagline field + hero image upload (spec §4.1 Step 3 — hero image
 * rides the §2.8 presign/finalize pipeline). Logo upload and community-name
 * edit land in a follow-up slice.
 *
 * Tagline persists to communities.branding.tagline via the wizard PATCH
 * endpoint; the hero image persists into the hero block via HeroImageField.
 */
import { useState } from 'react';
import { useWebsiteWizard } from '@/hooks/use-website-wizard';
import { HeroImageField } from './HeroImageField';

const TAGLINE_MAX = 80;
const TAGLINE_SOFT_WARN = 60;

const NAME_MAX = 200;

interface Props {
  communityId: number;
  /** Current community name — pre-fills the editable name field. */
  initialName?: string | null;
  /** Initial tagline value if the wizard is being resumed. */
  initialTagline?: string | null;
  /** Used to surface the year in the placeholder ("welcoming Florida community since {year}"). */
  establishedYear?: number | null;
  /** Hero headline fallback when no hero block content exists yet (schema requires one). */
  heroFallbackHeadline?: string;
  /** Called when the user advances to Step 4. */
  onContinue?: (tagline: string | null) => void;
  /** Called when the user clicks "Skip — keep default". */
  onSkip?: () => void;
}

export function IdentityEditor({
  communityId,
  initialName,
  initialTagline,
  establishedYear,
  heroFallbackHeadline = 'Welcome',
  onContinue,
  onSkip,
}: Props) {
  const [name, setName] = useState<string>(initialName ?? '');
  const [tagline, setTagline] = useState<string>(initialTagline ?? '');
  const [outcome, setOutcome] = useState<string | null>(null);
  const wizard = useWebsiteWizard(communityId);

  const nameTrimmed = name.trim();
  const nameEmpty = nameTrimmed.length === 0;
  const nameTooLong = nameTrimmed.length > NAME_MAX;

  const trimmed = tagline.trim();
  const charCount = trimmed.length;
  const overSoft = charCount > TAGLINE_SOFT_WARN;
  const overHard = charCount > TAGLINE_MAX;

  const placeholder = establishedYear
    ? `A welcoming Florida community since ${establishedYear}`
    : 'A welcoming Florida community';

  async function handleContinue() {
    if (overHard) {
      setOutcome(`Tagline must be ${TAGLINE_MAX} characters or fewer.`);
      return;
    }
    if (nameEmpty) {
      setOutcome('Community name is required.');
      return;
    }
    if (nameTooLong) {
      setOutcome(`Community name must be ${NAME_MAX} characters or fewer.`);
      return;
    }
    setOutcome(null);
    // Empty tagline writes null (= unset) so the user can clear it.
    const payload = trimmed.length === 0 ? null : trimmed;
    try {
      await wizard.mutateAsync({
        tagline: payload,
        // Only send the name when it actually changed, so unchanged Continues
        // don't write communities.name or emit an audit entry.
        ...(nameTrimmed !== (initialName ?? '').trim() ? { name: nameTrimmed } : {}),
      });
      onContinue?.(payload);
    } catch (err) {
      setOutcome(err instanceof Error ? err.message : 'Failed to save identity.');
    }
  }

  return (
    <section
      aria-labelledby="wizard-step-3-heading"
      data-testid="identity-editor"
      className="rounded-md border border-default bg-surface-card p-6 shadow-e0"
    >
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-content-secondary">
          Step 3 of 5
        </p>
        <h2 id="wizard-step-3-heading" className="mt-1 text-xl font-semibold text-content">
          Add your community identity
        </h2>
        <p className="mt-1 text-sm text-content-secondary">
          Your community name and a short tagline shown on your public site.
        </p>
      </div>

      <div className="mb-4 space-y-1">
        <label htmlFor="wizard-community-name" className="block text-sm font-medium text-content">
          Community name <span className="text-error">*</span>
        </label>
        <input
          id="wizard-community-name"
          data-testid="wizard-community-name-input"
          type="text"
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          aria-invalid={nameEmpty || nameTooLong ? 'true' : undefined}
          aria-describedby="wizard-community-name-help"
          className={`w-full rounded-md border bg-surface-card px-3 py-2 text-base text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive ${
            nameEmpty || nameTooLong ? 'border-error' : 'border-default'
          }`}
        />
        <p id="wizard-community-name-help" className="text-xs text-content-secondary">
          The official name shown to residents and visitors.
        </p>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="wizard-tagline"
          className="block text-sm font-medium text-content"
        >
          Tagline
        </label>
        <textarea
          id="wizard-tagline"
          data-testid="wizard-tagline-input"
          rows={2}
          maxLength={TAGLINE_MAX * 2 /* allow paste-and-trim */}
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder={placeholder}
          aria-describedby="wizard-tagline-counter wizard-tagline-help"
          aria-invalid={overHard ? 'true' : undefined}
          className={`w-full rounded-md border bg-surface-card px-3 py-2 text-base text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive ${
            overHard ? 'border-error' : 'border-default'
          }`}
        />
        <div className="flex items-center justify-between gap-2 text-xs">
          <p id="wizard-tagline-help" className="text-content-secondary">
            One sentence. {TAGLINE_MAX}-character cap.
          </p>
          <p
            id="wizard-tagline-counter"
            data-testid="wizard-tagline-counter"
            className={`tabular-nums ${
              overHard
                ? 'text-error font-medium'
                : overSoft
                  ? 'text-warning-strong font-medium'
                  : 'text-content-secondary'
            }`}
            aria-live="polite"
          >
            {charCount} / {TAGLINE_MAX}
          </p>
        </div>
      </div>

      <div className="mt-6 border-t border-default pt-4">
        <HeroImageField communityId={communityId} fallbackHeadline={heroFallbackHeadline} />
      </div>

      <p className="mt-4 rounded-md border border-default bg-surface-subtle p-3 text-xs text-content-secondary">
        <strong className="font-medium text-content">Logo:</strong> coming next. It rides on the
        branding upload flow and lands in a follow-up update.
      </p>

      <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={onSkip}
          className="text-sm font-medium text-content-secondary hover:text-content underline underline-offset-2"
        >
          Skip — keep default
        </button>
        <div className="flex items-center gap-3">
          {outcome && (
            <span role="alert" className="text-sm text-error">
              {outcome}
            </span>
          )}
          <button
            type="button"
            onClick={handleContinue}
            disabled={wizard.isPending || overHard || nameEmpty || nameTooLong}
            className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 disabled:cursor-not-allowed hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
          >
            {wizard.isPending ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </section>
  );
}
