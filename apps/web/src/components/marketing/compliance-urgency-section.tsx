import React from 'react';
import { ComplianceChecker } from './compliance-checker';

const LAWS = [
  {
    n: '§',
    title: 'Post records within 30 days',
    body: 'Upload once — we timestamp, categorize, and publish to each community’s owner portal automatically.',
  },
  {
    n: '14',
    title: 'Meeting notices, perfectly timed',
    body: '48-hour board and 14-day owner notices scheduled and tracked across every association.',
  },
  {
    n: '✓',
    title: 'Always audit-ready',
    body: 'A complete compliance log per community, exportable the moment the DBPR asks.',
  },
];

/**
 * "The law changed. We handle it." Reframes §718/§720 obligations as autopilot,
 * with the interactive checker. Statute facts ($50/day, 30 days, Jan 1 2026)
 * preserved — general information, not legal advice.
 */
export function ComplianceUrgencySection() {
  return (
    <section className="mk-band" id="compliance">
      <div className="mk-wrap">
        <div className="mk-sec-head">
          <span className="mk-eyebrow">The law changed. We handle it.</span>
          <h2 className="mk-display">Florida statutes, finally on autopilot.</h2>
          <p className="mk-muted">
            §718.111(12)(g) and §720.303 spell out exactly what must be online,
            and when. PropertyPro tracks every deadline across your whole
            portfolio and surfaces the one thing to do next — so a $50/day
            penalty never sneaks up on any community you manage.
          </p>
        </div>
        <div className="mk-relief">
          <div className="mk-card mk-relief-card">
            {LAWS.map((l) => (
              <div className="mk-law" key={l.title}>
                <span className="mk-n" aria-hidden="true">
                  {l.n}
                </span>
                <div>
                  <h4>{l.title}</h4>
                  <p className="mk-muted">{l.body}</p>
                </div>
              </div>
            ))}
          </div>
          <ComplianceChecker />
        </div>
      </div>
    </section>
  );
}
