// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LeadsDashboard } from '@/components/leads/LeadsDashboard';
import type { AdminLead, LeadStats } from '@/lib/server/leads';

const STATS: LeadStats = { total: 2, new: 1, inIcp: 1, pmInquiries: 1, last7Days: 2 };

function lead(overrides: Partial<AdminLead> = {}): AdminLead {
  return {
    id: 1,
    email: 'board@sunset.example',
    associationName: 'Sunset Condos',
    contactName: 'Jamie Board',
    associationType: 'condo',
    unitCount: 80,
    communityCount: null,
    message: null,
    obligationRequired: true,
    source: 'compliance_checker',
    status: 'new',
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    inIcp: true,
    ...overrides,
  };
}

describe('LeadsDashboard', () => {
  it('renders the three KPI cards, quick filter tabs, and an ICP badge on an in-band lead', () => {
    global.fetch = vi.fn() as any;
    const html = renderToStaticMarkup(
      createElement(LeadsDashboard, { initialLeads: [lead()], initialStats: STATS }),
    );

    expect(html).toContain('Untouched');
    expect(html).toContain('In ICP');
    expect(html).toContain('Last 7 days');
    expect(html).toContain('Contacted');
    expect(html).toContain('Qualified');
    expect(html).toContain('ICP');
    expect(html).toContain('Sunset Condos');
    expect(html).toContain('href="mailto:board@sunset.example"');
    expect(html).toContain('href="/demo/new?lead=1"');
  });

  it('does not show the ICP badge for a lead outside the band', () => {
    global.fetch = vi.fn() as any;
    const html = renderToStaticMarkup(
      createElement(LeadsDashboard, {
        initialLeads: [lead({ id: 2, inIcp: false, associationName: 'Big Portfolio HOA' })],
        initialStats: STATS,
      }),
    );

    expect(html).toContain('Big Portfolio HOA');
    expect(html).not.toContain('>ICP<');
  });

  it('renders the empty state with no leads', () => {
    global.fetch = vi.fn() as any;
    const html = renderToStaticMarkup(
      createElement(LeadsDashboard, {
        initialLeads: [],
        initialStats: { total: 0, new: 0, inIcp: 0, pmInquiries: 0, last7Days: 0 },
      }),
    );

    expect(html).toContain('No leads yet');
  });
});
