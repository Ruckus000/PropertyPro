'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Loader2,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTypeMeta, isWebsiteRequired } from './front-porch/front-porch-data';
import { clearSignupDraft, readSignupDraft, type SignupDraft } from './front-porch/draft-storage';
import {
  FrontPorchShell,
  StepHeading,
  type CardFooter,
  type CommunityCardModel,
} from './front-porch/front-porch-shell';
import { burstConfetti } from './front-porch/motion';

interface ProvisioningStatusResponse {
  status: 'pending' | 'provisioning' | 'completed' | 'consumed' | 'failed';
  step: string;
  loginToken?: string;
  communityId?: number;
}

function stageLabels(isApartment: boolean): string[] {
  return [
    'Creating your portal',
    isApartment ? 'Setting up resident tools' : 'Setting up compliance tools',
    'Finalizing your account',
  ];
}

/**
 * The community card on the setting-up and live screens, rebuilt from the
 * answers the signup flow left in sessionStorage (same tab — Stripe's return is
 * a same-tab redirect). The form flow leaves none, so its card shows the
 * placeholder rows instead.
 */
function cardFromDraft(draft: Partial<SignupDraft> | null, footer: CardFooter): CommunityCardModel {
  const type = draft?.communityType ?? null;
  const meta = type ? getTypeMeta(type) : null;
  const units = Number.parseInt(draft?.unitCount ?? '', 10);
  const hasUnits = Number.isFinite(units) && units > 0;
  return {
    name: draft?.communityName?.trim() || null,
    type,
    typeBadge: meta?.badge ?? null,
    rows: [
      {
        key: 'addr',
        text: draft?.addressLine1
          ? [draft.addressLine1, draft.city].filter(Boolean).join(', ') + (draft.county ? ` · ${draft.county} County` : '')
          : null,
      },
      {
        key: 'units',
        text: hasUnits && meta && type
          ? `${units} ${meta.noun}${type === 'apartment' ? '' : isWebsiteRequired(type, units) ? ' · website required' : ' · website optional'}`
          : null,
      },
      { key: 'url', text: draft?.submittedSlug ? `${draft.submittedSlug}.getpropertypro.com` : null, mono: true },
      { key: 'plan', text: null },
    ],
    footer,
  };
}

const MAX_POLLS = 180; // 6 minutes before showing delayed/retry messaging
const POLL_INTERVAL_MS = 2000;
/*
 * Consecutive non-OK responses tolerated before surfacing the delayed state.
 *
 * `if (!res.ok) return;` treated a 429 and a 500 exactly like "still
 * provisioning", so a persistent fault span looked identical to slow work and
 * the user watched a progress bar that could never advance. The sibling signup
 * poll had the same line and its own version of this incident on 2026-09-11.
 *
 * Provisioning is genuinely async and a single blip should not derail it, so
 * this tolerates two and surfaces on the third — about 6 seconds. `handleDelayed`
 * already renders "Check again", which resets `pollCount` and restarts.
 */
const MAX_CONSECUTIVE_FAILURES = 3;

function mapProvisioningStep(step: string): number {
  if (['community_created', 'user_linked'].includes(step)) return 0;
  if (['checklist_generated', 'categories_created', 'preferences_set'].includes(step)) return 1;
  if (['email_sent', 'completed'].includes(step)) return 2;
  return 0;
}

interface ProvisioningProgressProps {
  signupRequestId: string;
}

export function ProvisioningProgress({ signupRequestId }: ProvisioningProgressProps) {
  const router = useRouter();
  const [activeStage, setActiveStage] = useState(0);
  const [completedStages, setCompletedStages] = useState<Set<number>>(new Set());
  const [failed, setFailed] = useState(false);
  const [delayed, setDelayed] = useState(false);
  const [live, setLive] = useState<{ communityId?: number } | null>(null);
  const [draft, setDraft] = useState<Partial<SignupDraft> | null>(null);
  const liveBadgeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setDraft(readSignupDraft());
  }, []);
  const pollCount = useRef(0);
  const consecutiveFailures = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const handleComplete = useCallback(
    async (loginToken: string, communityId?: number) => {
      stopPolling();
      try {
        const { createBrowserClient } = await import('@/lib/supabase/client');
        const { error } = await createBrowserClient().auth.verifyOtp({ token_hash: loginToken, type: 'magiclink' });
        if (error) throw error;
      } catch {
        // Includes the client chunk failing to load: polling has stopped, so
        // anything but a navigation leaves the user on a finished spinner.
        router.push('/auth/login?message=portal-ready');
        return;
      }
      // Signed in. Show "live" before the dashboard: it is the moment the
      // design celebrates, and the user chooses when to leave it.
      setLive({ communityId });
    },
    [router, stopPolling],
  );

  useEffect(() => {
    if (!live) return;
    clearSignupDraft();
    burstConfetti(liveBadgeRef.current);
  }, [live]);

  const handleConsumed = useCallback(
    async (communityId?: number) => {
      // The single-use login token was already claimed — typically this tab
      // was refreshed (or a second tab polled first) after auto-login. If a
      // session exists, go straight in; otherwise fall back to manual login.
      stopPolling();
      const session = await import('@/lib/supabase/client')
        .then(({ createBrowserClient }) => createBrowserClient().auth.getSession())
        .then(({ data }) => data.session)
        .catch(() => null);
      if (session) {
        router.push(communityId ? `/dashboard?communityId=${communityId}` : '/select-community');
        return;
      }
      router.push('/auth/login?message=portal-ready');
    },
    [router, stopPolling],
  );

  const handleFailure = useCallback(() => {
    stopPolling();
    setFailed(true);
  }, [stopPolling]);

  const handleDelayed = useCallback(() => {
    stopPolling();
    setDelayed(true);
  }, [stopPolling]);

  const poll = useCallback(async () => {
    pollCount.current += 1;

    if (pollCount.current > MAX_POLLS) {
      handleDelayed();
      return;
    }

    try {
      const res = await fetch(
        `/api/v1/auth/provisioning-status?signupRequestId=${encodeURIComponent(signupRequestId)}`,
      );
      if (!res.ok) {
        consecutiveFailures.current += 1;
        if (consecutiveFailures.current >= MAX_CONSECUTIVE_FAILURES) {
          handleDelayed();
        }
        return;
      }
      consecutiveFailures.current = 0;
      const json = (await res.json()) as { data?: ProvisioningStatusResponse };
      const data = json.data;
      if (!data) return;

      if (data.status === 'pending') {
        // Webhook hasn't fired yet — show first stage as active, keep polling
        setActiveStage(0);
        return;
      }

      if (data.status === 'provisioning') {
        const stage = mapProvisioningStep(data.step);
        setActiveStage(stage);
        setCompletedStages(new Set(Array.from({ length: stage }, (_, i) => i)));
        return;
      }

      if (data.status === 'completed' && data.loginToken) {
        // Mark all stages complete before navigating
        setCompletedStages(new Set([0, 1, 2]));
        await handleComplete(data.loginToken, data.communityId);
        return;
      }

      if (data.status === 'consumed') {
        setCompletedStages(new Set([0, 1, 2]));
        await handleConsumed(data.communityId);
        return;
      }

      if (data.status === 'failed') {
        handleFailure();
      }
    } catch {
      // A fetch rejection is the same class of fault as a 5xx — offline, DNS,
      // an aborted request. Counted the same way so it cannot spin silently.
      consecutiveFailures.current += 1;
      if (consecutiveFailures.current >= MAX_CONSECUTIVE_FAILURES) {
        handleDelayed();
      }
    }
  }, [signupRequestId, handleComplete, handleConsumed, handleFailure, handleDelayed]);

  const startPolling = useCallback(() => {
    stopPolling();
    consecutiveFailures.current = 0;
    void poll();
    intervalRef.current = setInterval(() => void poll(), POLL_INTERVAL_MS);
  }, [poll, stopPolling]);

  useEffect(() => {
    startPolling();
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const isApartment = draft?.communityType === 'apartment';
  const name = draft?.communityName?.trim() || 'your community';
  const stages = useMemo(() => stageLabels(isApartment), [isApartment]);
  const dashboardHref = live?.communityId ? `/dashboard?communityId=${live.communityId}` : '/select-community';
  const portalHost = draft?.submittedSlug ? `${draft.submittedSlug}.getpropertypro.com` : null;

  function retry() {
    pollCount.current = 0;
    setFailed(false);
    setDelayed(false);
    startPolling();
  }

  if (live) {
    return (
      <FrontPorchShell card={cardFromDraft(draft, { kind: 'live' })}>
        <div className="flex flex-col items-start gap-6 pt-6">
          <span
            ref={liveBadgeRef}
            className="fp-enter flex h-20 w-20 items-center justify-center rounded-full bg-status-success-subtle text-status-success"
          >
            <CheckCircle2 className="h-10 w-10" aria-hidden="true" />
          </span>
          <StepHeading
            eyebrow="You're live"
            title={`${draft?.communityName?.trim() || 'Your community'} is live.`}
            lede={
              portalHost ? (
                <>
                  Your portal is at <span className="font-mono text-base text-content-link">{portalHost}</span>. Next,
                  post your first document — your dashboard walks you through it.
                </>
              ) : (
                'Next, post your first document — your dashboard walks you through it.'
              )
            }
          />
          <div className="fp-enter flex flex-wrap gap-3" style={{ animationDelay: '160ms' }}>
            <button
              type="button"
              onClick={() => router.push(dashboardHref)}
              className="inline-flex h-12 items-center gap-2 whitespace-nowrap rounded-md bg-interactive px-6 text-base font-semibold text-content-inverse shadow-e1 hover:bg-interactive-hover"
            >
              Go to your dashboard
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            {portalHost ? (
              <a
                href={`https://${portalHost}`}
                className="inline-flex h-12 items-center gap-2 rounded-md border border-edge bg-surface-card px-5 text-base font-medium text-content hover:bg-surface-hover"
              >
                Visit your portal
              </a>
            ) : null}
          </div>
        </div>
      </FrontPorchShell>
    );
  }

  const card = cardFromDraft(draft, failed ? null : { kind: 'provisioning' });

  return (
    <FrontPorchShell card={card}>
      <div className="flex flex-col gap-7 pt-6">
        <StepHeading
          title={failed ? 'Setup did not finish' : `Setting up ${name}`}
          lede={
            failed
              ? `Something went wrong on our end while setting up ${name}.`
              : 'This usually takes just a few seconds.'
          }
        />
        <div className="flex flex-col gap-2" aria-live="polite">
          {stages.map((label, index) => {
            const isCompleted = completedStages.has(index);
            const isActive = !isCompleted && activeStage === index && !failed;
            const isFailed = failed && !isCompleted && activeStage === index;
            const isPending = !isCompleted && !isActive && !isFailed;

            return (
              <div
                key={label}
                className={cn(
                  'fp-enter flex items-center gap-3 rounded-md px-4 py-3.5 transition-colors duration-200',
                  isActive && 'bg-surface-muted',
                  isFailed && 'bg-status-danger-bg',
                )}
                style={{ animationDelay: `${index * 80}ms` }}
                {...(isActive ? { role: 'status' } : {})}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-status-success" aria-hidden="true" />
                ) : null}
                {isActive ? (
                  <Loader2
                    className="h-5 w-5 shrink-0 animate-spin text-interactive motion-reduce:animate-none motion-reduce:opacity-75"
                    aria-hidden="true"
                  />
                ) : null}
                {isFailed ? <XCircle className="h-5 w-5 shrink-0 text-status-danger" aria-hidden="true" /> : null}
                {isPending ? <CircleDashed className="h-5 w-5 shrink-0 text-content-disabled" aria-hidden="true" /> : null}
                <span
                  className={cn(
                    'text-base',
                    isCompleted && 'text-content',
                    (isActive || isFailed) && 'font-semibold text-content',
                    isPending && 'text-content-disabled',
                  )}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {failed ? (
          <div role="alert" className="flex flex-col gap-4 rounded-md border border-status-danger-border bg-status-danger-bg p-4">
            <div className="flex gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-status-danger" aria-hidden="true" />
              <div>
                <div className="text-base font-semibold text-content">
                  Nothing was charged, and your answers are saved.
                </div>
                <div className="mt-0.5 text-sm text-content-secondary">
                  Try again in a moment. If it keeps happening, contact support and we will finish setup for you.
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={retry}
                className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-md bg-interactive px-6 text-base font-semibold text-content-inverse shadow-e1 hover:bg-interactive-hover"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Try again
              </button>
              <Link
                href="/contact?from=signup-setup"
                className="inline-flex h-11 items-center gap-2 rounded-md border border-edge bg-surface-card px-5 text-base font-medium text-content hover:bg-surface-hover"
              >
                Contact support
              </Link>
            </div>
          </div>
        ) : null}

        {delayed ? (
          <div role="status" className="flex flex-col gap-4 rounded-md border border-status-warning-border bg-status-warning-bg p-4">
            <p className="m-0 text-base text-content">
              Your portal is taking longer than usual to finish setting up. We&apos;re retrying automatically, so you
              don&apos;t need to start over or create another account.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={retry}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-interactive px-5 text-base font-semibold text-content-inverse hover:bg-interactive-hover"
              >
                Check again
              </button>
              <Link href="/auth/login" className="text-sm text-content-secondary hover:text-content-link">
                Or log in manually
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </FrontPorchShell>
  );
}
