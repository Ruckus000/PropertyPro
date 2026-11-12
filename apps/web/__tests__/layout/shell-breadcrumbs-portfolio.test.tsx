/**
 * The shell breadcrumb on and around the PM portfolio pages.
 *
 * Communities is the portfolio home: its home crumb and the page are both
 * "Communities", which used to read "Communities › Communities". A crumb that
 * links to the page you are on is dropped, and a lone leaf hides the strip.
 *
 * Communities sends someone who manages one community straight back to it, so
 * on a community page the "Communities" crumb shows only once the user's
 * communities confirm there is more than one to choose from.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const nav = vi.hoisted(() => ({ pathname: '/pm/dashboard/communities' }));
const communities = vi.hoisted(() => ({ data: undefined as { id: number; role: string }[] | undefined, enabled: [] as boolean[] }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));
vi.mock('@/hooks/use-user-communities', () => ({
  useUserCommunities: (options: { enabled?: boolean } = {}) => {
    communities.enabled.push(options.enabled ?? true);
    return { data: communities.data };
  },
}));

import { ShellBreadcrumbs } from '../../src/components/layout/shell-breadcrumbs';

const SUNSET = { id: 7, name: 'Sunset Towers' };

beforeEach(() => {
  communities.data = [
    { id: 7, role: 'property_manager' },
    { id: 8, role: 'root_manager' },
  ];
  communities.enabled = [];
});

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
});

describe('ShellBreadcrumbs on a community page', () => {
  it('keeps the Communities crumb for someone who manages several', () => {
    nav.pathname = '/documents';
    render(<ShellBreadcrumbs role="property_manager" community={SUNSET} features={null} />);

    expect(screen.getByRole('link', { name: 'Communities' })).toHaveAttribute(
      'href',
      '/pm/dashboard/communities',
    );
  });

  it('drops it for someone who manages only this one, so it cannot bounce back', () => {
    communities.data = [
      { id: 7, role: 'root_manager' },
      { id: 9, role: 'resident' },
    ];
    nav.pathname = '/documents';
    render(<ShellBreadcrumbs role="root_manager" community={SUNSET} features={null} />);

    expect(screen.queryByRole('link', { name: 'Communities' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Sunset Towers' })).toHaveAttribute(
      'href',
      '/dashboard?communityId=7',
    );
  });

  it('counts communities, not role rows', () => {
    communities.data = [
      { id: 7, role: 'root_manager' },
      { id: 7, role: 'property_manager' },
    ];
    nav.pathname = '/documents';
    render(<ShellBreadcrumbs role="root_manager" community={SUNSET} features={null} />);

    expect(screen.queryByRole('link', { name: 'Communities' })).toBeNull();
  });

  it('holds it back until the list has loaded', () => {
    communities.data = undefined;
    nav.pathname = '/documents';
    render(<ShellBreadcrumbs role="property_manager" community={SUNSET} features={null} />);

    expect(screen.queryByRole('link', { name: 'Communities' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Sunset Towers' })).toBeInTheDocument();
  });

  it('does not ask for the list for a resident', () => {
    nav.pathname = '/documents';
    render(<ShellBreadcrumbs role="resident" community={SUNSET} features={null} />);

    expect(communities.enabled.every((e) => e === false)).toBe(true);
    expect(screen.queryByRole('link', { name: 'Communities' })).toBeNull();
  });
});
