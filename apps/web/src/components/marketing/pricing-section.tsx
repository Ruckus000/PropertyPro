import React from 'react';
import { signupTrialMarketingLine } from '@propertypro/shared';
import { CheckIcon, SectionMark } from './marketing-brand';

const INCLUDED_IN_ALL = [
  'Unlimited board members',
  'Unlimited owners',
  'Statute monitoring',
  'Hosting and SSL',
  'Custom domain',
  'Audit trail export',
];

/** `null` renders "Not included"; a string renders as an included value. */
interface ComparisonRow {
  label: string;
  essentials: string | null;
  professional: string | null;
  manager: string | null;
}

const ROWS: ComparisonRow[] = [
  {
    label: 'Compliance list & deadlines',
    essentials: 'Included',
    professional: 'Included',
    manager: 'Included',
  },
  {
    label: 'Association website & owner portal',
    essentials: 'Branded',
    professional: 'Branded',
    manager: 'White-label',
  },
  {
    label: 'Meeting notices & minutes',
    essentials: 'Included',
    professional: 'Included',
    manager: 'Included',
  },
  {
    label: 'Mobile resident portal',
    essentials: null,
    professional: 'Included',
    manager: 'Included',
  },
  {
    label: 'E-sign, maintenance & violations',
    essentials: null,
    professional: 'Included',
    manager: 'Included',
  },
  {
    label: 'Portfolio roll-up & bulk posting',
    essentials: null,
    professional: null,
    manager: 'Included',
  },
  {
    label: 'Volume pricing & dedicated onboarding',
    essentials: null,
    professional: null,
    manager: 'Included',
  },
];

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
          <table className="mk-ptbl">
            <caption className="sr-only">
              PropertyPro plans compared. Essentials is $199 a month, Professional is $349
              a month, and Property Manager is quoted.
            </caption>
            <thead>
              <tr>
                <td />
                <th scope="col" className="mk-pick">
                  {/* Not "Most popular" — that is a claim about customers we do not
                      have yet. This states where we point boards, which is true. */}
                  <span className="mk-flag">Where most boards start</span>
                  <span className="mk-tier">Essentials</span>
                  <span className="mk-amt">
                    $199<span>/mo</span>
                  </span>
                  <span className="mk-for">
                    Self-managed condos and HOAs getting compliant
                  </span>
                </th>
                <th scope="col">
                  <span className="mk-tier">Professional</span>
                  <span className="mk-amt">
                    $349<span>/mo</span>
                  </span>
                  <span className="mk-for">The full single-community toolkit</span>
                </th>
                <th scope="col">
                  <span className="mk-tier">Property Manager</span>
                  <span className="mk-amt">Let&apos;s talk</span>
                  <span className="mk-for">Management companies running portfolios</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <Cell value={row.essentials} pick />
                  <Cell value={row.professional} />
                  <Cell value={row.manager} />
                </tr>
              ))}
              <tr>
                <th scope="row">
                  <span className="sr-only">Sign up</span>
                </th>
                <td className="mk-pick">
                  <a
                    className="mk-pill mk-pill-primary mk-pill-sm"
                    href="/signup?plan=essentials&communityType=condo_718"
                  >
                    Start free trial
                  </a>
                </td>
                <td>
                  <a
                    className="mk-pill mk-pill-ghost mk-pill-sm"
                    href="/signup?plan=professional&communityType=condo_718"
                  >
                    Start free trial
                  </a>
                </td>
                <td>
                  <a className="mk-pill mk-pill-ghost mk-pill-sm" href="/contact">
                    Talk to us
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="mk-pfoot">
            {/* Rendered from the shared helper, NOT hand-written. `activation-smoke`
                asserts the literal phrase "card required" here, and this line is
                the one place the page promises a trial length — both have to keep
                agreeing with what Stripe Checkout actually does. Rewording it by
                hand is how they drift. */}
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
