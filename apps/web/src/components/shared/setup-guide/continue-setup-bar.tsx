'use client';

/**
 * ContinueSetupBar — the "Partial" state (spec §4.3): once the first item
 * exists the real page renders, with this one line above it until setup is
 * done or dismissed.
 *
 * "Continue setup" is outline: the page's own primary is back, and two filled
 * buttons a row apart compete. Dismissal is remembered per community in this
 * browser (plan D14, the compliance-onboarding precedent).
 * ponytail: dismissal is per browser, not per account. Trigger: a manager
 * reports the bar coming back on another device.
 */

import * as React from 'react';
import { X } from 'lucide-react';
import { ProgressRing } from '@propertypro/ui';
import { Button } from '@/components/ui/button';

const dismissKey = (surface: string, communityId: number) =>
  `propertypro:setup-dismissed:${surface}:${communityId}`;

/**
 * Whether this browser dismissed the bar for one surface of one community.
 * Starts `true` (hidden) so the bar never flashes before storage is read.
 */
export function useSetupDismissed(surface: string, communityId: number) {
  const key = dismissKey(surface, communityId);
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(key);
    } catch {
      // Storage blocked (private mode, policy): show the bar.
    }
    setDismissed(stored === 'true');
  }, [key]);

  const dismiss = React.useCallback(() => {
    try {
      localStorage.setItem(key, 'true');
    } catch {
      // Storage blocked: the dismissal lasts for this view only.
    }
    setDismissed(true);
  }, [key]);

  const restore = React.useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage blocked: nothing was stored.
    }
    setDismissed(false);
  }, [key]);

  return { dismissed, dismiss, restore };
}

export interface ContinueSetupBarProps {
  done: number;
  total: number;
  /** "required posted" */
  countLabel: string;
  /** The next item, e.g. "Annual Budget". */
  next?: string;
  onContinue: () => void;
  onDismiss: () => void;
}

export function ContinueSetupBar({ done, total, countLabel, next, onContinue, onDismiss }: ContinueSetupBarProps) {
  const titleId = React.useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-md border border-edge bg-surface-card px-4 py-3"
    >
      <ProgressRing done={done} total={total} />
      <div className="flex min-w-0 flex-[1_1_20rem] flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={titleId} className="text-sm font-semibold text-content">
          Continue setup
        </h2>
        <p className="text-sm text-content-secondary">
          <b className="font-semibold tabular-nums text-content">
            {done} of {total}
          </b>{' '}
          {countLabel}
          {next && ` · Next: ${next}`}
        </p>
      </div>
      <Button variant="outline" onClick={onContinue}>
        Continue setup
      </Button>
      <Button variant="ghost" size="icon" onClick={onDismiss} aria-label="Hide setup for now">
        <X aria-hidden="true" />
      </Button>
    </section>
  );
}
