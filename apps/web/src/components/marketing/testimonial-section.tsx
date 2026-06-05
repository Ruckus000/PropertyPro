import React from 'react';

/** CAM / property-manager testimonial. Placeholder quote until a real one lands. */
export function TestimonialSection() {
  return (
    <section className="mk-band mk-band-alt">
      <div className="mk-wrap">
        <div className="mk-card mk-quote">
          <div className="mk-q">
            “We manage 14 buildings. PropertyPro got every one of them{' '}
            <span className="mk-hl">compliant on a single dashboard</span> — and
            when a deadline’s coming up, it tells me which community to look at.”
          </div>
          <div className="mk-who">
            <span className="mk-av" aria-hidden="true" />
            <div style={{ textAlign: 'left', fontSize: 14 }}>
              <b style={{ display: 'block', fontSize: 15 }}>Daniel Ortiz</b>
              <span className="mk-muted">
                Property Manager · Gulfstream Management, Fort Lauderdale
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
