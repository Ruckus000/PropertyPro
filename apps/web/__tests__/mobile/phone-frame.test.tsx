import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhoneFrame } from '../../src/components/mobile/PhoneFrame';

describe('PhoneFrame', () => {
  it('renders an iframe with default src when communityId provided', () => {
    render(<PhoneFrame communityId={42} />);
    const iframe = screen.getByTitle('Mobile portal preview') as HTMLIFrameElement;
    expect(iframe.src).toContain('/mobile?communityId=42');
  });

  it('renders an iframe with explicit src when provided', () => {
    render(<PhoneFrame src="/mobile/documents?communityId=5" />);
    const iframe = screen.getByTitle('Mobile portal preview') as HTMLIFrameElement;
    expect(iframe.src).toContain('/mobile/documents?communityId=5');
  });

  it('falls back to /mobile when neither src nor communityId provided', () => {
    render(<PhoneFrame />);
    const iframe = screen.getByTitle('Mobile portal preview') as HTMLIFrameElement;
    expect(iframe.src).toContain('/mobile');
  });

  it('has loading="lazy" attribute', () => {
    render(<PhoneFrame communityId={1} />);
    const iframe = screen.getByTitle('Mobile portal preview');
    expect(iframe).toHaveAttribute('loading', 'lazy');
  });

  it('has accessible label on outer container', () => {
    render(<PhoneFrame communityId={1} />);
    expect(screen.getByRole('generic', { name: 'Mobile portal preview' })).toBeDefined();
  });

  it('has sandbox attribute to prevent frame navigation', () => {
    render(<PhoneFrame communityId={1} />);
    const iframe = screen.getByTitle('Mobile portal preview');
    expect(iframe).toHaveAttribute('sandbox');
    expect(iframe.getAttribute('sandbox')).toContain('allow-same-origin');
  });
});
