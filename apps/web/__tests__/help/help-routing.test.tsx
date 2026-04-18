import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_REGISTRY } from '../../src/lib/constants/feature-registry';

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
    const middlewarePath = path.resolve(__dirname, '../../src/middleware.ts');

    expect(helpItem?.href).toBe('/help');
    expect(fs.existsSync(helpPagePath)).toBe(true);
    expect(fs.readFileSync(middlewarePath, 'utf8')).toContain("'\/help'");
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
