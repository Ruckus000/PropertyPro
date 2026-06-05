import { describe, expect, it } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComplianceChecker } from '../../../src/components/marketing/compliance-checker';

describe('ComplianceChecker', () => {
  it('renders the prompt and an initial penalty fact', () => {
    render(<ComplianceChecker />);
    expect(screen.getByText(/Is your association required to comply/i)).toBeTruthy();
    expect(screen.getByText(/\$50/)).toBeTruthy();
  });

  it('computes a condo 84-unit obligation on check', () => {
    render(<ComplianceChecker />);
    fireEvent.change(screen.getByLabelText(/units or parcels/i), {
      target: { value: '84' },
    });
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    // The Jan 1 2026 date appears in BOTH the headline <b> and the detail text,
    // so use getAllByText (getByText throws on multiple matches).
    expect(screen.getAllByText(/January 1, 2026/).length).toBeGreaterThan(0);
  });

  it('shows a friendly message for empty/invalid input instead of crashing', () => {
    render(<ComplianceChecker />);
    fireEvent.click(screen.getByRole('button', { name: /check/i }));
    expect(screen.getByText(/enter a number/i)).toBeTruthy();
  });
});
