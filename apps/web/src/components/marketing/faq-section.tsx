'use client';

import React, { useState } from 'react';
import { SIGNUP_TRIAL_DAYS } from '@propertypro/shared';
import { SectionMark } from './marketing-brand';

const QUESTIONS: { q: string; a: string }[] = [
  {
    q: 'Is my association actually required to have a website?',
    a: 'Condominiums with 25 or more units are required to maintain a compliant website — those at 150 or more units already were, since 2019. HOAs are required at 100 or more parcels. Below those thresholds you’re exempt from the website requirement, though the underlying duty to keep records and produce them doesn’t go away.',
  },
  {
    q: 'What actually happens if we’re late?',
    a: 'There’s no automatic fine for lacking a website, and we won’t pretend otherwise. The exposure is a records request you can’t answer: §718.111(12)(c) sets minimum damages per day, and a board that can’t produce records has handed an owner a straightforward claim. Directors are fiduciaries — that’s the real risk, and it’s the one we’re built around.',
  },
  {
    q: 'Do I need to be technical to run this?',
    a: 'No. If you can use email, you can run PropertyPro. Setup is adding the association and dragging in the documents you already have.',
  },
  {
    q: 'We already have a website. Does this replace it?',
    a: 'Either. Most general-purpose association sites don’t meet the statute’s posting and notice requirements — they were built to look nice, not to prove a date. You keep your domain either way.',
  },
  {
    q: 'Who can see what?',
    a: 'Three tiers, set per record: public, owners-only, board. Each association’s data is isolated and encrypted. Review notes and audit reasons are never visible to owners.',
  },
  {
    q: 'Is there a trial? Do you need a card?',
    a: `A ${SIGNUP_TRIAL_DAYS}-day trial on both self-serve plans. A card is required to start, and you won’t be charged until the trial ends unless you cancel first.`,
  },
];

/** Single-open accordion — opening one answer closes the others. */
export function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="mk-band" id="faq" aria-labelledby="faq-h">
      <div className="mk-wrap mk-sec">
        <div className="mk-sec-l">
          <SectionMark index="08" label="Questions boards ask" />
          <h2 className="mk-display" id="faq-h">
            The honest answers.
          </h2>
        </div>
        <div className="mk-faq">
          {QUESTIONS.map((item, i) => {
            const expanded = open === i;
            return (
              <div className="mk-qa" key={item.q}>
                <h3>
                  <button
                    className="mk-qa-toggle"
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`mk-faq-a${i}`}
                    onClick={() => setOpen(expanded ? null : i)}
                  >
                    <span>{item.q}</span>
                    <span className="mk-g" aria-hidden="true">
                      {expanded ? '−' : '+'}
                    </span>
                  </button>
                </h3>
                <p id={`mk-faq-a${i}`} hidden={!expanded}>
                  {item.a}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
