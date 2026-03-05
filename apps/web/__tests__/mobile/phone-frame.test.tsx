import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhoneFrame } from '@propertypro/ui';

describe('PhoneFrame', () => {
  it('renders an iframe with the given src', () => {
    render(<PhoneFrame src="/mobile?communityId=42" />);
    const iframe = screen.getByTitle('Mobile portal preview') as HTMLIFrameElement;
    expect(iframe.src).toContain('/mobile?communityId=42');
  });

  it('has loading="lazy" attribute', () => {
    render(<PhoneFrame src="/mobile" />);
    const iframe = screen.getByTitle('Mobile portal preview');
    expect(iframe).toHaveAttribute('loading', 'lazy');
  });

  it('has accessible label on outer container', () => {
    render(<PhoneFrame src="/mobile" />);
    expect(screen.getByRole('generic', { name: 'Mobile portal preview' })).toBeDefined();
  });

  it('has sandbox attribute to prevent frame navigation', () => {
    render(<PhoneFrame src="/mobile" />);
    const iframe = screen.getByTitle('Mobile portal preview');
    expect(iframe).toHaveAttribute('sandbox');
    expect(iframe.getAttribute('sandbox')).toContain('allow-same-origin');
  });
});
