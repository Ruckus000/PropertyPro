import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiSummaryBar } from '@/components/pm/KpiSummaryBar';
import type { PortfolioDashboardData } from '@/hooks/use-portfolio-dashboard';

const mockKpis: PortfolioDashboardData['kpis'] = {
  totalUnits: { label: 'Total Units', value: 36, trend: 'neutral' },
  occupancyRate: { label: 'Occupancy Rate', value: 65, delta: 4, trend: 'up' },
  openMaintenance: { label: 'Open Maintenance', value: 7, delta: 100, trend: 'up' },
  complianceScore: { label: 'Compliance Score', value: 81, trend: 'neutral' },
  delinquencyTotal: { label: 'Delinquency', value: 225000, trend: 'neutral' },
  expiringLeases: { label: 'Expiring Leases', value: 4, trend: 'neutral' },
};

describe('KpiSummaryBar', () => {
  it('renders all KPI labels and values', () => {
    render(<KpiSummaryBar kpis={mockKpis} />);
    expect(screen.getByText('Units')).toBeInTheDocument();
    expect(screen.getByText('36')).toBeInTheDocument();
    expect(screen.getByText('Occupancy')).toBeInTheDocument();
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('Open Maint.')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Compliance')).toBeInTheDocument();
    expect(screen.getByText('81%')).toBeInTheDocument();
    expect(screen.getByText('Delinquency')).toBeInTheDocument();
    expect(screen.getByText('$2,250')).toBeInTheDocument();
  });

  it('renders skeleton when loading', () => {
    const { container } = render(<KpiSummaryBar kpis={undefined} isLoading />);
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});
