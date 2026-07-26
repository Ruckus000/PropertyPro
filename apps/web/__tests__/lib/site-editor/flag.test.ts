/**
 * Rollout-flag semantics.
 *
 * The flag is a rollout switch, not an entitlement. These tests pin the two
 * properties that keep it from drifting into a security boundary: it is
 * strictly opt-in (anything other than the exact string 'true' is off), and it
 * is read from a server-only variable.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { isSiteEditorV3Enabled, siteEditorV3Path } from '@/lib/site-editor/flag';

const ORIGINAL = process.env['SITE_EDITOR_V3_ENABLED'];

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env['SITE_EDITOR_V3_ENABLED'];
  else process.env['SITE_EDITOR_V3_ENABLED'] = ORIGINAL;
});

describe('isSiteEditorV3Enabled', () => {
  it('is on only for the exact string "true"', () => {
    process.env['SITE_EDITOR_V3_ENABLED'] = 'true';
    expect(isSiteEditorV3Enabled()).toBe(true);
  });

  it.each(['', 'false', 'TRUE', 'True', '1', 'yes', 'on', ' true'])(
    'is off for %o',
    (value) => {
      process.env['SITE_EDITOR_V3_ENABLED'] = value;
      expect(isSiteEditorV3Enabled()).toBe(false);
    },
  );

  it('is off when unset — the safe default for a rollout', () => {
    delete process.env['SITE_EDITOR_V3_ENABLED'];
    expect(isSiteEditorV3Enabled()).toBe(false);
  });

  it('is not exposed to the client bundle', () => {
    // A NEXT_PUBLIC_ twin would be inlined into client JS and invite being
    // treated as an access check. Assert the server-only name is the only one.
    expect(process.env['NEXT_PUBLIC_SITE_EDITOR_V3_ENABLED']).toBeUndefined();
  });
});

describe('siteEditorV3Path', () => {
  it('always carries the community scope', () => {
    expect(siteEditorV3Path(42)).toBe('/pm/website-editor?communityId=42');
  });

  it('stays under the /pm prefix so middleware protection applies', () => {
    // PROTECTED_PATH_PREFIXES in apps/web/src/middleware.ts contains '/pm'.
    // If this path ever moves out from under it, the route silently loses its
    // session gate.
    expect(siteEditorV3Path(1).startsWith('/pm/')).toBe(true);
  });
});
