'use client';

import React, { useState } from 'react';
import { captureLead } from '@/hooks/use-capture-lead';
import {
  getComplianceObligation,
  type AssociationType,
  type ObligationResult,
} from '@/lib/marketing/compliance-obligation';

/**
 * Interactive "is your association required to comply?" checker for the
 * landing page. General information only — not legal advice.
 */
type CaptureState = 'idle' | 'submitting' | 'done' | 'error';

export function ComplianceChecker() {
  const [type, setType] = useState<AssociationType>('condo');
  const [count, setCount] = useState('');
  const [result, setResult] = useState<ObligationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lead capture — see docs/gtm/03-LAUNCH-READINESS.md B1. The checked unit
  // count and type are the ICP qualification fields, so they ride along with
  // the email rather than being thrown away when the visitor doesn't click through.
  const [email, setEmail] = useState('');
  const [associationName, setAssociationName] = useState('');
  const [capture, setCapture] = useState<CaptureState>('idle');
  const [captureError, setCaptureError] = useState<string | null>(null);

  function onCheck() {
    const trimmed = count.trim();
    if (!/^\d+$/.test(trimmed)) {
      setResult(null);
      setError('Please enter a whole number of units or parcels.');
      return;
    }
    const n = Number.parseInt(trimmed, 10);
    if (n < 1) {
      setResult(null);
      setError('Please enter a whole number of units or parcels.');
      return;
    }
    try {
      setError(null);
      setResult(getComplianceObligation({ type, count: n }));
      setCapture('idle');
      setCaptureError(null);
    } catch {
      setResult(null);
      setError('We couldn’t check that. Please try again.');
    }
  }

  async function onCapture(e: React.FormEvent) {
    e.preventDefault();
    if (!result) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail.includes('@')) {
      setCapture('error');
      setCaptureError('Please enter a valid email address.');
      return;
    }

    setCapture('submitting');
    setCaptureError(null);
    try {
      await captureLead({
        email: trimmedEmail,
        associationName: associationName.trim() || undefined,
        associationType: type,
        unitCount: Number.parseInt(count.trim(), 10),
        obligationRequired: result.required,
      });
      setCapture('done');
    } catch {
      setCapture('error');
      setCaptureError('We couldn’t save that. Please try again.');
    }
  }

  return (
    <div className="mk-checker">
      <span className="mk-eyebrow">30-second check</span>
      <h3 className="mk-display">Is your association required to comply?</h3>
      <p style={{ opacity: 0.85, fontSize: 14 }}>
        Enter the unit or parcel count — we&apos;ll tell you the exact obligation
        and deadline.
      </p>

      <div className="mk-field">
        <label htmlFor="mk-assoc-type" className="sr-only">
          Association type
        </label>
        <select
          id="mk-assoc-type"
          value={type}
          onChange={(e) => {
            setType(e.target.value as AssociationType);
            setResult(null);
            setError(null);
          }}
        >
          <option value="condo">Condo</option>
          <option value="hoa">HOA</option>
        </select>

        <label htmlFor="mk-assoc-count" className="sr-only">
          Number of units or parcels
        </label>
        <input
          id="mk-assoc-count"
          inputMode="numeric"
          placeholder="e.g. 84 units"
          value={count}
          onChange={(e) => {
            setCount(e.target.value);
            setResult(null);
            setError(null);
          }}
        />

        <button type="button" className="mk-pill mk-pill-primary" onClick={onCheck}>
          Check
        </button>
      </div>

      <div className="mk-res" aria-live="polite">
        {error ? (
          <span>{error}</span>
        ) : result ? (
          <>
            <b>{result.headline}.</b> {result.detail}
            {result.required ? (
              <a
                href="/signup"
                className="mk-pill mk-pill-primary"
                style={{ display: 'inline-block', marginTop: 16 }}
              >
                Get compliant →
              </a>
            ) : null}

            {capture === 'done' ? (
              <p style={{ marginTop: 16, fontSize: 14 }}>
                Thanks — we’ll be in touch at <b>{email.trim()}</b>.
              </p>
            ) : (
              <form onSubmit={onCapture} style={{ marginTop: 16 }}>
                {/*
                  This used to promise an emailed summary. Nothing sent one — the
                  lead was only recorded — so the copy now describes what actually
                  happens: a human follows up. See docs/gtm/03-LAUNCH-READINESS.md
                  B1 and the week 1–3 motion in docs/gtm/04-90-DAY-PLAN.md.
                */}
                <p style={{ fontSize: 14, marginBottom: 8 }}>
                  Want help getting compliant? Leave your email and we’ll follow
                  up with what your association needs to post.
                </p>
                <div className="mk-field">
                  <label htmlFor="mk-lead-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="mk-lead-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@association.org"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (capture === 'error') {
                        setCapture('idle');
                        setCaptureError(null);
                      }
                    }}
                    required
                  />

                  <label htmlFor="mk-lead-assoc" className="sr-only">
                    Association name (optional)
                  </label>
                  <input
                    id="mk-lead-assoc"
                    placeholder="Association name (optional)"
                    value={associationName}
                    onChange={(e) => setAssociationName(e.target.value)}
                  />

                  <button
                    type="submit"
                    className="mk-pill mk-pill-primary"
                    disabled={capture === 'submitting'}
                  >
                    {capture === 'submitting' ? 'Saving…' : 'Have someone follow up'}
                  </button>
                </div>
                {captureError ? (
                  <p role="alert" style={{ marginTop: 8, fontSize: 14 }}>
                    {captureError}
                  </p>
                ) : null}
              </form>
            )}
          </>
        ) : (
          <>
            {/*
              This used to headline "$50 per day, per association" as the penalty
              for lacking a website. That figure is minimum damages under
              §718.111(12)(c) for failing to answer an owner's written RECORDS
              REQUEST — capped at 10 days, and unrelated to whether a website
              exists. There is no automatic fine for not having one.

              Do not reintroduce a money claim here. We sell records integrity to
              fiduciaries; a prospect who checks the citation and finds it
              overstated has been handed a reason to distrust the exact thing
              we're selling. The deadlines below are true and carry the urgency
              on their own. /resources/condo-website-requirements explains the
              $50 figure properly, for readers who meet it elsewhere.
            */}
            Most <b>condos with 25+ units</b> — and <b>HOAs with 100+ parcels</b>{' '}
            — are now required to maintain a compliant website. Records go up
            within <b>30 days</b>, owner meeting notices <b>14 days</b> ahead,
            board meetings <b>48 hours</b> ahead.
          </>
        )}
      </div>
    </div>
  );
}
