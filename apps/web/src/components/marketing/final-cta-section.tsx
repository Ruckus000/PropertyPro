import React from 'react';

/** Warm closing CTA band. */
export function FinalCtaSection() {
  return (
    <section className="mk-band">
      <div className="mk-wrap">
        <div className="mk-final">
          <h2 className="mk-display">Beat the deadline across every community.</h2>
          <p>
            Join the Florida management companies running compliant, modern,
            transparent portfolios — without the stress.
          </p>
          <div className="mk-cta-row">
            <a href="/signup" className="mk-pill mk-pill-primary">
              Get your portfolio online →
            </a>
            <a
              href="mailto:support@getpropertypro.com?subject=Talk%20to%20PropertyPro"
              className="mk-pill mk-pill-ghost mk-pill-ghost-inverse"
            >
              Talk to us
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
