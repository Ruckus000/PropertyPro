/**
 * The shell breadcrumb on the PM portfolio pages. Communities is the portfolio
 * home: its home crumb and the page are both "Communities", which used to read
 * "Communities › Communities". A crumb that links to the page you are on is
 * dropped, and a lone leaf hides the strip.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const nav = vi.hoisted(() => ({ pathname: '/pm/dashboard/communities' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

import { ShellBreadcrumbs } from '../../src/components/layout/shell-breadcrumbs';

afterEach(cleanup);

describe('ShellBreadcrumbs on the PM portfolio', () => {
  it('shows no strip on Communities itself', () => {
    nav.pathname = '/pm/dashboard/communities';
    render(<ShellBreadcrumbs role="property_manager" community={null} features={null} />);

    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull();
  });

  it('links back to Communities from Reports', () => {
    nav.pathname = '/pm/reports';
    render(<ShellBreadcrumbs role="property_manager" community={null} features={null} />);

    const strip = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(strip).toHaveTextContent(/Communities.*Reports/);
    expect(screen.getByRole('link', { name: 'Communities' })).toHaveAttribute(
      'href',
      '/pm/dashboard/communities',
    );
    expect(screen.getAllByText('Communities')).toHaveLength(1);
  });

  it('keeps the Communities crumb on a community page', () => {
    nav.pathname = '/documents';
    render(
      <ShellBreadcrumbs
        role="property_manager"
        community={{ id: 7, name: 'Sunset Towers' }}
        features={null}
      />,
    );

    expect(screen.getByRole('link', { name: 'Communities' })).toHaveAttribute(
      'href',
      '/pm/dashboard/communities',
    );
  });
});
