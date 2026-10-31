'use client';

import React, { useRef, useState } from 'react';
import { CheckIcon } from './marketing-brand';
import { PLANS, ROWS, type PlanKey } from './pricing-plans';

/**
 * Phone pricing: one plan at a time behind a three-way switch. The comparison
 * table it replaces below 900px showed 348px of an 813px-wide table at 390px —
 * Professional and Property Manager sat off-screen with no sign the table
 * scrolled. Every plan name stays visible on the switch.
 *
 * CSS hides this above 900px (`.mk-plans`), where the table shows all three.
 * It follows the WAI-ARIA tabs pattern: arrow keys, Home and End move between
 * plans, and only the selected tab is in the Tab order.
 */
export function PricingPlanSwitcher() {
  const [selected, setSelected] = useState<PlanKey>('essentials');
  const tabRefs = useRef<Partial<Record<PlanKey, HTMLButtonElement | null>>>({});

  const select = (key: PlanKey, focus: boolean) => {
    setSelected(key);
    if (focus) tabRefs.current[key]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const last = PLANS.length - 1;
    const next =
      e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    select(PLANS[next]!.key, true);
  };

  return (
    <div className="mk-plans">
      <div className="mk-plan-tabs" role="tablist" aria-label="Plans">
        {PLANS.map((plan, i) => {
          const on = plan.key === selected;
          return (
            <button
              key={plan.key}
              ref={(el) => {
                tabRefs.current[plan.key] = el;
              }}
              type="button"
              role="tab"
              id={`mk-plan-tab-${plan.key}`}
              aria-controls={`mk-plan-${plan.key}`}
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => select(plan.key, false)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {plan.name}
            </button>
          );
        })}
      </div>
      {PLANS.map((plan) => (
        <div
          key={plan.key}
          id={`mk-plan-${plan.key}`}
          role="tabpanel"
          aria-labelledby={`mk-plan-tab-${plan.key}`}
          className={plan.flag ? 'mk-plan mk-plan-pick' : 'mk-plan'}
          hidden={plan.key !== selected}
        >
          {plan.flag ? <p className="mk-flag-inline">{plan.flag}</p> : null}
          <span className="mk-tier">{plan.name}</span>
          <span className="mk-amt">
            {plan.amount}
            {plan.perMonth ? <span>/mo</span> : null}
          </span>
          <span className="mk-for">{plan.forWhom}</span>
          <ul>
            {ROWS.map((row) => {
              const value = row[plan.key];
              return (
                <li key={row.label}>
                  <span>{row.label}</span>
                  {value === null ? (
                    <span className="mk-no">Not included</span>
                  ) : (
                    <span className="mk-yes">
                      <CheckIcon />
                      {value}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <a
            className={`mk-pill ${plan.cta.primary ? 'mk-pill-primary' : 'mk-pill-ghost'}`}
            href={plan.cta.href}
          >
            {plan.cta.label}
          </a>
        </div>
      ))}
    </div>
  );
}
