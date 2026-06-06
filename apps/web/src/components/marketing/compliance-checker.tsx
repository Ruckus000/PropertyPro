'use client';

import React, { useState } from 'react';
import {
  getComplianceObligation,
  type AssociationType,
  type ObligationResult,
} from '@/lib/marketing/compliance-obligation';

/**
 * Interactive "is your association required to comply?" checker for the
 * landing page. General information only — not legal advice.
 */
export function ComplianceChecker() {
  const [type, setType] = useState<AssociationType>('condo');
  const [count, setCount] = useState('');
  const [result, setResult] = useState<ObligationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    } catch {
      setResult(null);
      setError('We couldn’t check that. Please try again.');
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
