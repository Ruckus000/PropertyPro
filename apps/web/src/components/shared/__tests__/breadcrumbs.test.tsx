import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumbs } from '../breadcrumbs';

describe('Breadcrumbs', () => {
  it('renders only the current label when items is empty', () => {
    render(<Breadcrumbs currentLabel="Edit profile" />);
    const current = screen.getByText('Edit profile');
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders one parent crumb + separator + current label', () => {
    render(
      <Breadcrumbs
        items={[{ label: 'Announcements', href: '/announcements?communityId=1' }]}
        currentLabel="Testing 1"
      />,
    );
    const parent = screen.getByRole('link', { name: 'Announcements' });
    expect(parent.getAttribute('href')).toBe('/announcements?communityId=1');
    expect(screen.getByText('Testing 1').getAttribute('aria-current')).toBe('page');
  });

  it('renders multiple parent crumbs with separators', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Help Center', href: '/help?communityId=1' },
          { label: 'Account', href: '/help/account?communityId=1' },
        ]}
        currentLabel="Closing your account"
      />,
    );
    expect(screen.getByRole('link', { name: 'Help Center' })).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Account' })).not.toBeNull();
    expect(screen.getByText('Closing your account').getAttribute('aria-current')).toBe('page');
  });

  it('does NOT render a <nav> element (PageHeader provides the landmark)', () => {
    const { container } = render(<Breadcrumbs currentLabel="Test" />);
    expect(container.querySelector('nav')).toBeNull();
  });

  it('separators are aria-hidden so screen readers skip them', () => {
    const { container } = render(
      <Breadcrumbs
        items={[{ label: 'Parent', href: '/parent' }]}
        currentLabel="Child"
      />,
    );
    const separator = container.querySelector('[aria-hidden="true"]');
    expect(separator).not.toBeNull();
  });

  it('merges className prop', () => {
    const { container } = render(
      <Breadcrumbs currentLabel="Test" className="my-custom-class" />,
    );
    const ol = container.firstChild as HTMLElement;
    expect(ol.classList.contains('my-custom-class')).toBe(true);
  });
});
