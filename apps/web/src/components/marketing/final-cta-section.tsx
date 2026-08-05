import React from 'react';

/** Warm closing CTA band. */
export function FinalCtaSection() {
  return (
    <section className="mk-band">
      <div className="mk-wrap">
        <div className="mk-final">
          <h2 className="mk-display">Beat the deadline across every community.</h2>
          {/*
            Was "Join the Florida management companies running compliant…".
            That implies an existing customer base we do not have yet — the same
            defect as the fabricated testimonial and logo strip un-rendered in
            (marketing)/page.tsx, just in smaller type. Restore a social-proof
            framing only when there are real customers to point at.
          */}
          <p>
            Compliant, modern, transparent portfolios — without the stress of
            tracking every deadline by hand.
          </p>
          <div className="mk-cta-row">
            <a href="/signup" className="mk-pill mk-pill-primary">
              Get your portfolio online →
            </a>
            <a href="/contact" className="mk-pill mk-pill-ghost mk-pill-ghost-inverse">
              Talk to us
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
