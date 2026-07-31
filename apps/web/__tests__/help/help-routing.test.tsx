import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_REGISTRY } from '../../src/lib/constants/feature-registry';
import { PROTECTED_PATH_PREFIXES } from '../../src/lib/middleware/public-host-routes';

const { headersMock, redirectMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
  redirectMock: vi.fn((target: string) => {
    throw new Error(`redirect:${target}`);
  }),
}));

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('help center routing contracts', () => {
  it('keeps the shared help registry pointed at a protected /help page', () => {
    const helpItem = FEATURE_REGISTRY.find((item) => item.id === 'page-help');
    const helpPagePath = path.resolve(
      __dirname,
      '../../src/app/(authenticated)/help/page.tsx',
    );
    expect(helpItem?.href).toBe('/help');
    expect(fs.existsSync(helpPagePath)).toBe(true);
    // The protected-route table moved out of middleware.ts into
    // public-host-routes.ts in 11b-2 (S1), so the reserved public-page slugs
    // could be derived from it instead of hand-copied. Assert the value rather
    // than grepping a file for a literal — the contract is "/help is protected",
    // not "middleware.ts contains this string".
    expect(PROTECTED_PATH_PREFIXES).toContain('/help');
  });
});

describe('mobile help redirects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers({ 'x-community-id': '42' }));
  });

  it('redirects /mobile/help to canonical /help', async () => {
    const page = (await import('../../src/app/mobile/help/page')).default;

    await expect(page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'redirect:/help?communityId=42',
    );
  });

  it('redirects /mobile/help/contact to canonical /help/contact', async () => {
    const page = (await import('../../src/app/mobile/help/contact/page')).default;

    await expect(page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'redirect:/help/contact?communityId=42',
    );
  });

  it('redirects /mobile/help/manage to canonical /help/manage', async () => {
    const page = (await import('../../src/app/mobile/help/manage/page')).default;

    await expect(page({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'redirect:/help/manage?communityId=42',
    );
  });
});
