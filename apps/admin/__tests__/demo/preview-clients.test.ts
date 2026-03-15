import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TabbedPreviewClient } from '../../src/app/demo/[id]/preview/TabbedPreviewClient';
import { MobilePreviewClient } from '../../src/app/demo/[id]/mobile/MobilePreviewClient';

describe('demo preview clients', () => {
  it('renders all four tab labels', () => {
    const html = renderToStaticMarkup(
      createElement(TabbedPreviewClient, {
        publicUrl: 'http://localhost:3000/demo-test',
        mobileUrl: 'http://localhost:3000/api/v1/auth/demo-login?token=abc',
        complianceUrl: 'http://localhost:3000/api/v1/auth/demo-login?token=def&redirect=%2Fcompliance',
        adminUrl: 'http://localhost:3000/api/v1/auth/demo-login?token=ghi',
      }),
    );

    expect(html).toContain('Public Website');
    expect(html).toContain('Mobile App');
    expect(html).toContain('Compliance');
    expect(html).toContain('Admin Dashboard');
  });

  it('renders copy link control', () => {
    const html = renderToStaticMarkup(
      createElement(TabbedPreviewClient, {
        publicUrl: 'http://localhost:3000/demo-test',
        mobileUrl: null,
        complianceUrl: null,
        adminUrl: null,
      }),
    );

    expect(html).toContain('Copy link');
  });

  it('disables tabs with null URLs', () => {
    const html = renderToStaticMarkup(
      createElement(TabbedPreviewClient, {
        publicUrl: 'http://localhost:3000/demo-test',
        mobileUrl: null,
        complianceUrl: null,
        adminUrl: null,
      }),
    );

    // Public Website tab should not be disabled
    // Mobile, Compliance, Admin should be disabled (disabled="" attribute)
    const disabledButtons = html.match(/<button[^>]*disabled=""/g) ?? [];
    expect(disabledButtons.length).toBe(3);
  });

  it('renders mobile back and split-screen navigation links', () => {
    const splitPreviewHref = '/demo/77/preview';
    const html = renderToStaticMarkup(
      createElement(MobilePreviewClient, {
        src: 'http://localhost:3000/api/v1/auth/demo-login?token=ghi',
        splitPreviewHref,
      }),
    );

    expect(html).toContain('Back to Split Preview');
    expect(html).toContain('Switch to split-screen');
    expect(html).toContain(`href="${splitPreviewHref}"`);
  });
});
