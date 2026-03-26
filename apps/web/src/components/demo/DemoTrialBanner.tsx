'use client';

/**
 * DemoTrialBanner — Adaptive bottom bar for demo sessions.
 *
 * Replaces the original DemoBanner with trial lifecycle awareness.
 * Shows three distinct states:
 *   - Active Trial: role switcher + progress bar + "Upgrade" CTA
 *   - Grace Period: warning + days-until-lockout + "Subscribe Now" CTA
 *   - Converted / Expired: not rendered
 */

import { AlertTriangle } from 'lucide-react';
import type { CommunityType, DemoLifecycleStatus } from '@propertypro/shared';

export interface DemoTrialBannerProps {
  /** Whether the current session is a demo. When false, nothing renders. */
  isDemoMode: boolean;
  /** The active demo role — derived from user email pattern. */
  currentRole: 'board' | 'resident';
  /** Demo instance slug — used for the switch/exit/upgrade URLs. */
  slug: string;
  /** Lifecycle status computed from trial/expiry timestamps. */
  status: DemoLifecycleStatus;
  /** When the trial period ends. */
  trialEndsAt: Date | null;
  /** When the demo expires (hard lockout boundary). */
  demoExpiresAt: Date | null;
  /** Community type — determines available upgrade plans. */
  communityType: CommunityType;
}

const ROLE_LABELS: Record<'board' | 'resident', string> = {
  board: 'Board Member',
  resident: 'Resident',
};

function daysUntil(target: Date): number {
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function trialProgress(trialEndsAt: Date, demoExpiresAt: Date): number {
  // Total trial period is from (demo_expires_at - 21 days) to trial_ends_at
  // But we don't have the created_at. Derive: created = trial_ends_at - 14 days (default)
  // For backfilled demos this may show >100%, so clamp.
  const totalTrialMs = 14 * 24 * 60 * 60 * 1000; // default 14-day trial
  const now = new Date();
  // createdAt estimate: trialEndsAt - 14 days
  const createdAt = new Date(trialEndsAt.getTime() - totalTrialMs);
  const elapsed = now.getTime() - createdAt.getTime();
  const progress = elapsed / totalTrialMs;
  return Math.min(1, Math.max(0, progress));
}

export function DemoTrialBanner({
  isDemoMode,
  currentRole,
  slug,
  status,
  trialEndsAt,
  demoExpiresAt,
  communityType,
}: DemoTrialBannerProps) {
  if (!isDemoMode) return null;
  if (status === 'converted' || status === 'expired') return null;

  const upgradePath = `/demo/${slug}/upgrade`;

  if (status === 'grace_period') {
    const daysLeft = demoExpiresAt ? daysUntil(demoExpiresAt) : 0;
    const daysText = daysLeft === 1 ? '1 day' : `${daysLeft} days`;

    return (
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex h-12 items-center justify-between gap-4 bg-red-900 px-4 text-sm text-white sm:justify-center"
        role="status"
        aria-label="Demo trial expired — limited access"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} aria-hidden="true" className="shrink-0 text-red-200" />
          <span className="text-red-100">
            Limited access — some features disabled
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-red-200 sm:inline">
            {daysText} until lockout
          </span>
          <a
            href={upgradePath}
            className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-red-900 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-red-900"
          >
            Subscribe Now
          </a>
        </div>
      </div>
    );
  }

  // Active trial state
  const oppositeRole = currentRole === 'board' ? 'resident' : 'board';
  const enterPath = `/api/v1/demo/${slug}/enter`;
  const exitPath = `/demo/${slug}`;
  const daysLeft = trialEndsAt ? daysUntil(trialEndsAt) : 0;
  const daysText = daysLeft === 1 ? '1 day left' : `${daysLeft} days left`;
  const progress = trialEndsAt && demoExpiresAt
    ? trialProgress(trialEndsAt, demoExpiresAt)
    : 0;
  const progressPct = Math.round(progress * 100);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 flex h-12 items-center justify-between gap-3 bg-gray-900/90 px-4 text-sm text-white backdrop-blur-sm"
      role="status"
      aria-label="Demo session banner"
    >
      {/* Left: role + switch */}
      <div className="flex items-center gap-3">
        <span className="hidden opacity-80 sm:inline">
          Viewing as <strong className="font-semibold">{ROLE_LABELS[currentRole]}</strong>
        </span>

        <form action={enterPath} method="POST" className="inline">
          <input type="hidden" name="role" value={oppositeRole} />
          <button
            type="submit"
            className="rounded border border-white/40 px-2.5 py-0.5 text-xs font-medium text-white transition-colors hover:border-white/70 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            Switch to {ROLE_LABELS[oppositeRole]}
          </button>
        </form>

        <a
          href={exitPath}
          className="text-xs text-white/60 underline underline-offset-2 transition-colors hover:text-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
          Exit
        </a>
      </div>

      {/* Right: progress + days + upgrade */}
      <div className="flex items-center gap-3">
        {trialEndsAt && (
          <>
            <div
              className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-white/20 sm:block"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Trial progress: ${progressPct}%`}
            >
              <div
                className="h-full rounded-full bg-blue-400 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs text-white/70">{daysText}</span>
          </>
        )}
        <a
          href={upgradePath}
          className="rounded-md bg-blue-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900"
        >
          Upgrade
        </a>
      </div>
    </div>
  );
}
