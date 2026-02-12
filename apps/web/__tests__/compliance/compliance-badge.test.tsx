import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComplianceStatusBadge } from '../../src/components/compliance/compliance-badge';

describe('p1-10 compliance status badge colors', () => {
  it('satisfied maps to success (green)', () => {
    const html = renderToStaticMarkup(<ComplianceStatusBadge status="satisfied" />);
    expect(html).toContain('var(--status-success)');
  });

  it('overdue maps to danger (red)', () => {
    const html = renderToStaticMarkup(<ComplianceStatusBadge status="overdue" />);
    expect(html).toContain('var(--status-danger)');
  });

  it('unsatisfied maps to warning (yellow)', () => {
    const html = renderToStaticMarkup(<ComplianceStatusBadge status="unsatisfied" />);
    expect(html).toContain('var(--status-warning)');
  });

  it('not_applicable maps to neutral (gray)', () => {
    const html = renderToStaticMarkup(<ComplianceStatusBadge status="not_applicable" />);
    expect(html).toContain('var(--status-neutral)');
  });
});
