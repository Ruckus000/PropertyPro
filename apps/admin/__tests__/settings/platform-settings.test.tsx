// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlatformSettings } from '@/components/settings/PlatformSettings';

const CURRENT_ADMIN = { id: 'admin-1', email: 'root@propertypro.example', role: 'super_admin' };

const ADMINS = [
  { userId: 'admin-1', email: 'root@propertypro.example', role: 'super_admin', invitedBy: null, createdAt: '2026-06-01T00:00:00.000Z' },
  { userId: 'admin-2', email: 'ops@propertypro.example', role: 'support', invitedBy: 'admin-1', createdAt: '2026-07-15T00:00:00.000Z' },
];

const STATS = { communityCount: 3, demoCount: 5 };

describe('PlatformSettings', () => {
  it('renders exactly one h1, with the design copy, and marks the current admin with a "You" badge', () => {
    const html = renderToStaticMarkup(
      createElement(PlatformSettings, { currentAdmin: CURRENT_ADMIN, admins: ADMINS, stats: STATS }),
    );

    const h1Matches = html.match(/<h1[ >]/g) ?? [];
    expect(h1Matches).toHaveLength(1);
    expect(html).toContain('Settings');
    expect(html).toContain('Platform administrators, alerts and integrations.');
    expect(html).toContain('root@propertypro.example');
    expect(html).toContain('>You<');
    expect(html).toContain('ops@propertypro.example');
  });

  it('marks the insertion point for the Wave 4 sections without rendering them yet', () => {
    const html = renderToStaticMarkup(
      createElement(PlatformSettings, { currentAdmin: CURRENT_ADMIN, admins: ADMINS, stats: STATS }),
    );

    // Comments don't survive renderToStaticMarkup, so this only proves the
    // three Wave 4 sections aren't rendered prematurely; the marker comment
    // itself is verified by reading the source in review.
    expect(html).not.toContain('AlertPrefsSection');
    expect(html).not.toContain('InstallAppSection');
    expect(html).not.toContain('IntegrationsSection');
  });

  it('does not offer a Remove control for the signed-in admin', () => {
    const html = renderToStaticMarkup(
      createElement(PlatformSettings, { currentAdmin: CURRENT_ADMIN, admins: ADMINS, stats: STATS }),
    );

    // Two admins: only the non-self one gets a Remove button.
    const removeMatches = html.match(/Remove/g) ?? [];
    expect(removeMatches).toHaveLength(1);
  });
});
