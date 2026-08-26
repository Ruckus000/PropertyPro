'use client';

import React, { useState } from 'react';
import { SIGNUP_TRIAL_DAYS } from '@propertypro/shared';
import { daysInForce } from './days-in-force';

type AssociationType = 'condo' | 'hoa';

interface Verdict {
  required: boolean;
  /** Rendered as the leading bold sentence. */
  headline: string;
  body: string;
  cite: string;
}

/** Condominium thresholds: 150+ since 2019, 25+ since 2026-01-01. */
function condoVerdict(count: number, days: number): Verdict {
  if (count >= 150) {
    return {
      required: true,
      headline: 'Required — and has been since 2019.',
      body: `A condominium of ${count} units must maintain a website with the official records posted within 30 days, owner meeting notices 14 days ahead, and board meeting notices 48 hours ahead.`,
      cite: 'Fla. Stat. §718.111(12)(g)',
    };
  }
  if (count >= 25) {
    return {
      required: true,
      headline: 'Required, as of January 1, 2026.',
      body: `A condominium of ${count} units falls inside the 25-unit threshold: official records posted within 30 days, owner meeting notices 14 days ahead, board meeting notices 48 hours ahead. That has been the law for ${days.toLocaleString('en-US')} days.`,
      cite: 'Fla. Stat. §718.111(12)(g)',
    };
  }
  return {
    required: false,
    headline: 'Exempt from the website requirement.',
    body: 'Below 25 units a condominium isn’t required to publish online — but the duty to keep records, and to answer an owner’s written request inside the statutory window, still applies.',
    cite: 'Fla. Stat. §718.111(12)(c)',
  };
}

/** HOA threshold: 100+ parcels. */
function hoaVerdict(count: number): Verdict {
  if (count >= 100) {
    return {
      required: true,
      headline: 'Required.',
      body: `An HOA of ${count} parcels must maintain a website or application with the official records posted, member meeting notices 14 days ahead, and board meeting notices 48 hours ahead.`,
      cite: 'Fla. Stat. §720.303(4)',
    };
  }
  return {
    required: false,
    headline: 'Exempt from the website requirement.',
    body: 'Below 100 parcels an HOA isn’t required to publish online — but the duty to keep records and produce them on request still applies.',
    cite: 'Fla. Stat. §720.303(5)',
  };
}

/**
 * "Does my association need a website?" — thresholds only, no email capture.
 * Deliberately answers *exempt* honestly rather than steering every visitor to
 * signup; the section it lives in is titled "The honest answers" for a reason.
 */
export function ComplianceChecker() {
  const [type, setType] = useState<AssociationType>('condo');
  const [raw, setRaw] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState(false);

  /**
   * Strict whole numbers only — NOT the mockup's `replace(/[^\d]/g, '')`.
   * Stripping non-digits turns "25.5" into 255 and "-5" into 5, which answers a
   * statutory threshold question about a building the visitor does not have.
   * A wrong "you're exempt" here is the one output of this widget that could
   * actually cost a board something, so an unparseable count must fail loudly.
   * Leading zeros are rejected too, so "00" cannot read as a valid 0.
   */
  function check() {
    if (!/^[1-9]\d*$/.test(raw.trim())) {
      setVerdict(null);
      setError(true);
      return;
    }
    setError(false);
    setVerdict(
      type === 'condo'
        ? condoVerdict(Number(raw.trim()), daysInForce())
        : hoaVerdict(Number(raw.trim())),
    );
  }

  /** A result is only true for the inputs that produced it. */
  function clearResult() {
    setVerdict(null);
    setError(false);
  }

  return (
    <div className="mk-checker">
      <div>
        <h3>Check your own numbers.</h3>
        <p>Enter a unit or parcel count. No email required.</p>
        <div className="mk-cfield">
          <label className="sr-only" htmlFor="mk-ck-type">
            Association type
          </label>
          <select
            id="mk-ck-type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as AssociationType);
              clearResult();
            }}
          >
            <option value="condo">Condominium</option>
            <option value="hoa">HOA</option>
          </select>
          <label className="sr-only" htmlFor="mk-ck-n">
            Number of units or parcels
          </label>
          <input
            id="mk-ck-n"
            inputMode="numeric"
            autoComplete="off"
            placeholder="e.g. 84"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              clearResult();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                check();
              }
            }}
          />
          <button className="mk-pill mk-pill-primary" type="button" onClick={check}>
            Check
          </button>
        </div>
      </div>
      <div className="mk-cres" role="status">
        {error && <b>Enter a whole number of units or parcels.</b>}
        {!error && verdict === null && (
          <>
            <b>
              Condominiums at 25 or more units, and HOAs at 100 or more parcels, must
              maintain a compliant website.
            </b>{' '}
            Records go up within 30 days, owner meeting notices 14 days ahead, board
            meetings 48 hours ahead.
            <span className="mk-cite">Fla. Stat. §718.111(12)(g) · §720.303(4)</span>
          </>
        )}
        {!error && verdict !== null && (
          <>
            <b>{verdict.headline}</b> {verdict.body}
            <span className="mk-cite">{verdict.cite}</span>
            {verdict.required && (
              <a className="mk-pill mk-pill-inverse mk-pill-sm" href="/signup">
                Start a {SIGNUP_TRIAL_DAYS}-day trial
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
