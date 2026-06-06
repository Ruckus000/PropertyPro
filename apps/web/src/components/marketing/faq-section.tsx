'use client';

import React, { useState } from 'react';

const QA = [
  {
    q: 'Is my association actually required to have a website?',
    a: 'Condos with 25+ units are required to maintain a compliant website (150+ units already were); HOAs with 100+ parcels are required too. Run the 30-second checker above for the exact obligation per community.',
  },
  {
    q: 'Do I need to be technical to set this up?',
    a: 'No. If you can use email, you can run PropertyPro — at one building or across a whole portfolio. Most communities are live the same afternoon, no committee or consultant required.',
  },
  {
    q: 'Is each association’s data secure?',
    a: 'Every association is fully isolated, encrypted, and backed up. Owners only see what you publish to them; sensitive records stay private to the board and manager.',
  },
  {
    q: 'What if a community already has a website?',
    a: 'Most general websites don’t meet the statute’s posting and notice requirements. PropertyPro can run alongside or replace it — and each community can use its own custom domain.',
  },
];

/** Objection-handling FAQ as an accessible single-open accordion. */
export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="mk-band mk-band-alt">
      <div className="mk-wrap">
        <div className="mk-sec-head mk-center">
          <span className="mk-eyebrow">Questions, answered</span>
          <h2 className="mk-display">The things managers always ask.</h2>
        </div>
        <div className="mk-faq">
          {QA.map((item, index) => {
            const isOpen = openIndex === index;
            const answerId = `faq-answer-${index}`;
            return (
              <div className="mk-card mk-qa" key={item.q}>
                <h3>
                  <button
                    type="button"
                    className="mk-qa-toggle"
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                  >
                    <span>{item.q}</span>
                    <span className="mk-muted mk-qa-glyph" aria-hidden="true">
                      {isOpen ? '−' : '+'}
                    </span>
                  </button>
                </h3>
                <p id={answerId} className="mk-muted" hidden={!isOpen}>
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
