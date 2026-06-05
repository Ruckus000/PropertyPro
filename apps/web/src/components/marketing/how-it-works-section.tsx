import React from 'react';

const STEPS = [
  {
    n: '1',
    title: 'Onboard a community',
    body: 'Add an association and it gets a branded, compliant website on its own subdomain — instantly.',
  },
  {
    n: '2',
    title: 'Bulk-load documents',
    body: 'Drag in budgets, bylaws, and minutes across communities. We sort them into the statute’s required categories.',
  },
  {
    n: '3',
    title: 'Invite boards & owners',
    body: 'Boards and owners get secure portals and mobile access. Notices and announcements go out automatically.',
  },
];

/** Three portfolio-scale steps. Fills the old dead "See How It Works" CTA. */
export function HowItWorksSection() {
  return (
    <section className="mk-band mk-band-alt" id="how">
      <div className="mk-wrap">
        <div className="mk-sec-head">
          <span className="mk-eyebrow">How it works</span>
          <h2 className="mk-display">Compliant in three steps.</h2>
          <p className="mk-muted">
            No IT person, no committee, no consultant — at one building or fifty.
          </p>
        </div>
        <div className="mk-steps">
          {STEPS.map((s) => (
            <div className="mk-card mk-step" key={s.n}>
              <span className="mk-num">{s.n}</span>
              <h3 className="mk-display">{s.title}</h3>
              <p className="mk-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
