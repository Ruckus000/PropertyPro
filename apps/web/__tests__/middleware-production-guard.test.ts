import { describe, expect, it } from 'vitest';
import { shouldHideDevSurfaceInProduction } from '../src/middleware';

describe('production development-surface guard', () => {
  it.each([
    '/pdfjs-test',
    '/pdfjs-test/viewer',
    '/dev/site-preview',
    '/dev/reset-onboarding',
    '/dev/login',
    '/dev/login/board_member',
  ])('hides %s in production', (pathname) => {
    expect(shouldHideDevSurfaceInProduction(pathname, 'production')).toBe(true);
  });

  it('keeps development surfaces available outside production', () => {
    expect(shouldHideDevSurfaceInProduction('/pdfjs-test', 'development')).toBe(false);
  });

  it.each(['/dev/agent-login', '/dev/login-something'])(
    'does not hide %s in production',
    (pathname) => {
      expect(shouldHideDevSurfaceInProduction(pathname, 'production')).toBe(false);
    },
  );
});
