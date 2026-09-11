// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlatformSettings } from '@/components/settings/PlatformSettings';
import { DEFAULT_ALERT_PREFS } from '@/lib/preferences/alert-prefs';

const CURRENT_ADMIN = { id: 'admin-1', email: 'root@propertypro.example', role: 'super_admin' };

const ADMINS = [
  { userId: 'admin-1', email: 'root@propertypro.example', role: 'super_admin', invitedBy: null, createdAt: '2026-06-01T00:00:00.000Z' },
  { userId: 'admin-2', email: 'ops@propertypro.example', role: 'support', invitedBy: 'admin-1', createdAt: '2026-07-15T00:00:00.000Z' },
];

const STATS = { communityCount: 3, demoCount: 5 };

/**
 * Every required prop, every time. An omitted one does not fail — it pins the
 * component to whatever the falsy path renders, and the assertions below go on
 * passing while measuring a shape no operator ever sees.
 */
const PROPS = {
  currentAdmin: CURRENT_ADMIN,
  admins: ADMINS,
  stats: STATS,
  alertPrefs: DEFAULT_ALERT_PREFS,
  integrations: {
    services: [
      { name: 'Stripe webhooks', state: 'ok', short: 'Processing', meta: '81 ms' },
      { name: 'Resend', state: 'ok', short: 'Reachable', meta: '120 ms' },
      { name: 'Supabase', state: 'ok', short: 'Reachable', meta: '9 ms' },
    ],
    sentryAnswered: true,
    stripeLivemode: false,
  },
} satisfies Parameters<typeof PlatformSettings>[0];

describe('PlatformSettings', () => {
  it('renders exactly one h1, with the design copy, and marks the current admin with a "You" badge', () => {
    const html = renderToStaticMarkup(
      createElement(PlatformSettings, PROPS),
    );

    const h1Matches = html.match(/<h1[ >]/g) ?? [];
    expect(h1Matches).toHaveLength(1);
    expect(html).toContain('Settings');
    expect(html).toContain('Platform administrators, alerts and integrations.');
    expect(html).toContain('root@propertypro.example');
    expect(html).toContain('>You<');
    expect(html).toContain('ops@propertypro.example');
  });

  it('renders the alerts and integrations sections', () => {
    const html = renderToStaticMarkup(
      createElement(PlatformSettings, PROPS),
    );

    // Task 29 landed the first of the three Wave 4 sections. Its presence is
    // asserted through what an operator can see — a component NAME never
    // appears in rendered markup, so `toContain('AlertPrefsSection')` would
    // have been vacuously false either way.
    expect(html).toContain('Alerts &amp; push notifications');
    expect(html).toContain('Production error spikes');

    // Task 32: the integrations section mounts after `InstallAppSection`.
    expect(html).toContain('Integrations');
    expect(html).toContain('Stripe key mode');

    // `InstallAppSection` renders NOTHING until it has mounted and read the
    // browser — every input it has is a client fact — so its button is
    // legitimately absent from static markup and stays asserted-absent here.
    expect(html).not.toContain('Install app');
  });

  it('places the integrations section last', () => {
    const html = renderToStaticMarkup(
      createElement(PlatformSettings, PROPS),
    );

    // Ordering is asserted against the alerts section rather than against
    // `InstallAppSection`, which renders NOTHING on a server pass — an
    // `indexOf` of absent copy returns -1 and would satisfy a "comes before"
    // assertion no matter where the section was mounted.
    const alerts = html.indexOf('Alerts &amp; push notifications');
    const integrations = html.indexOf('Integrations');
    expect(alerts).toBeGreaterThan(-1);
    expect(integrations).toBeGreaterThan(alerts);
  });

  it('does not offer a Remove control for the signed-in admin', () => {
    const html = renderToStaticMarkup(
      createElement(PlatformSettings, PROPS),
    );

    // Two admins: only the non-self one gets a Remove button.
    const removeMatches = html.match(/Remove/g) ?? [];
    expect(removeMatches).toHaveLength(1);
  });
});
