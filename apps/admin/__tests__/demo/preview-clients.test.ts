import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SplitPreviewClient } from '../../src/app/demo/[id]/preview/SplitPreviewClient';
import { MobilePreviewClient } from '../../src/app/demo/[id]/mobile/MobilePreviewClient';

describe('demo preview clients', () => {
  it('renders copy shareable link control in split preview', () => {
    const html = renderToStaticMarkup(
      createElement(SplitPreviewClient, {
        boardUrl: 'http://localhost:3000/api/v1/auth/demo-login?token=abc',
        residentUrl: 'http://localhost:3000/api/v1/auth/demo-login?token=def',
      }),
    );

    expect(html).toContain('Copy shareable link');
  });

  it('disables copy control when board URL is missing', () => {
    const html = renderToStaticMarkup(
      createElement(SplitPreviewClient, {
        boardUrl: null,
        residentUrl: 'http://localhost:3000/api/v1/auth/demo-login?token=def',
      }),
    );

    expect(html).toContain('Copy shareable link');
    expect(html).toMatch(/<button[^>]*disabled/);
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
