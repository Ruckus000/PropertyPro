import { describe, expect, it } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComplianceChecker } from '../../../src/components/marketing/compliance-checker';

const INVALID_ERROR = /enter a whole number of units or parcels/i;

function setCount(value: string) {
  fireEvent.change(screen.getByLabelText(/units or parcels/i), {
    target: { value },
  });
}

function clickCheck() {
  fireEvent.click(screen.getByRole('button', { name: /check/i }));
}

describe('ComplianceChecker', () => {
  it('renders the prompt and the obligation deadlines', () => {
    render(<ComplianceChecker />);
    expect(screen.getByText(/Is your association required to comply/i)).toBeTruthy();
    // Reframed present-tense default copy.
    expect(
      screen.getByText(/now required to maintain a compliant website/i),
    ).toBeTruthy();
    // The deadline cadence replaced the money claim as the default hook.
    expect(screen.getByText(/30 days/)).toBeTruthy();
    expect(screen.getByText(/48 hours/)).toBeTruthy();
  });

  it('makes no penalty claim in the default state', () => {
    // Regression guard. "$50 per day, per association" was presented here as the
    // penalty for lacking a website. It is really minimum damages for an
    // unanswered written records request (§718.111(12)(c)), capped at 10 days.
    // We sell records integrity to fiduciaries — an overstated citation on our
    // own homepage undermines the exact attribute being bought.
    const { container } = render(<ComplianceChecker />);
    expect(container.textContent).not.toMatch(/\$\d/);
    expect(container.textContent).not.toMatch(/per day/i);
    expect(container.textContent).not.toMatch(/penalty|fine/i);
  });

  it('computes a condo 84-unit obligation on check', () => {
    render(<ComplianceChecker />);
    setCount('84');
    clickCheck();
    // The Jan 1 2026 date appears in BOTH the headline <b> and the detail text,
    // so use getAllByText (getByText throws on multiple matches).
    expect(screen.getAllByText(/January 1, 2026/).length).toBeGreaterThan(0);
  });

  it('shows a "Get compliant" CTA to /signup for a required condo result', () => {
    render(<ComplianceChecker />);
    setCount('84');
    clickCheck();
    const cta = screen.getByRole('link', { name: /get compliant/i });
    expect(cta).toBeTruthy();
    expect(cta.getAttribute('href')).toBe('/signup');
  });

  it('does NOT show the CTA for an exempt condo result', () => {
    render(<ComplianceChecker />);
    setCount('10');
    clickCheck();
    // Exempt result still renders.
    expect(screen.getByText(/currently exempt/i)).toBeTruthy();
    // But no CTA.
    expect(screen.queryByRole('link', { name: /get compliant/i })).toBeNull();
  });

  it('computes an HOA obligation on check', () => {
    render(<ComplianceChecker />);
    fireEvent.change(screen.getByLabelText(/association type/i), {
      target: { value: 'hoa' },
    });
    setCount('150');
    clickCheck();
    expect(screen.getByText(/100\+ parcels/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /get compliant/i })).toBeTruthy();
  });

  describe('strict whole-number validation', () => {
    const invalidCases = ['25.5', '1,000', '1e9', 'abc', '-5', '0', '', '+25', '00'];
    for (const value of invalidCases) {
      it(`rejects ${JSON.stringify(value)} with a friendly error and no result`, () => {
        render(<ComplianceChecker />);
        if (value !== '') {
          setCount(value);
        }
        clickCheck();
        expect(screen.getByText(INVALID_ERROR)).toBeTruthy();
        // No obligation headline should be present.
        expect(screen.queryByText(/Required now/i)).toBeNull();
        expect(screen.queryByText(/Not yet required/i)).toBeNull();
      });
    }
  });

  it('clears a stale result when the count input changes', () => {
    render(<ComplianceChecker />);
    setCount('84');
    clickCheck();
    expect(screen.getAllByText(/January 1, 2026/).length).toBeGreaterThan(0);

    // Editing the input clears the previous result.
    setCount('8');
    expect(screen.queryByText(/January 1, 2026/)).toBeNull();
    expect(screen.queryByText(/Required now/i)).toBeNull();
  });

  it('clears a stale result when the association type changes', () => {
    render(<ComplianceChecker />);
    setCount('84');
    clickCheck();
    expect(screen.getAllByText(/January 1, 2026/).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText(/association type/i), {
      target: { value: 'hoa' },
    });
    expect(screen.queryByText(/January 1, 2026/)).toBeNull();
    expect(screen.queryByText(/Required now/i)).toBeNull();
  });
});
