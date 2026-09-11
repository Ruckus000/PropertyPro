// @vitest-environment jsdom
/**
 * The behaviour under test is the INDETERMINATE case, three times over:
 *
 *  1. A service whose probe could not run (`unknown`) must read `Not checked`,
 *     never `Down`.
 *  2. A Stripe key that could not be parsed (`null`) must read `Not
 *     configured`, never `Test mode`.
 *  3. Sentry, which has no `ServiceStatus` row at all, must read `Not checked`
 *     when the report's `errors` are `null` — and must say so on the row,
 *     because that state hides a real failure.
 *
 * Each case is paired with the working and broken renderings it must stay
 * distinct from, so a change that collapses three states into two reddens here.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  IntegrationsSection,
  buildIntegrationRows,
  modeKeyFor,
  type IntegrationsSectionProps,
} from '@/components/settings/IntegrationsSection';
import type { ServiceStatus } from '@/lib/server/health';

function service(over: Partial<ServiceStatus> & Pick<ServiceStatus, 'name'>): ServiceStatus {
  return { state: 'ok', short: 'Reachable', meta: '12 ms', ...over };
}

/** Every prop, every time — an omitted one silently pins the falsy path. */
function props(over: Partial<IntegrationsSectionProps> = {}): IntegrationsSectionProps {
  return {
    services: [
      service({ name: 'Stripe webhooks', short: 'Processing', meta: '81 ms' }),
      service({ name: 'Resend' }),
      service({ name: 'Supabase' }),
    ],
    sentryAnswered: true,
    stripeLivemode: false,
    ...over,
  };
}

function render(over: Partial<IntegrationsSectionProps> = {}): string {
  return renderToStaticMarkup(createElement(IntegrationsSection, props(over)));
}

describe('IntegrationsSection — the four rows', () => {
  it('names all four integrations and the Stripe mode row', () => {
    const html = render();
    for (const name of ['Stripe', 'Sentry', 'Resend', 'Supabase', 'Stripe key mode']) {
      expect(html).toContain(`>${name}</p>`);
    }
  });

  it('maps a healthy probe to Healthy and carries the probe detail through', () => {
    const html = render();
    expect(html).toContain('Healthy');
    expect(html).toContain('81 ms');
    expect(html).toContain('Processing');
  });

  it('maps down and degraded probes to distinct words, not just distinct colours', () => {
    const html = render({
      services: [
        service({ name: 'Stripe webhooks', state: 'down', short: 'API failed', meta: 'ECONNRESET' }),
        service({ name: 'Resend', state: 'degraded', short: '3/hr', meta: 'slow' }),
        service({ name: 'Supabase' }),
      ],
    });

    expect(html).toContain('Down');
    expect(html).toContain('Degraded');
    expect(html).toContain('ECONNRESET');
  });

  it('reads a service missing from the report as Not checked, not as a failure', () => {
    const html = render({ services: [] });

    expect(html).toContain('Not checked');
    expect(html).toContain('The health report carried no &quot;Resend&quot; service.');
    expect(html).not.toContain('>Down<');
  });
});

describe('IntegrationsSection — unknown is not down', () => {
  it('renders an unprobed service as Not checked and never as Down', () => {
    const html = render({
      services: [
        service({
          name: 'Resend',
          state: 'unknown',
          short: 'Not configured',
          meta: 'RESEND_API_KEY is not set',
        }),
        service({ name: 'Stripe webhooks' }),
        service({ name: 'Supabase' }),
      ],
    });

    expect(html).toContain('Not checked');
    expect(html).toContain('RESEND_API_KEY is not set');
    // The whole point: an unset env var must not be painted as an outage.
    expect(html).not.toContain('>Down<');
  });

  it('still renders Down when a probe actually ran and failed', () => {
    const html = render({
      services: [
        service({ name: 'Resend', state: 'down', short: 'Unreachable', meta: 'fetch failed' }),
        service({ name: 'Stripe webhooks' }),
        service({ name: 'Supabase' }),
      ],
    });

    expect(html).toContain('Down');
    expect(html).toContain('fetch failed');
  });
});

describe('IntegrationsSection — Sentry has no service row', () => {
  it('reads an answered Sentry as Healthy', () => {
    const html = render({ sentryAnswered: true });
    expect(html).toContain('Issues were read for the current health report.');
  });

  it('reads an unanswered Sentry as Not checked and admits it cannot say Down', () => {
    const html = render({ sentryAnswered: false });

    expect(html).toContain('Not checked');
    expect(html).toContain('SENTRY_API_TOKEN or SENTRY_ORG is unset, or the last read failed');
    expect(html).toContain('this row never reads');
    // `Not checked` alone is not enough: it is also this row's `short` text, so
    // it renders whatever the badge says. The badge must NOT say `Down` — every
    // other row is healthy in this fixture, so any `>Down<` is this one's.
    expect(html).not.toContain('>Down<');
  });

  it('derives the Sentry row without consulting services', () => {
    const rows = buildIntegrationRows({ services: [], sentryAnswered: true });
    const sentry = rows.find((row) => row.name === 'Sentry');
    expect(sentry?.state).toBe('ok');
  });
});

describe('IntegrationsSection — Stripe key mode', () => {
  it('labels a live key Live mode', () => {
    const html = render({ stripeLivemode: true });
    expect(html).toContain('Live mode');
    expect(html).not.toContain('Test mode');
    expect(html).not.toContain('Not configured');
  });

  it('labels a test key Test mode', () => {
    const html = render({ stripeLivemode: false });
    expect(html).toContain('Test mode');
    expect(html).not.toContain('Live mode');
  });

  it('labels an undeterminable key Not configured — NEVER Test mode', () => {
    const html = render({ stripeLivemode: null });

    expect(html).toContain('Not configured');
    expect(html).toContain('the mode could not be determined');
    // `null` and `false` are different facts. Rendering `null` as "Test mode"
    // states a mode this deployment does not have.
    expect(html).not.toContain('Test mode');
    expect(html).not.toContain('Live mode');
  });

  it('maps the three inputs to three distinct presentations', () => {
    expect(modeKeyFor(true)).toBe('live');
    expect(modeKeyFor(false)).toBe('test');
    expect(modeKeyFor(null)).toBe('unknown');
  });
});

describe('IntegrationsSection — accessibility', () => {
  it('labels its section by its own heading and hides decorative icons', () => {
    const html = render();
    expect(html).toContain('aria-labelledby="settings-integrations"');
    expect(html).toContain('id="settings-integrations"');
    expect(html).toContain('aria-hidden="true"');
  });
});
