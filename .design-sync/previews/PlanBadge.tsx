import { PlanBadge } from '@propertypro/design-system';

/**
 * PlanBadge — the gold "this feature is gated to a higher plan" pill. Its own
 * axis is `variant` (pro | plus | enterprise) plus `tone` (light for dialogs
 * and page heroes, dark for the sidebar rail) and an optional `label` override.
 * It is deliberately NOT a status colour — premium gold is its own accent.
 */

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <PlanBadge variant="pro" />
    <PlanBadge variant="plus" />
    <PlanBadge variant="enterprise" />
    <PlanBadge variant="pro" label="Professional" />
  </div>
);

export const DarkTone = () => (
  <div className="w-full max-w-[280px] rounded-md bg-surface-inverse p-3">
    <div className="mb-2 px-2 text-[10px] uppercase tracking-wide text-content-inverse opacity-70">
      Operations
    </div>
    <div className="flex flex-col gap-1.5">
      {[
        { label: 'Work Orders', locked: false },
        { label: 'Vendor Contracts', locked: true, plan: 'pro' as const },
        { label: 'Delinquency Reports', locked: true, plan: 'plus' as const },
        { label: 'Portfolio Analytics', locked: true, plan: 'enterprise' as const },
      ].map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-content-inverse"
        >
          <span className={row.locked ? 'opacity-70' : ''}>{row.label}</span>
          {row.locked ? <PlanBadge variant={row.plan} tone="dark" /> : null}
        </div>
      ))}
    </div>
  </div>
);

export const OnLockedFeature = () => (
  <div className="w-full max-w-[560px] rounded-md border border-edge bg-surface-card p-6">
    <div className="mb-2 flex items-center gap-2">
      <span className="text-base font-semibold text-content">Delinquency &amp; Collections</span>
      <PlanBadge variant="pro" />
    </div>
    <p className="text-sm leading-relaxed text-content-secondary">
      Palm Shores HOA is on the Essentials plan. Upgrade to Professional to run
      aged-receivable reports, send statutory 30-day demand letters, and track
      lien timelines from the association ledger.
    </p>
    <div className="mt-3 flex items-center gap-2 text-xs text-content-tertiary">
      <PlanBadge variant="plus" label="Plus adds e-voting" />
      <PlanBadge variant="enterprise" label="Enterprise adds SSO" />
    </div>
  </div>
);
