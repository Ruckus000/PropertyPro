import React from 'react';
import { SectionMark } from './marketing-brand';
import { MarketingPhoto } from './marketing-photo';

export function FinalCtaSection() {
  return (
    <section className="mk-close" aria-labelledby="close-h">
      <div className="mk-close-copy">
        <SectionMark index="§720" label="Get on the record" />
        <h2 className="mk-display" id="close-h">
          Put the next twelve months of deadlines somewhere other than your memory.
        </h2>
        <p>Bring one association online this week.</p>
        <div className="mk-close-cta">
          <a className="mk-pill mk-pill-inverse" href="/signup">
            Start a trial
          </a>
          <a className="mk-pill mk-pill-ghost-inverse" href="/contact">
            Talk to us
          </a>
        </div>
      </div>
      <div className="mk-close-shot">
        <MarketingPhoto
          name="close-coast"
          widths={[800, 1440]}
          // Half the viewport on desktop, full width once .mk-close stacks.
          sizes="(max-width: 900px) 100vw, 50vw"
          alt=""
          width={1800}
          height={1350}
        />
      </div>
    </section>
  );
}
