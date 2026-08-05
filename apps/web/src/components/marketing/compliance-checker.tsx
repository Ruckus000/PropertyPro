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
                Thanks — we’ll send your compliance summary to{' '}
                <b>{email.trim()}</b>.
              </p>
            ) : (
              <form onSubmit={onCapture} style={{ marginTop: 16 }}>
                <p style={{ fontSize: 14, marginBottom: 8 }}>
                  Want this summary in writing? We’ll email your obligation and a
                  checklist of what needs posting.
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
                    {capture === 'submitting' ? 'Sending…' : 'Email it to me'}
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
            Most <b>condos with 25+ units</b> are now required to maintain a
            compliant website. The penalty for falling behind:
            <span className="mk-pen">
              <span className="mk-big">$50</span>
              <span style={{ opacity: 0.85 }}>per day, per association</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
