'use client';

/**
 * Step 4 of the onboarding wizard — welcome message.
 *
 * The hero block's subtitle field is the "body" that renders below the
 * headline. v1 ships the textarea + counter; the suggested-copy expander
 * + live preview from spec §4.1 Step 4 land in subsequent slices.
 *
 * Persists via the existing PATCH /api/v1/pm/site/hero (PR #1b/#8e),
 * which now writes as a draft thanks to PR #8e.
 */
import { useEffect, useRef, useState } from 'react';
import { useHeroBlock, useUpdateHeroBlock } from '@/hooks/use-hero-block';
import type { HeroBlockContent } from '@propertypro/shared';
import { carryHeroImagery } from '@/lib/site-editor/hero-imagery';

const BODY_MAX = 280;
const BODY_SOFT_WARN = 200;

interface Props {
  communityId: number;
  /** Fallback headline used when the community has no hero saved yet. */
  defaultHeadline?: string;
  /** Called when the user advances to Step 5. */
  onContinue?: (subtitle: string) => void;
  /** Called when the user clicks "Skip — keep default". */
  onSkip?: () => void;
}

export function WelcomeMessageEditor({
  communityId,
  defaultHeadline = 'Welcome',
  onContinue,
  onSkip,
}: Props) {
  const heroQuery = useHeroBlock(communityId);
  const updateHero = useUpdateHeroBlock(communityId);

  const [body, setBody] = useState<string>('');
  const [outcome, setOutcome] = useState<string | null>(null);
  // Seed the textarea from the persisted subtitle once heroQuery resolves
  // and the user hasn't started typing. Subsequent refetches (e.g. after
  // save) don't overwrite a user mid-edit.
  const userHasTyped = useRef(false);
  useEffect(() => {
    if (!userHasTyped.current && heroQuery.data) {
      setBody(heroQuery.data.subtitle ?? '');
    }
  }, [heroQuery.data]);

  const trimmed = body.trim();
  const charCount = trimmed.length;
  const overSoft = charCount > BODY_SOFT_WARN;
  const overHard = charCount > BODY_MAX;

  async function handleContinue() {
    if (overHard) {
      setOutcome(`Welcome message must be ${BODY_MAX} characters or fewer.`);
      return;
    }
    setOutcome(null);
    // Compose a full hero payload: keep all existing fields, replace
    // subtitle. If subtitle is empty, drop the field (it's optional).
    //
    // Imagery goes through `carryHeroImagery` rather than being spelled out
    // here — this allowlist silently dropped `photos` when that field was
    // added, so saving a welcome message destroyed the PM's whole gallery.
    const existing = heroQuery.data ?? null;
    const payload: HeroBlockContent = {
      headline: existing?.headline ?? defaultHeadline,
      ...(existing?.ctaText && existing?.ctaTarget
        ? { ctaText: existing.ctaText, ctaTarget: existing.ctaTarget }
        : {}),
      ...carryHeroImagery(existing),
      ...(trimmed.length > 0 ? { subtitle: trimmed } : {}),
    };
    try {
      await updateHero.mutateAsync(payload);
      onContinue?.(trimmed);
    } catch (err) {
      setOutcome(err instanceof Error ? err.message : 'Failed to save welcome message.');
    }
  }

  return (
    <section
      aria-labelledby="wizard-step-4-heading"
      data-testid="welcome-message-editor"
      className="rounded-md border border-edge bg-surface-card p-6 shadow-e0"
    >
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-content-secondary">
          Step 4 of 5
        </p>
        <h2 id="wizard-step-4-heading" className="mt-1 text-xl font-semibold text-content">
          Welcome message
        </h2>
        <p className="mt-1 text-sm text-content-secondary">
          One paragraph beneath your hero headline. Keep it warm and useful.
        </p>
      </div>

      <div className="space-y-1">
        <label
          htmlFor="wizard-welcome-body"
          className="block text-sm font-medium text-content"
        >
          Body
        </label>
        <textarea
          id="wizard-welcome-body"
          data-testid="wizard-welcome-input"
          rows={4}
          maxLength={BODY_MAX * 2 /* allow paste-and-trim */}
          value={body}
          onChange={(e) => {
            userHasTyped.current = true;
            setBody(e.target.value);
          }}
          placeholder="Welcome to {community}, a vibrant Florida community. Find documents, meeting notices, and resident resources here."
          aria-describedby="wizard-welcome-counter wizard-welcome-help"
          aria-invalid={overHard ? 'true' : undefined}
          className={`w-full rounded-md border bg-surface-card px-3 py-2 text-base text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive ${
            overHard ? 'border-edge-error' : 'border-edge'
          }`}
        />
        <div className="flex items-center justify-between gap-2 text-xs">
          <p id="wizard-welcome-help" className="text-content-secondary">
            {BODY_MAX}-character cap. We&apos;ll warn you at {BODY_SOFT_WARN}.
          </p>
          <p
            id="wizard-welcome-counter"
            data-testid="wizard-welcome-counter"
            className={`tabular-nums ${
              overHard
                ? 'text-status-danger font-medium'
                : overSoft
                  ? 'text-status-warning font-medium'
                  : 'text-content-secondary'
            }`}
            aria-live="polite"
          >
            {charCount} / {BODY_MAX}
          </p>
        </div>
      </div>

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
            <span role="alert" className="text-sm text-status-danger">
              {outcome}
            </span>
          )}
          <button
            type="button"
            onClick={handleContinue}
            disabled={updateHero.isPending || heroQuery.isLoading || overHard}
            className="inline-flex items-center rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse disabled:opacity-50 disabled:cursor-not-allowed hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
          >
            {updateHero.isPending ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </section>
  );
}
