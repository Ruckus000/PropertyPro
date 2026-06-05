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
    const n = Number.parseInt(count, 10);
    if (!Number.isInteger(n) || n < 1) {
      setResult(null);
      setError('Please enter a number of units or parcels.');
      return;
    }
    setError(null);
    setResult(getComplianceObligation({ type, count: n }));
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
          onChange={(e) => setType(e.target.value as AssociationType)}
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
          onChange={(e) => setCount(e.target.value)}
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
          </>
        ) : (
          <>
            Most <b>condos with 25+ units</b> must be fully compliant by{' '}
            <b>January 1, 2026</b>. The penalty for falling behind:
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
