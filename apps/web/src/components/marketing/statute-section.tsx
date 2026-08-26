import React from 'react';
import { SectionMark } from './marketing-brand';

interface Obligation {
  cite: string;
  amount: string;
  unit: string;
  title: string;
  body: string;
}

const OBLIGATIONS: Obligation[] = [
  {
    cite: '§718.111(12)',
    amount: '30 days',
    unit: 'from the record existing',
    title: 'Publish the official records',
    body: 'Declaration, bylaws, budgets, financials, insurance, minutes.',
  },
  {
    cite: '§718.112(2)',
    amount: '14 days',
    unit: 'ahead of the meeting',
    title: 'Notice owner meetings',
    body: 'Posted and mailed, agenda attached.',
  },
  {
    cite: '§718.112(2)(c)',
    amount: '48 hours',
    unit: 'ahead of the meeting',
    title: 'Notice board meetings',
    body: 'On the property, and on the website.',
  },
  {
    cite: '§718.111(12)(c)',
    amount: '10 days',
    unit: 'from written request',
    title: 'Answer a records request',
    body: 'Minimum damages per day.',
  },
];

export function StatuteSection() {
  return (
    <section className="mk-band" id="statute" aria-labelledby="statute-h">
      <div className="mk-wrap mk-sec">
        <div className="mk-sec-l">
          <SectionMark index="02" label="What the law asks for" />
          <h2 className="mk-display" id="statute-h">
            Four obligations. Fixed dates. No discretion.
          </h2>
          <p className="mk-sec-note">
            Condos at 25+ units, HOAs at 100+ parcels. General information, not legal
            advice.
          </p>
        </div>
        <div className="mk-dl">
          {OBLIGATIONS.map((o) => (
            <div className="mk-dlt" key={o.cite}>
              <p className="mk-c">{o.cite}</p>
              <b>{o.amount}</b>
              <span className="mk-u">{o.unit}</span>
              <h3>{o.title}</h3>
              <p>{o.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
