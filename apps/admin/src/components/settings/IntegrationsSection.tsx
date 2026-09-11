/**
 * Settings → "Integrations": is each third-party dependency answering, and
 * which Stripe mode is this deployment wired to.
 *
 * ## Three outcomes, not two — and the third is the whole point
 *
 * Every value this section renders has a state that is neither working nor
 * broken, and each one arrives by a different route:
 *
 *  - A `ServiceStatus.state` can be `unknown`, which `health.ts` reserves for
 *    *we did not ask* — the env var naming the dependency is unset. Painting
 *    that red would make a fresh checkout look like a production outage and,
 *    worse, would make a REAL outage indistinguishable from a missing line in
 *    `.env.local`. It renders NEUTRAL, labelled `Not checked`.
 *  - `stripeKeyLivemode()` returns `null` for an unset or unrecognised key. The
 *    honest label for that is **`Not configured`**, never `Test mode`: `null`
 *    and `false` are different facts, and a console that states a mode it could
 *    not determine is worse than one that admits it could not. The same
 *    reasoning is why `billing-actions.ts` refuses on `null` rather than
 *    assuming test.
 *  - Sentry has no row of its own (see below), so its indeterminate case
 *    swallows a real failure — which is called out on the row rather than
 *    hidden.
 *
 * ## Why Sentry is derived, not probed
 *
 * `HealthReport.services` carries six rows — `API`, `Web app`, `Admin`,
 * `Supabase`, `Stripe webhooks`, `Resend` — and Sentry is not one of them. The
 * only Sentry evidence in the report is `errors`, which is `SentryIssue[]` when
 * the client existed AND the call resolved, and `null` for BOTH "not
 * configured" and "the call failed". So this row reads `ok` from a non-null
 * `errors` and `unknown` otherwise.
 *
 * The consequence is stated on the row itself: **this row can never say
 * `Down`.** Adding a Sentry probe here would duplicate a call the wave-3 TTL
 * cache exists to bound, so the gap is reported rather than patched over — if a
 * distinct Sentry `down` is wanted, it belongs in `health.ts` as a seventh
 * `ServiceStatus`, where every consumer gets it.
 *
 * ## Status is never colour alone
 *
 * Each row carries a state ICON, the state WORD, and a colour
 * (`.claude/rules/design.md`). Any one of the three is enough to read the row.
 * Tone classes are written out per state rather than composed from a template,
 * because `guard:class-resolution` cannot see `bg-status-${state}` and Tailwind
 * emits no rule for a class its scanner never found — the badge would render
 * with no colour at all and every check would stay green.
 */
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  HelpCircle,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Badge, type BadgeVariant } from '@propertypro/ui';
import type { ServiceState, ServiceStatus } from '@/lib/server/health';

/** The four dependencies this section reports on, in display order. */
export type IntegrationName = 'Stripe' | 'Sentry' | 'Resend' | 'Supabase';

/**
 * The server-computed inputs. Plain data: `PlatformSettings` is a client
 * component, so everything here crosses the RSC boundary.
 */
export interface IntegrationsSectionProps {
  /**
   * `HealthReport.services`, read by the page through `withHealthCache` — NOT a
   * second, uncached `getHealthReport()` call.
   */
  services: ServiceStatus[];
  /**
   * `HealthReport.errors !== null`. `false` means Sentry was not configured OR
   * the read failed; the report cannot tell those apart. See the docblock.
   */
  sentryAnswered: boolean;
  /**
   * `stripeKeyLivemode(process.env.STRIPE_SECRET_KEY)`.
   * `true` = live · `false` = test · `null` = could not be determined.
   */
  stripeLivemode: boolean | null;
}

interface IntegrationRow {
  name: IntegrationName;
  state: ServiceState;
  /** One or two words, from the probe. */
  short: string;
  /** The detail line: a latency, a backlog, or the env var that is unset. */
  meta: string;
}

const STATE_PRESENTATION: Record<
  ServiceState,
  { label: string; icon: LucideIcon; variant: BadgeVariant }
> = {
  ok: { label: 'Healthy', icon: CheckCircle2, variant: 'success' },
  degraded: { label: 'Degraded', icon: AlertTriangle, variant: 'warning' },
  down: { label: 'Down', icon: XCircle, variant: 'danger' },
  // Neutral, deliberately. `unknown` is "we did not ask", not "it failed".
  unknown: { label: 'Not checked', icon: HelpCircle, variant: 'neutral' },
};

/**
 * The Stripe mode line.
 *
 * `null` gets its OWN label and its own neutral tone. Collapsing it onto
 * `Test mode` would assert a fact this deployment does not have.
 */
const MODE_PRESENTATION: {
  live: { label: string; icon: LucideIcon; variant: BadgeVariant; meta: string };
  test: { label: string; icon: LucideIcon; variant: BadgeVariant; meta: string };
  unknown: { label: string; icon: LucideIcon; variant: BadgeVariant; meta: string };
} = {
  live: {
    label: 'Live mode',
    icon: CheckCircle2,
    variant: 'success',
    meta: 'STRIPE_SECRET_KEY is a live key — charges are real.',
  },
  test: {
    label: 'Test mode',
    icon: FlaskConical,
    variant: 'warning',
    meta: 'STRIPE_SECRET_KEY is a test key — no real money moves.',
  },
  unknown: {
    label: 'Not configured',
    icon: HelpCircle,
    variant: 'neutral',
    meta: 'STRIPE_SECRET_KEY is unset or its prefix was not recognised, so the mode could not be determined.',
  },
};

/** `true`/`false`/`null` → which of the three mode presentations to render. */
export function modeKeyFor(livemode: boolean | null): 'live' | 'test' | 'unknown' {
  if (livemode === null) return 'unknown';
  return livemode ? 'live' : 'test';
}

/**
 * Find the `ServiceStatus` behind one integration row.
 *
 * A missing row is `unknown`, not a crash and not a failure: the health report
 * is the only source here (correction 5 of the task brief — no second probe),
 * so "the report did not carry this service" is exactly an unanswered question.
 */
export function rowFor(
  name: IntegrationName,
  sourceName: ServiceStatus['name'],
  services: ServiceStatus[],
): IntegrationRow {
  const match = services.find((service) => service.name === sourceName);
  if (!match) {
    return {
      name,
      state: 'unknown',
      short: 'Not reported',
      meta: `The health report carried no "${sourceName}" service.`,
    };
  }
  return { name, state: match.state, short: match.short, meta: match.meta };
}

/** The Sentry row, derived from `errors` because there is no service row. */
export function sentryRow(sentryAnswered: boolean): IntegrationRow {
  return sentryAnswered
    ? {
        name: 'Sentry',
        state: 'ok',
        short: 'Reachable',
        meta: 'Issues were read for the current health report.',
      }
    : {
        name: 'Sentry',
        state: 'unknown',
        short: 'Not checked',
        meta: 'SENTRY_API_TOKEN or SENTRY_ORG is unset, or the last read failed — the health report cannot tell those apart.',
      };
}

export function buildIntegrationRows({
  services,
  sentryAnswered,
}: Pick<IntegrationsSectionProps, 'services' | 'sentryAnswered'>): IntegrationRow[] {
  return [
    rowFor('Stripe', 'Stripe webhooks', services),
    sentryRow(sentryAnswered),
    rowFor('Resend', 'Resend', services),
    rowFor('Supabase', 'Supabase', services),
  ];
}

export function IntegrationsSection({
  services,
  sentryAnswered,
  stripeLivemode,
}: IntegrationsSectionProps) {
  const rows = buildIntegrationRows({ services, sentryAnswered });
  const mode = MODE_PRESENTATION[modeKeyFor(stripeLivemode)];
  const ModeIcon = mode.icon;

  return (
    <section aria-labelledby="settings-integrations">
      <h2
        id="settings-integrations"
        className="mb-3 text-sm font-medium uppercase tracking-wide text-content-tertiary"
      >
        Integrations
      </h2>

      <ul className="divide-y divide-edge overflow-hidden rounded-lg border border-edge bg-surface-card shadow-e1">
        {rows.map((row) => {
          const presentation = STATE_PRESENTATION[row.state];
          const StateIcon = presentation.icon;
          return (
            <li
              key={row.name}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-content">{row.name}</p>
                <p className="mt-0.5 break-words text-xs text-content-tertiary">{row.meta}</p>
                {row.name === 'Sentry' && (
                  <p className="mt-0.5 text-xs text-content-tertiary">
                    Reported from the health report&rsquo;s issue read, which does not separate an
                    unreachable Sentry from an unconfigured one — this row never reads
                    &ldquo;Down&rdquo;.
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge variant={presentation.variant} size="sm">
                  <Badge.Icon>
                    <StateIcon />
                  </Badge.Icon>
                  <Badge.Label>{presentation.label}</Badge.Label>
                </Badge>
                {row.short && (
                  <span className="text-xs text-content-tertiary">{row.short}</span>
                )}
              </div>
            </li>
          );
        })}

        {/* The Stripe MODE is a configuration fact, not a probe result, so it
            sits on its own row rather than being folded into the Stripe status
            above — a reachable Stripe in the wrong mode is a distinct problem
            from an unreachable one. */}
        <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-content">Stripe key mode</p>
            <p className="mt-0.5 break-words text-xs text-content-tertiary">{mode.meta}</p>
          </div>
          <div className="shrink-0">
            <Badge variant={mode.variant} size="sm">
              <Badge.Icon>
                <ModeIcon />
              </Badge.Icon>
              <Badge.Label>{mode.label}</Badge.Label>
            </Badge>
          </div>
        </li>
      </ul>
    </section>
  );
}
