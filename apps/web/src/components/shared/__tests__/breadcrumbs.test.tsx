import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Breadcrumbs } from '../breadcrumbs';

// The visible breadcrumb trail now lives in the app shell
// (components/layout/shell-breadcrumbs.tsx). Pages still author
// <PageHeader breadcrumb={<Breadcrumbs items currentLabel/>}> to satisfy the
// breadcrumb CI guard, but the component itself renders nothing — its label
// data is no longer used. See build-auto-trail.test.ts for the trail logic.
describe('Breadcrumbs', () => {
  it('renders nothing (no DOM output) with only a currentLabel', () => {
    const { container } = render(<Breadcrumbs currentLabel="Edit profile" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing even when items are provided', () => {
    const { container } = render(
      <Breadcrumbs
        items={[
          { label: 'Help Center', href: '/help?communityId=1' },
          { label: 'Account', href: '/help/account?communityId=1' },
        ]}
        currentLabel="Closing your account"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('does NOT render a <nav> element (the shell owns the Breadcrumb landmark)', () => {
    const { container } = render(<Breadcrumbs currentLabel="Test" />);
    expect(container.querySelector('nav')).toBeNull();
  });
});
