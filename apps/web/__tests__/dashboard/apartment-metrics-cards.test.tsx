import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ApartmentMetricsCards } from '../../src/components/dashboard/apartment-metrics';
import type { ApartmentMetrics } from '../../src/lib/queries/apartment-metrics';

const BASE = {
  firstName: 'Jane',
  communityName: 'Sunset Ridge',
  timezone: 'America/New_York',
  openMaintenanceRequests: 3,
  announcements: [],
};

describe('ApartmentMetricsCards', () => {
  it('renders all four cards when lease metrics are visible (manager)', () => {
    const metrics: ApartmentMetrics = {
      ...BASE,
      leaseMetricsVisible: true,
      occupiedUnits: 2,
      vacantUnits: 0,
      totalUnits: 2,
      occupancyRate: 100,
      leaseExpirations: { within30Days: 1, within60Days: 1, within90Days: 1 },
      totalMonthlyRevenue: 3000,
    };
    const html = renderToStaticMarkup(<ApartmentMetricsCards metrics={metrics} />);
    expect(html).toContain('Occupancy');
    expect(html).toContain('Lease Expirations');
    expect(html).toContain('Monthly Revenue');
    expect(html).toContain('$3,000');
    expect(html).toContain('Maintenance');
  });

  it('renders only the maintenance card when lease metrics are withheld (resident)', () => {
    const metrics: ApartmentMetrics = {
      ...BASE,
      leaseMetricsVisible: false,
      occupiedUnits: null,
      vacantUnits: null,
      totalUnits: null,
      occupancyRate: null,
      leaseExpirations: null,
      totalMonthlyRevenue: null,
    };
    const html = renderToStaticMarkup(<ApartmentMetricsCards metrics={metrics} />);
    expect(html).not.toContain('Occupancy');
    expect(html).not.toContain('Lease Expirations');
    expect(html).not.toContain('Monthly Revenue');
    expect(html).toContain('Maintenance');
    expect(html).toContain('open requests');
  });
});
