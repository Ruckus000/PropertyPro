'use client';

/**
 * The confirmation dialog in front of every subscription write.
 *
 * These five POSTs are the only code in this console that moves money, and the
 * route layer refuses any body without `confirm: true` (`CONFIRM_FIELD` in
 * `lib/api/billing-action-route.ts`). This component is the only thing in the
 * app that sets it: an operator reaches a `confirm: true` by reading a
 * consequence sentence and pressing Confirm, and there is no other path.
 *
 * ## Why the Confirm click calls `preventDefault()`
 *
 * Radix's `AlertDialogAction` closes the dialog on click. Every failure here —
 * a Stripe mode refusal, an unknown coupon, a plan with no configured price —
 * is a sentence the operator has to read, and a dialog that unmounted while the
 * POST was still in flight would throw that sentence away. So the click is
 * suppressed and the dialog closes itself, from `submit`, only on success.
 *
 * ## The refusal a reviewer will actually see
 *
 * `docs/LAUNCH-BLOCKERS.md` records this repo's Stripe as TEST mode while
 * `STRIPE_EXPECTED_LIVEMODE` defaults to LIVE, so in this environment all five
 * actions answer 503 `STRIPE_MODE_MISMATCH` and nothing reaches Stripe. That is
 * the normal state here, not a crash, and the server's own message names the
 * variable and both modes — so this renders `error.message` verbatim and only
 * supplies the headline. The generic "An unexpected error occurred" string
 * belongs to `withAdminErrorHandler`'s unknown-error branch alone; if it ever
 * shows up on this screen, something genuinely unhandled happened.
 *
 * ## Idempotency, stated accurately
 *
 * Each action's Stripe call carries a key derived from (subscription, action,
 * request input) — see `billing-actions.ts` §2, which is the authority. Four of
 * the five add a 60-second bucket, so two DISTINCT intents for one of those
 * actions inside one minute collide and the second silently replays the first.
 * `change-plan` has no bucket at all, so a repeat of the SAME plan change
 * replays for a full 24 hours; that is deliberate, because its duplicate is a
 * second proration invoice.
 *
 * Nothing in this dialog invites either collision: Confirm is disabled while a
 * request is in flight, a success closes the dialog, and a failure offers no
 * retry button. The UI deliberately says nothing about the window rather than
 * saying something imprecise about it.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLAN_IDS, planLabel } from '@propertypro/shared';
import {
  AlertBanner,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  buttonVariants,
} from '@propertypro/ui';

/** One of the five action routes, named by its path segment. */
export type BillingAction =
  | 'change-plan'
  | 'extend-trial'
  | 'apply-coupon'
  | 'pause'
  | 'cancel';

/** The closed set the `extend-trial` route accepts. Mirrors its schema. */
const TRIAL_DAY_OPTIONS = [7, 14, 30] as const;
type TrialDays = (typeof TRIAL_DAY_OPTIONS)[number];

const ACTION_TITLES: Record<BillingAction, string> = {
  'change-plan': 'Change plan',
  'extend-trial': 'Extend trial',
  'apply-coupon': 'Apply coupon',
  pause: 'Pause or resume collection',
  cancel: 'Cancel subscription',
};

interface BillingActionDialogProps {
  communityId: number;
  action: BillingAction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselects the plan `<select>`. Falls back to the first configured plan. */
  currentPlanId?: string | null;
  /**
   * Run after a successful write, before the dialog closes.
   *
   * `router.refresh()` alone is not enough for the Billing tab: it re-renders
   * the SERVER tree, and the tab's subscription state comes from a client-side
   * `fetch`, which a router refresh does not re-run. Optional so the dialog can
   * be rendered (and tested) on its own.
   */
  onCompleted?: () => void;
}

interface ActionError {
  code: string;
  message: string;
}

/**
 * The headline above the server's own sentence.
 *
 * Only the headline is ours — `message` is always rendered verbatim underneath,
 * so an unmapped code degrades to a generic headline over a specific sentence
 * rather than to a generic failure.
 */
function headlineFor(code: string): string {
  switch (code) {
    case 'STRIPE_MODE_MISMATCH':
      return 'Refused: the Stripe key is in the wrong mode';
    case 'STRIPE_MODE_UNKNOWN':
      return 'Refused: the Stripe key could not be identified';
    case 'STRIPE_NOT_CONFIGURED':
      return 'Stripe is not configured';
    case 'STRIPE_PRICE_CONFIG_MISSING':
      return 'No Stripe price is configured for that plan';
    case 'STRIPE_SUBSCRIPTION_EMPTY':
      return 'That subscription has nothing to change';
    case 'VALIDATION_ERROR':
    case 'BAD_REQUEST':
      return 'That request was rejected';
    case 'UNAUTHORIZED':
    case 'FORBIDDEN':
      return 'You are not allowed to do that';
    default:
      return 'The subscription was not changed';
  }
}

/** `{ error: { code, message } }` — the envelope `withAdminErrorHandler` emits. */
function readError(payload: unknown): ActionError {
  const error = (payload as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
  const message =
    typeof error?.message === 'string' && error.message.trim().length > 0
      ? error.message
      : 'The server rejected the request but gave no reason.';
  return { code, message };
}

export function BillingActionDialog({
  communityId,
  action,
  open,
  onOpenChange,
  currentPlanId,
  onCompleted,
}: BillingActionDialogProps) {
  const router = useRouter();

  const [planId, setPlanId] = useState<string>(
    currentPlanId && PLAN_IDS.includes(currentPlanId as (typeof PLAN_IDS)[number])
      ? currentPlanId
      : PLAN_IDS[0],
  );
  const [days, setDays] = useState<TrialDays>(7);
  const [coupon, setCoupon] = useState('');
  const [resume, setResume] = useState(false);
  const [atPeriodEnd, setAtPeriodEnd] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);

  /** The action's own fields, matching its route schema exactly (`.strict()`). */
  function inputForAction(): Record<string, unknown> {
    switch (action) {
      case 'change-plan':
        return { planId };
      case 'extend-trial':
        return { days };
      case 'apply-coupon':
        return { coupon: coupon.trim() };
      case 'pause':
        return { resume };
      case 'cancel':
        return { atPeriodEnd };
    }
  }

  /**
   * The POST body.
   *
   * `confirm: true` is set on the LINE BELOW, once, for all five actions —
   * deliberately not repeated into each branch above. Deleting that one key is
   * the revert that must redden every test asserting a confirmed body; five
   * copies would be five chances for the revert to miss one.
   */
  function bodyForAction(): Record<string, unknown> {
    return { confirm: true, ...inputForAction() };
  }

  /** The one-line consequence, shown before the operator can confirm. */
  function consequence(): string {
    switch (action) {
      case 'change-plan':
        return `Moves this subscription onto ${planLabel(planId)} at its current billing cadence. The price difference is invoiced immediately.`;
      case 'extend-trial':
        return `Moves the trial end out by ${days} days from the later of now and the current end. Nobody is invoiced.`;
      case 'apply-coupon':
        return 'Attaches this coupon and replaces any coupon already on the subscription. An unknown id changes nothing.';
      case 'pause':
        return resume
          ? 'Collection resumes: invoices are charged again from the next one.'
          : 'Collection pauses: invoices keep being generated and are marked uncollectible. Reversible from here.';
      case 'cancel':
        return atPeriodEnd
          ? 'Billing stops at the end of the current period. Reversible from the Stripe dashboard until then.'
          : 'The subscription stops immediately, mid-period. This cannot be undone.';
    }
  }

  async function submit(event: React.MouseEvent<HTMLButtonElement>) {
    // See the docblock: Radix would close the dialog here, taking any error
    // sentence with it. The dialog closes from the success branch below.
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/communities/${communityId}/billing/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyForAction()),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(readError(payload));
        return;
      }

      onCompleted?.();
      onOpenChange(false);
      router.refresh();
    } catch {
      // A transport failure says nothing about whether the write landed, so the
      // copy must not imply it did not — and must not invite an immediate
      // resubmit, which inside the 60s idempotency window would replay rather
      // than re-apply.
      setError({
        code: 'NETWORK',
        message:
          'The request did not complete. Check the subscription in Stripe before trying again — it may already have been applied.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  const destructive = action === 'cancel';

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{ACTION_TITLES[action]}</AlertDialogTitle>
          <AlertDialogDescription>{consequence()}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          {action === 'change-plan' && (
            <div className="space-y-1">
              <label htmlFor="billing-action-plan" className="text-sm font-medium text-content">
                Plan
              </label>
              <select
                id="billing-action-plan"
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
                className="min-h-11 w-full rounded-sm border border-edge-strong bg-surface-card px-3 text-sm text-content focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus md:min-h-9"
              >
                {PLAN_IDS.map((id) => (
                  <option key={id} value={id}>
                    {planLabel(id)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-content-tertiary">
                If this plan has no price configured for this community&rsquo;s type and billing
                cadence, the change is refused and nothing is charged.
              </p>
            </div>
          )}

          {action === 'extend-trial' && (
            <RadioGroup legend="Extend by">
              {TRIAL_DAY_OPTIONS.map((option) => (
                <Radio
                  key={option}
                  name="billing-action-days"
                  id={`billing-action-days-${option}`}
                  label={`${option} days`}
                  checked={days === option}
                  onChange={() => setDays(option)}
                />
              ))}
            </RadioGroup>
          )}

          {action === 'apply-coupon' && (
            <div className="space-y-1">
              <label htmlFor="billing-action-coupon" className="text-sm font-medium text-content">
                Coupon id
              </label>
              <input
                id="billing-action-coupon"
                value={coupon}
                onChange={(event) => setCoupon(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="min-h-11 w-full rounded-sm border border-edge-strong bg-surface-card px-3 text-sm text-content focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus md:min-h-9"
              />
            </div>
          )}

          {action === 'pause' && (
            <RadioGroup legend="Collection">
              <Radio
                name="billing-action-pause"
                id="billing-action-pause-off"
                label="Pause collection"
                checked={!resume}
                onChange={() => setResume(false)}
              />
              <Radio
                name="billing-action-pause"
                id="billing-action-pause-on"
                label="Resume collection"
                checked={resume}
                onChange={() => setResume(true)}
              />
            </RadioGroup>
          )}

          {action === 'cancel' && (
            <RadioGroup legend="When">
              <Radio
                name="billing-action-cancel"
                id="billing-action-cancel-period-end"
                label="At the end of the current period"
                checked={atPeriodEnd}
                onChange={() => setAtPeriodEnd(true)}
              />
              <Radio
                name="billing-action-cancel"
                id="billing-action-cancel-now"
                label="Immediately"
                checked={!atPeriodEnd}
                onChange={() => setAtPeriodEnd(false)}
              />
            </RadioGroup>
          )}

          {error && (
            <AlertBanner
              status="danger"
              variant="subtle"
              title={headlineFor(error.code)}
              description={error.message}
            />
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Close</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: destructive ? 'destructive' : 'default' })}
            disabled={submitting || (action === 'apply-coupon' && coupon.trim().length === 0)}
            onClick={submit}
          >
            {submitting ? 'Working…' : 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RadioGroup({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-content">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Radio({
  name,
  id,
  label,
  checked,
  onChange,
}: {
  name: string;
  id: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2 md:min-h-9">
      <input
        type="radio"
        id={id}
        name={name}
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-interactive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
      />
      <label htmlFor={id} className="text-sm text-content">
        {label}
      </label>
    </div>
  );
}
