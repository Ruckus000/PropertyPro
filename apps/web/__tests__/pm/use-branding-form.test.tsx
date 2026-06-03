import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import { useSaveBranding } from '@/hooks/use-branding-form';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const BASE = {
  communityId: 1,
  primaryColor: '#111111',
  secondaryColor: '#222222',
  accentColor: '#333333',
  fontHeading: 'Inter',
  fontBody: 'Inter',
  customEmailFooter: '',
};

/** Route the global fetch mock by URL + method. Returns the PATCH body for assertions. */
function installFetch() {
  const calls: { url: string; method?: string; body?: unknown }[] = [];
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    let parsed: unknown;
    if (typeof init?.body === 'string') {
      try { parsed = JSON.parse(init.body); } catch { parsed = init.body; }
    }
    calls.push({ url, method: init?.method, body: parsed });
    if (url === '/api/v1/upload') {
      return { ok: true, json: async () => ({ data: { path: 'uploads/raw/x.png', uploadUrl: 'http://storage/put' } }) } as Response;
    }
    if (url === 'http://storage/put') return { ok: true } as Response;
    if (url === '/api/v1/pm/branding') return { ok: true, json: async () => ({}) } as Response;
    throw new Error(`unexpected fetch ${url}`);
  }) as unknown as typeof fetch;
  return { calls, patchBody: () => calls.find((c) => c.url === '/api/v1/pm/branding')?.body as Record<string, unknown> };
}

beforeEach(() => vi.clearAllMocks());

describe('useSaveBranding — site logo', () => {
  it('uploads a site logo file and PATCHes with siteLogoStoragePath', async () => {
    const f = installFetch();
    const file = new File(['x'], 'wide.png', { type: 'image/png' });
    const { result } = renderHook(() => useSaveBranding(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ...BASE, logoFile: null, siteLogoFile: file });
    });
    // presign + PUT happened
    expect(f.calls.some((c) => c.url === '/api/v1/upload')).toBe(true);
    expect(f.calls.some((c) => c.url === 'http://storage/put' && c.method === 'PUT')).toBe(true);
    // PATCH carries siteLogoStoragePath, not logoStoragePath
    expect(f.patchBody()).toMatchObject({ siteLogoStoragePath: 'uploads/raw/x.png' });
    expect(f.patchBody()).not.toHaveProperty('logoStoragePath');
  });

  it('omits siteLogoStoragePath when no site logo is selected', async () => {
    const f = installFetch();
    const { result } = renderHook(() => useSaveBranding(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ ...BASE, logoFile: null, siteLogoFile: null });
    });
    expect(f.calls.some((c) => c.url === '/api/v1/upload')).toBe(false);
    expect(f.patchBody()).not.toHaveProperty('siteLogoStoragePath');
  });
});
