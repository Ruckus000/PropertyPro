import React from 'react';
import { signupTrialMarketingLine } from '@propertypro/shared';
import { CheckIcon, SectionMark } from './marketing-brand';
import { PricingPlanSwitcher } from './pricing-plan-switcher';
import { INCLUDED_IN_ALL, PLANS, ROWS } from './pricing-plans';

function Cell({ value, pick }: { value: string | null; pick?: boolean }) {
  const className = [pick ? 'mk-pick' : '', value === null ? 'mk-no' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <td className={className || undefined}>
      {value === null ? (
        'Not included'
      ) : (
        <span className="mk-yes">
          <CheckIcon />
          {value}
        </span>
      )}
    </td>
  );
}

export function PricingSection() {
  return (
    <section className="mk-band mk-band-warm" id="pricing" aria-labelledby="pr-h">
      <div className="mk-wrap">
        <div className="mk-sec mk-sec-end">
          <div className="mk-sec-l mk-sec-l-static">
            <SectionMark index="07" label="Pricing" />
            <h2 className="mk-display" id="pr-h">
              Per association, not per owner.
            </h2>
          </div>
          <ul className="mk-incl">
            {INCLUDED_IN_ALL.map((item) => (
              <li key={item}>
                <CheckIcon />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="mk-price">
          {/* Desktop and tablet. Below 900px CSS hides it for the switcher. */}
          <table className="mk-ptbl">
            <caption className="sr-only">
              PropertyPro plans compared. Essentials is $199 a month, Professional is $349
              a month, and Property Manager is quoted.
            </caption>
            <thead>
              <tr>
                <td />
                {PLANS.map((plan) => (
                  <th scope="col" className={plan.flag ? 'mk-pick' : undefined} key={plan.key}>
                    {plan.flag ? <span className="mk-flag">{plan.flag}</span> : null}
                    <span className="mk-tier">{plan.name}</span>
                    <span className="mk-amt">
                      {plan.amount}
                      {plan.perMonth ? <span>/mo</span> : null}
                    </span>
                    <span className="mk-for">{plan.forWhom}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {PLANS.map((plan) => (
                    <Cell value={row[plan.key]} pick={Boolean(plan.flag)} key={plan.key} />
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row">
                  <span className="sr-only">Sign up</span>
                </th>
                {PLANS.map((plan) => (
                  <td className={plan.flag ? 'mk-pick' : undefined} key={plan.key}>
                    <a
                      className={`mk-pill ${plan.cta.primary ? 'mk-pill-primary' : 'mk-pill-ghost'} mk-pill-sm`}
                      href={plan.cta.href}
                    >
                      {plan.cta.label}
                    </a>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <PricingPlanSwitcher />
          <div className="mk-pfoot">
            {/* Rendered from the shared helper, NOT hand-written. `activation-smoke`
                asserts the literal phrase "card required" here, and this line is
                the one place the page promises a trial length — both have to keep
                agreeing with what Stripe Checkout actually does. Rewording it by
                hand is how they drift. Shared by the table and the phone switcher,
                so the phrase appears exactly once in #pricing. */}
            <span>
              {signupTrialMarketingLine()} Nothing is charged until the trial ends.
            </span>
            <span className="mk-mono">No setup fee · cancel anytime</span>
          </div>
        </div>
      </div>
    </section>
  );
}
