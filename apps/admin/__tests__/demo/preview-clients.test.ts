import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TabbedPreviewClient } from '../../src/app/demo/[id]/preview/TabbedPreviewClient';
import { MobilePreviewClient } from '../../src/app/demo/[id]/mobile/MobilePreviewClient';

const defaultProps = {
  publicUrl: 'http://localhost:3000/demo-test',
  mobileUrl: 'http://localhost:3000/api/v1/auth/demo-login?token=abc',
  adminUrl: 'http://localhost:3000/api/v1/auth/demo-login?token=ghi',
  demoId: 1,
  communityId: 1,
  prospectName: 'Test Demo',
};

describe('demo preview clients', () => {
  it('renders all three tab labels', () => {
    const html = renderToStaticMarkup(
      createElement(TabbedPreviewClient, defaultProps),
    );

    expect(html).toContain('Public Website');
    expect(html).toContain('Mobile App');
    expect(html).toContain('Admin Dashboard');
  });

  it('renders copy link control', () => {
    const html = renderToStaticMarkup(
      createElement(TabbedPreviewClient, {
        ...defaultProps,
        mobileUrl: null,
        adminUrl: null,
      }),
    );

    expect(html).toContain('Copy link');
  });

  it('disables tabs with null URLs', () => {
    const html = renderToStaticMarkup(
      createElement(TabbedPreviewClient, {
        ...defaultProps,
        mobileUrl: null,
        adminUrl: null,
      }),
    );

    // Mobile and Admin should be disabled (disabled="" attribute)
    const disabledButtons = html.match(/<button[^>]*disabled=""/g) ?? [];
    expect(disabledButtons.length).toBe(2);
  });

  it('preloads all iframes on mount', () => {
    const html = renderToStaticMarkup(
      createElement(TabbedPreviewClient, defaultProps),
    );

    // All three iframes should be present in the static markup
    const iframes = html.match(/<iframe /g) ?? [];
    expect(iframes.length).toBe(3);
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
