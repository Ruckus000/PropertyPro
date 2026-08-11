/**
 * The pure half of `verify-stripe-mode.ts`: given what was observed, decide
 * whether the environment is internally consistent.
 *
 * Split out from the script so the decision logic is unit-testable without a
 * Stripe account or a database. The script does the I/O; this decides.
 */
import { describeLivemode } from '@propertypro/shared';

export type CheckStatus = 'pass' | 'fail' | 'unknown';

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}

/**
 * `unknown` is NOT a pass. A preflight whose answer is "I could not tell" must
 * not read as green — that is how an unchecked surface reaches production
 * wearing a tick.
 */
export function isFailing(checks: Check[]): boolean {
  return checks.some((c) => c.status !== 'pass');
}

export function keyModeCheck(secretLivemode: boolean | null, redactedKey: string): Check {
  if (secretLivemode === null) {
    return {
      name: 'STRIPE_SECRET_KEY mode',
      status: 'unknown',
      detail: `${redactedKey} — unset, or a prefix this tool does not recognise. Mode undeterminable.`,
    };
  }
  return {
    name: 'STRIPE_SECRET_KEY mode',
    status: 'pass',
    detail: `${redactedKey} — ${describeLivemode(secretLivemode)} mode.`,
  };
}

export function publishableKeyCheck(
  secretLivemode: boolean | null,
  publishableLivemode: boolean | null,
  redactedKey: string,
): Check {
  const name = 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY agrees with secret key';

  if (publishableLivemode === null) {
    return {
      name,
      status: 'unknown',
      detail: `${redactedKey} — unset or unrecognised prefix.`,
    };
  }
  if (secretLivemode === null) {
    return {
      name,
      status: 'unknown',
      detail: `Publishable key is ${describeLivemode(publishableLivemode)} mode, but the secret key's mode is unknown, so agreement cannot be established.`,
    };
  }
  if (publishableLivemode !== secretLivemode) {
    return {
      name,
      status: 'fail',
      detail:
        `MISMATCH — publishable key is ${describeLivemode(publishableLivemode)} mode, ` +
        `secret key is ${describeLivemode(secretLivemode)} mode. Checkout will fail. ` +
        `Remember the publishable key is inlined at BUILD time: changing it requires a redeploy.`,
    };
  }
  return {
    name,
    status: 'pass',
    detail: `${redactedKey} — ${describeLivemode(publishableLivemode)} mode, matches the secret key.`,
  };
}

export interface PriceProbe {
  lookupKey: string;
  stripePriceId: string;
  /** Did the configured key resolve this price id? */
  resolved: boolean;
  /** Stripe's unit_amount, when resolved. */
  actualUnitAmountCents: number | null;
  /** What the catalog says it should be. */
  expectedUnitAmountCents: number;
}

export function priceCheck(probes: PriceProbe[]): Check {
  const name = 'stripe_prices rows resolve against the configured key';

  if (probes.length === 0) {
    return {
      name,
      status: 'fail',
      detail: 'stripe_prices is EMPTY — no plan can be sold. Run the appropriate price seeder.',
    };
  }

  const unresolved = probes.filter((p) => !p.resolved);
  if (unresolved.length > 0) {
    return {
      name,
      status: 'fail',
      detail:
        `${unresolved.length}/${probes.length} price ids are NOT resolvable by this key — ` +
        `the table and the key are in different Stripe modes. ` +
        `Checkout dies in resolveStripePrice with STRIPE_MODE_MISMATCH. ` +
        `First few: ${unresolved.slice(0, 3).map((p) => p.lookupKey).join(', ')}`,
    };
  }

  const mismatched = probes.filter(
    (p) => p.actualUnitAmountCents !== null && p.actualUnitAmountCents !== p.expectedUnitAmountCents,
  );
  if (mismatched.length > 0) {
    return {
      name,
      status: 'fail',
      detail:
        `${mismatched.length}/${probes.length} prices resolve but bill the WRONG amount: ` +
        mismatched
          .slice(0, 3)
          .map(
            (p) =>
              `${p.lookupKey} charges ${p.actualUnitAmountCents}c, catalog says ${p.expectedUnitAmountCents}c`,
          )
          .join('; '),
    };
  }

  return {
    name,
    status: 'pass',
    detail: `All ${probes.length} price ids resolve and bill the catalog amount.`,
  };
}

export interface StaleIdCounts {
  communities: number;
  billingGroups: number;
}

export function staleIdCheck(counts: StaleIdCounts): Check {
  const name = 'stored customer/subscription ids resolve against the configured key';
  const total = counts.communities + counts.billingGroups;

  if (total === 0) {
    return { name, status: 'pass', detail: 'No stale Stripe ids found.' };
  }

  return {
    name,
    status: 'fail',
    detail:
      `${counts.communities} community row(s) and ${counts.billingGroups} billing group(s) ` +
      `hold Stripe ids this key cannot resolve. Consequences: subscription webhooks match ` +
      `nothing and silently no-op, /billing/portal fails for those communities, and volume ` +
      `discount sync throws resource_missing. Run remediate-stale-stripe-ids.ts.`,
  };
}

/**
 * The webhook secret's mode CANNOT be derived offline — `whsec_` carries no mode
 * marker, and the only way to learn it is to receive a signed event. Report that
 * honestly as `unknown` rather than checking presence and implying more.
 */
export function webhookSecretCheck(secret: string | undefined): Check {
  const name = 'STRIPE_WEBHOOK_SECRET';
  if (!secret) {
    return {
      name,
      status: 'fail',
      detail: 'Not set — every incoming webhook returns 500 and Stripe retries indefinitely.',
    };
  }
  return {
    name,
    status: 'unknown',
    detail:
      'Set, but its mode cannot be verified offline: whsec_ carries no mode marker. ' +
      'Confirm in the Stripe Dashboard that this secret belongs to an endpoint in the SAME ' +
      'mode as the keys above, and that its URL is this environment.',
  };
}
