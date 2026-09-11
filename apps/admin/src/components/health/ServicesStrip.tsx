/**
 * ServicesStrip — one tile per probed service.
 *
 * ## Status is never colour alone
 *
 * Each tile carries a coloured dot, a state-specific ICON SHAPE, and the state
 * WORD as visible text. Any one of the three is enough to read the tile, which
 * is the requirement (`.claude/rules/design.md`): a red dot and a green dot are
 * the same tile to a third of colour-blind readers and to anyone reading a
 * grayscale print-out of an incident.
 *
 * `unknown` is a first-class state and is styled NEUTRAL, not red. It means the
 * env var naming the dependency is unset — a fresh checkout, a preview
 * deployment — and painting that as an outage is how a monitoring surface
 * teaches its operator to ignore it.
 *
 * Tone classes are written out in full per state rather than composed from a
 * template. `guard:class-resolution` cannot see `bg-status-${state}-subtle`, and
 * Tailwind emits NO rule for a class its scanner never found — the tile would
 * render with no colour at all and every check would stay green.
 */
import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ServiceState, ServiceStatus } from '@/lib/server/health';

const STATE_PRESENTATION: Record<
  ServiceState,
  { label: string; icon: LucideIcon; dot: string; text: string }
> = {
  ok: { label: 'Healthy', icon: CheckCircle2, dot: 'bg-status-success', text: 'text-status-success' },
  degraded: {
    label: 'Degraded',
    icon: AlertTriangle,
    dot: 'bg-status-warning',
    text: 'text-status-warning',
  },
  down: { label: 'Down', icon: XCircle, dot: 'bg-status-danger', text: 'text-status-danger' },
  unknown: {
    label: 'Not checked',
    icon: HelpCircle,
    dot: 'bg-status-neutral',
    text: 'text-status-neutral',
  },
};

interface ServicesStripProps {
  services: ServiceStatus[];
}

export function ServicesStrip({ services }: ServicesStripProps) {
  return (
    <section aria-labelledby="health-services" className="space-y-3">
      <h2 id="health-services" className="text-sm font-semibold text-content-secondary">
        Services
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((service) => {
          const presentation = STATE_PRESENTATION[service.state];
          const Icon = presentation.icon;
          return (
            <li
              key={service.name}
              className="flex items-start gap-3 rounded-lg border border-edge bg-surface-card p-4 shadow-e1"
            >
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${presentation.dot}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-content">{service.name}</p>
                <p className={`flex items-center gap-1.5 text-xs font-medium ${presentation.text}`}>
                  <Icon size={13} aria-hidden="true" />
                  {presentation.label}
                  {service.short && (
                    <span className="text-content-tertiary">· {service.short}</span>
                  )}
                </p>
                {service.meta && (
                  <p className="mt-1 break-words font-mono text-xs text-content-tertiary">
                    {service.meta}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
