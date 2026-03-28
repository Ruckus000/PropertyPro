import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const { resolveAuthPageBrandingMock } = vi.hoisted(() => ({
  resolveAuthPageBrandingMock: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/auth/login-form', () => ({
  LoginForm: () => <form aria-label="Login form" />,
}));

vi.mock('@/lib/auth/resolve-auth-page-branding', () => ({
  resolveAuthPageBranding: resolveAuthPageBrandingMock,
}));

import LoginPage from '../../src/app/auth/login/page';

describe('login page', () => {
  it('renders a signup CTA and forgot-password link', async () => {
    resolveAuthPageBrandingMock.mockResolvedValue({
      communityName: null,
      hasTenantContext: false,
      logoUrl: null,
      fontLinks: [],
      cssVars: {},
    });

    const element = await LoginPage({
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain('href="/signup"');
    expect(html).toContain('Create your account');
    expect(html).toContain('href="/auth/forgot-password"');
  });
});
