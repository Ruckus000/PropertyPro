import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  TabbedPreviewClient,
  isPublicWebsiteTab,
} from '../../src/app/demo/[id]/preview/TabbedPreviewClient';
import { MobilePreviewClient } from '../../src/app/demo/[id]/mobile/MobilePreviewClient';
import { DemoEditDrawer } from '../../src/components/demo/DemoEditDrawer';

const defaultProps = {
  publicUrl: 'http://localhost:3000/demo-test',
  mobileUrl: 'http://localhost:3000/mobile?communityId=1&preview=true',
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
    expect(html).toContain('Tenant Portal');
    expect(html).toContain('Admin Dashboard');
  });

  it('shows floating edit control on initial public tab render', () => {
    const html = renderToStaticMarkup(
      createElement(TabbedPreviewClient, defaultProps),
    );

    expect(html).toContain('title="Edit demo"');
  });

  it('marks edit button visibility as public-tab only', () => {
    expect(isPublicWebsiteTab('public')).toBe(true);
    expect(isPublicWebsiteTab('mobile')).toBe(false);
    expect(isPublicWebsiteTab('admin')).toBe(false);
  });

  it('renders copy link control', () => {
    const html = renderToStaticMarkup(
      createElement(TabbedPreviewClient, {
        ...defaultProps,
        mobileUrl: null,
        adminUrl: null,
      }),
    );

    expect(html).toContain('Copy onboarding link');
  });

  it('disables tabs with null URLs', () => {
    const html = renderToStaticMarkup(
      createElement(TabbedPreviewClient, {
        ...defaultProps,
        mobileUrl: null,
        adminUrl: null,
      }),
    );

    // Mobile and Admin tabs should be disabled, plus any URL-dependent controls
    const disabledButtons = html.match(/<button[^>]*disabled=""/g) ?? [];
    expect(disabledButtons.length).toBeGreaterThanOrEqual(2);
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

  it('hides page template editing when preview tab is tenant portal', () => {
    const html = renderToStaticMarkup(
      createElement(DemoEditDrawer, {
        isOpen: true,
        onClose: () => {},
        demoId: 1,
        communityId: 1,
        prospectName: 'Test Demo',
        onSaved: () => {},
        previewTab: 'mobile',
      }),
    );

    expect(html).not.toContain('Page Template');
    expect(html).toContain('Branding');
  });

  it('renders drawer resize handle when edit drawer is open', () => {
    const html = renderToStaticMarkup(
      createElement(DemoEditDrawer, {
        isOpen: true,
        onClose: () => {},
        demoId: 1,
        communityId: 1,
        prospectName: 'Test Demo',
        onSaved: () => {},
        previewTab: 'public',
      }),
    );

    expect(html).toContain('data-testid="drawer-resize-handle"');
    expect(html).toContain('Resize edit demo drawer');
  });
});
