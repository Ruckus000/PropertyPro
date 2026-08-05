'use client';

import React, { useState } from 'react';
import { submitPmInquiry } from '@/hooks/use-capture-lead';

/**
 * Portfolio inquiry form for management companies.
 *
 * Replaces the `mailto:` that the Property Manager pricing tier used to point
 * at — see docs/gtm/03-LAUNCH-READINESS.md item B3. Submissions land in
 * `marketing_leads` alongside compliance-checker leads, tagged
 * `source = 'pm_inquiry'`.
 *
 * State machine mirrors `compliance-checker.tsx` deliberately: two public forms
 * on the same site behaving differently under error is a worse outcome than a
 * little duplication.
 */
type SubmitState = 'idle' | 'submitting' | 'done' | 'error';

function parseCount(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number.parseInt(trimmed, 10);
  return parsed > 0 ? parsed : undefined;
}

export function PortfolioInquiryForm() {
  const [email, setEmail] = useState('');
  const [contactName, setContactName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [communityCount, setCommunityCount] = useState('');
  const [unitCount, setUnitCount] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail.includes('@')) {
      setState('error');
      setError('Please enter a valid email address.');
      return;
    }

    setState('submitting');
    setError(null);
    try {
      await submitPmInquiry({
        email: trimmedEmail,
        contactName: contactName.trim() || undefined,
        companyName: companyName.trim() || undefined,
        communityCount: parseCount(communityCount),
        unitCount: parseCount(unitCount),
        message: message.trim() || undefined,
      });
      setState('done');
    } catch {
      setState('error');
      setError('We couldn’t send that. Please try again.');
    }
  }

  if (state === 'done') {
    return (
      <div className="mk-note" role="status">
        <strong>Thanks — we’ve got it.</strong>
        <div>
          We’ll reply to <b>{email.trim()}</b> within one business day.
        </div>
      </div>
    );
  }

  return (
    <form className="mk-form" onSubmit={onSubmit}>
      <div className="mk-form-row">
        <label className="mk-label" htmlFor="mk-pm-email">
          Work email
        </label>
        <input
          id="mk-pm-email"
          className="mk-input"
          type="email"
          autoComplete="email"
          placeholder="you@managementco.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === 'error') {
              setState('idle');
              setError(null);
            }
          }}
          aria-invalid={state === 'error' ? true : undefined}
          required
        />
      </div>

      <div className="mk-form-grid">
        <div className="mk-form-row">
          <label className="mk-label" htmlFor="mk-pm-name">
            Your name
          </label>
          <input
            id="mk-pm-name"
            className="mk-input"
            autoComplete="name"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </div>

        <div className="mk-form-row">
          <label className="mk-label" htmlFor="mk-pm-company">
            Company
          </label>
          <input
            id="mk-pm-company"
            className="mk-input"
            autoComplete="organization"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>
      </div>

      <div className="mk-form-grid">
        <div className="mk-form-row">
          <label className="mk-label" htmlFor="mk-pm-communities">
            Associations managed
          </label>
          <input
            id="mk-pm-communities"
            className="mk-input"
            inputMode="numeric"
            placeholder="e.g. 12"
            value={communityCount}
            onChange={(e) => setCommunityCount(e.target.value)}
          />
        </div>

        <div className="mk-form-row">
          <label className="mk-label" htmlFor="mk-pm-units">
            Total units (approx.)
          </label>
          <input
            id="mk-pm-units"
            className="mk-input"
            inputMode="numeric"
            placeholder="e.g. 1,400"
            value={unitCount}
            onChange={(e) => setUnitCount(e.target.value)}
          />
        </div>
      </div>

      <div className="mk-form-row">
        <label className="mk-label" htmlFor="mk-pm-message">
          What are you trying to solve?
        </label>
        <textarea
          id="mk-pm-message"
          className="mk-textarea"
          placeholder="Which associations are behind on compliance, what you use today, anything else useful."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      {error ? (
        <p className="mk-form-error" role="alert">
          {error}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          className="mk-pill mk-pill-primary"
          disabled={state === 'submitting'}
        >
          {state === 'submitting' ? 'Sending…' : 'Send inquiry'}
        </button>
      </div>
    </form>
  );
}
