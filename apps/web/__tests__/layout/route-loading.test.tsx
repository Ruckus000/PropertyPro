import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthenticatedRouteLoading } from '../../src/components/layout/authenticated-route-loading';
import { MobileRouteLoading } from '../../src/components/mobile/mobile-route-loading';

describe('route loading components', () => {
  it('renders the authenticated route loading skeleton with a status label', () => {
    render(<AuthenticatedRouteLoading label="Loading dashboard content" />);

    expect(
      screen.getByRole('status', { name: 'Loading dashboard content' }),
    ).toBeInTheDocument();
  });

  it('renders the mobile route loading skeleton with a status label', () => {
    render(<MobileRouteLoading label="Loading mobile content" />);

    expect(
      screen.getByRole('status', { name: 'Loading mobile content' }),
    ).toBeInTheDocument();
  });
});
