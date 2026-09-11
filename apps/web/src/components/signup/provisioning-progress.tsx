'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  Layers,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProvisioningStatusResponse {
  status: 'pending' | 'provisioning' | 'completed' | 'consumed' | 'failed';
  step: string;
  loginToken?: string;
  communityId?: number;
}

interface Stage {
  label: string;
  Icon: React.ElementType;
}

const STAGES: Stage[] = [
  { label: 'Creating your portal', Icon: Layers },
  { label: 'Setting up compliance tools', Icon: ShieldCheck },
  { label: 'Finalizing your account', Icon: Sparkles },
];

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
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash: loginToken, type: 'magiclink' });
      if (error) {
        router.push('/auth/login?message=portal-ready');
        return;
      }
      router.push(communityId ? `/dashboard?communityId=${communityId}` : '/select-community');
    },
    [router, stopPolling],
  );

  const handleConsumed = useCallback(
    async (communityId?: number) => {
      // The single-use login token was already claimed — typically this tab
      // was refreshed (or a second tab polled first) after auto-login. If a
      // session exists, go straight in; otherwise fall back to manual login.
      stopPolling();
      const supabase = createBrowserClient();
      const { data } = await supabase.auth.getSession();
      if (data.session) {
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

  if (failed) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <div
          role="alert"
          className="rounded-[10px] border border-edge bg-status-danger-subtle border-l-4 border-l-status-danger-border p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-danger" aria-hidden="true" />
            <div>
              <p className="text-base text-content">
                Something went wrong setting up your portal. Our team has been notified — we&apos;ll
                email you when it&apos;s ready.
              </p>
              <a
                href="/auth/login"
                className="mt-3 inline-block text-sm font-medium text-interactive hover:text-interactive-hover"
              >
                Go to login
              </a>
              <div className="mt-4 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    pollCount.current = 0;
                    setFailed(false);
                    setDelayed(false);
                    startPolling();
                  }}
                  className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-interactive-hover"
                >
                  Check again
                </button>
                <a
                  href="/auth/login"
                  className="text-sm text-content-secondary transition-colors hover:text-interactive"
                >
                  Or log in manually
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (delayed) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16">
        <div
          role="status"
          className="rounded-[10px] border border-edge bg-status-warning-subtle border-l-4 border-l-status-warning-border p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-status-warning" aria-hidden="true" />
            <div>
              <p className="text-base text-content">
                Your portal is taking longer than usual to finish setting up. We&apos;re retrying
                automatically, so you don&apos;t need to start over or create another account.
              </p>
              <div className="mt-4 flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    pollCount.current = 0;
                    setFailed(false);
                    setDelayed(false);
                    startPolling();
                  }}
                  className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-interactive-hover"
                >
                  Check again
                </button>
                <a
                  href="/auth/login"
                  className="text-sm text-content-secondary transition-colors hover:text-interactive"
                >
                  Or log in manually
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <div className="rounded-[10px] border border-edge bg-surface-card p-6">
        <h1 className="text-2xl font-bold tracking-tight text-content">
          Setting up your community
        </h1>
        <p className="mt-2 text-base text-content-secondary">
          This usually takes just a few seconds.
        </p>

        <div className="mt-6 space-y-3" aria-live="polite">
          {STAGES.map((stage, index) => {
            const isCompleted = completedStages.has(index);
            const isActive = !isCompleted && activeStage === index;
            const isPending = !isCompleted && !isActive;

            return (
              <div
                key={stage.label}
                className={cn(
                  'flex items-center gap-3 rounded-[10px] px-4 py-3 transition-colors duration-250',
                  isActive && 'bg-surface-muted',
                )}
                {...(isActive ? { role: 'status' } : {})}
              >
                {isCompleted && (
                  <CheckCircle2
                    className="h-5 w-5 shrink-0 text-status-success"
                    aria-hidden="true"
                  />
                )}
                {isActive && (
                  <Loader2
                    className="h-5 w-5 shrink-0 animate-spin text-interactive motion-reduce:animate-none motion-reduce:opacity-75"
                    aria-hidden="true"
                    aria-label="Loading"
                  />
                )}
                {isPending && (
                  <CircleDashed
                    className="h-5 w-5 shrink-0 text-content-disabled"
                    aria-hidden="true"
                  />
                )}

                <span
                  className={cn(
                    'text-base',
                    isCompleted && 'text-content',
                    isActive && 'text-content font-medium',
                    isPending && 'text-content-disabled',
                  )}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
