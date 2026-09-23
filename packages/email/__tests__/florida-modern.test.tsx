/**
 * Florida Modern (email system v4) — system-wide guarantees.
 *
 * The per-template text assertions live in templates.test.tsx. This file pins
 * the properties that must hold for EVERY template at once, so a new template
 * or a regression in a shared block cannot slip past:
 *
 *  1. coverage — every file in src/templates/ has a fixture and renders
 *  2. structure — one <h1> (bar the chrome-free support reply)
 *  3. assets — every <img> is absolute https and names a file that exists in
 *     apps/web/public/email (a relative src renders as a broken image in every
 *     client; a missing file 404s only in production)
 *  4. accent — each template draws the accent rule its layout specifies
 *  5. size — the richest render stays under Gmail's ~102 KB clip, which would
 *     otherwise hide the footer and, with it, the unsubscribe link
 *  6. sender — platform mail carries no community address or opt-out
 *  7. injection — community-supplied strings, colours and logo URLs cannot
 *     escape into markup, CSS or a non-https image
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cloneElement, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from '@react-email/components';
import {
  AnnouncementEmail,
  CertificateRequestEmail,
  EmergencyAlertEmail,
  InvitationEmail,
  OtpVerificationEmail,
  PaymentFailedEmail,
} from '../src/index';
import {
  DEFAULT_EMAIL_ASSET_BASE_URL,
  EMAIL_ICONS,
  EMAIL_IMAGES,
} from '../src/components/email-assets';
import { monogram, safeHexColour, safeHttpsUrl } from '../src/components/theme';
import { FIXTURES, bulk, type Accent } from './fixtures/template-fixtures';

const TEMPLATE_DIR = join(__dirname, '../src/templates');
const PUBLIC_EMAIL_DIR = join(__dirname, '../../../apps/web/public/email');

const ACCENT_HEX: Record<Exclude<Accent, 'none'>, string> = {
  coral: '#C2533A',
  amber: '#D97706',
  red: '#B91C1C',
  green: '#047857',
  teal: '#1C5A52',
  violet: '#6D28D9',
  neutral: '#71717A',
};

/** Gmail clips at ~102 KB; keep real headroom for longer user content. */
const SIZE_BUDGET_BYTES = 90 * 1024;

const templateFiles = readdirSync(TEMPLATE_DIR)
  .filter((file) => file.endsWith('.tsx'))
  .map((file) => file.replace(/\.tsx$/, ''))
  .sort();

function imgSrcs(html: string): string[] {
  return [...html.matchAll(/<img[^>]*\ssrc="([^"]*)"/g)].map((match) => match[1]!);
}

function accentRule(html: string): string | null {
  return html.match(/height:4px;background-color:(#[0-9A-Fa-f]{6})/)?.[1]?.toUpperCase() ?? null;
}

describe('coverage', () => {
  it('found the template directory (non-empty population)', () => {
    expect(templateFiles.length).toBe(37);
  });

  it('has a fixture for every template file, and no fixture without a file', () => {
    expect(Object.keys(FIXTURES).sort()).toEqual(templateFiles);
  });
});

describe.each(templateFiles)('%s', (name) => {
  const fixture = FIXTURES[name]!;

  it('renders minimal and rich fixtures', async () => {
    expect(await render(fixture.minimal())).toContain('</html>');
    expect(await render(fixture.rich())).toContain('</html>');
  });

  it('has exactly one <h1> (none for the chrome-free support reply)', async () => {
    const html = await render(fixture.rich());
    const count = (html.match(/<h1[\s>]/g) ?? []).length;
    expect(count).toBe(fixture.sender === 'standalone' ? 0 : 1);
  });

  it('loads every image from an absolute https URL that exists in apps/web/public/email', async () => {
    const html = await render(fixture.rich());
    for (const src of imgSrcs(html)) {
      expect(src, 'relative or insecure image src').toMatch(/^https:\/\//);
      expect(src).not.toContain('assets/');
      if (src.startsWith(DEFAULT_EMAIL_ASSET_BASE_URL)) {
        const file = src.slice(DEFAULT_EMAIL_ASSET_BASE_URL.length);
        expect(existsSync(join(PUBLIC_EMAIL_DIR, file)), `missing asset ${file}`).toBe(true);
      }
    }
  });

  it('draws the accent rule its layout specifies', async () => {
    const html = await render(fixture.rich());
    if (fixture.accent === 'none') {
      expect(accentRule(html)).toBeNull();
    } else {
      expect(accentRule(html)).toBe(ACCENT_HEX[fixture.accent]);
    }
  });

  it('stays under the Gmail clipping budget at its richest', async () => {
    const html = await render(fixture.rich());
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThan(SIZE_BUDGET_BYTES);
  });

  if (fixture.sender === 'platform') {
    it('speaks as PropertyPro even when handed bulk community branding', async () => {
      // Community address, opt-out and colour must not leak into platform mail.
      const html = await render(cloneElement(fixture.rich() as ReactElement<{ branding: unknown }>, { branding: { ...bulk, accentColor: '#1a6b3f' } }));
      expect(html).toContain('logomark-ink.png');
      expect(html).toContain('PropertyPro Florida, Inc.');
      expect(html).not.toContain('Gulf Shore Blvd');
      expect(html).not.toContain('Unsubscribe');
      expect(html).not.toContain('Notification preferences');
      expect(html.toLowerCase()).not.toContain('#1a6b3f');
    });
  }
});

describe('assets', () => {
  it('ships every icon and image the templates can reference', () => {
    for (const icon of EMAIL_ICONS) {
      expect(existsSync(join(PUBLIC_EMAIL_DIR, 'icons', `${icon}.png`)), icon).toBe(true);
    }
    for (const image of EMAIL_IMAGES) {
      expect(existsSync(join(PUBLIC_EMAIL_DIR, image)), image).toBe(true);
    }
  });

  describe('EMAIL_ASSET_BASE_URL', () => {
    const original = process.env.EMAIL_ASSET_BASE_URL;
    afterEach(() => {
      if (original === undefined) delete process.env.EMAIL_ASSET_BASE_URL;
      else process.env.EMAIL_ASSET_BASE_URL = original;
    });

    it('re-points every asset at render time, trailing slash tolerated', async () => {
      process.env.EMAIL_ASSET_BASE_URL = 'https://preview.example.com/email/';
      const html = await render(FIXTURES['welcome-email']!.rich());
      const srcs = imgSrcs(html);
      expect(srcs.length).toBeGreaterThan(0);
      for (const src of srcs) expect(src.startsWith('https://preview.example.com/email/')).toBe(true);
      expect(html).not.toContain('email//');
    });
  });
});

describe('state-driven accents', () => {
  it('export-ready turns amber only when warnings exist', async () => {
    expect(accentRule(await render(FIXTURES['community-export-ready-email']!.minimal()))).toBe(ACCENT_HEX.coral);
    expect(accentRule(await render(FIXTURES['community-export-ready-email']!.rich()))).toBe(ACCENT_HEX.amber);
  });
});

describe('association footer', () => {
  it('renders one unsubscribe link, the address and preferences for bulk mail', async () => {
    const html = await render(FIXTURES['announcement-email']!.rich());
    expect(html.match(/notifications\/unsubscribe\?token=abc/g)).toHaveLength(1);
    for (const line of bulk.postalAddressLines!) expect(html).toContain(line);
    expect(html).toContain('Notification preferences');
  });

  it.each(['insurance-alert-email', 'snowbird-digest-email'])(
    '%s routes its own unsubscribe prop through the shared footer exactly once',
    async (name) => {
      const html = await render(FIXTURES[name]!.rich());
      expect(html.match(/unsubscribe\?token=/g)).toHaveLength(1);
    },
  );
});

describe('injection', () => {
  const base = {
    recipientName: 'Marisol',
    announcementTitle: 'Notice',
    authorName: 'Board',
    portalUrl: 'https://example.com/a',
  };

  it('escapes markup in user-authored text', async () => {
    const html = await render(
      <AnnouncementEmail
        branding={{ communityName: '<img src=x onerror=alert(1)>' }}
        announcementBody={'<script>alert(1)</script>'}
        {...base}
      />,
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('refuses a non-hex accent colour (no CSS declaration smuggling)', async () => {
    const html = await render(
      <InvitationEmail
        branding={{ communityName: 'Sunset', accentColor: 'red;background:url(https://tracker.example/p.gif)' }}
        inviteeName="A"
        inviterName="B"
        role="Owner"
        inviteUrl="https://example.com/i"
      />,
    );
    expect(html).not.toContain('tracker.example');
    expect(accentRule(html)).toBe(ACCENT_HEX.coral);
  });

  it.each([
    ['javascript:alert(1)'],
    ['http://insecure.example.com/logo.png'],
    ['data:image/png;base64,AAAA'],
    ['not a url'],
  ])('drops logoUrl %s and falls back to the monogram', async (logoUrl) => {
    const html = await render(
      <AnnouncementEmail branding={{ communityName: 'Sunset Palms HOA', logoUrl }} announcementBody="x" {...base} />,
    );
    expect(html).not.toContain(logoUrl);
    expect(html).toContain('>SP<');
  });

  it('unit: validators and monogram', () => {
    expect(safeHexColour('#1a6b3f')).toBe('#1a6b3f');
    expect(safeHexColour('#1a6b3f; x')).toBeUndefined();
    expect(safeHttpsUrl('https://cdn.example.com/l.png')).toBe('https://cdn.example.com/l.png');
    expect(safeHttpsUrl('//cdn.example.com/l.png')).toBeUndefined();
    expect(monogram('Sunset Palms HOA')).toBe('SP');
    expect(monogram('The Palms of Naples')).toBe('PN');
    expect(monogram('   ')).toBe('PP');
  });
});

/**
 * Optional data slots: each design block that needs data today's callers do
 * not send renders ONLY when the caller supplies it. `marker` is text that can
 * only come from the slot, so its absence in the minimal render proves the
 * template invents nothing.
 */
describe('optional data slots render only when supplied', () => {
  it.each([
    ['assessment-due-reminder', 'Late fees start October 11'],
    ['assessment-due-reminder', 'Period covered'],
    ['assessment-payment-received', 'PP-8FQ2-41K9'],
    ['compliance-alert-email', 'Year-end balance sheet'],
    ['esign-invitation-email', 'Priya Raman'],
    ['access-request-pending', 'Name matches deed'],
    ['otp-verification', 'Safari on iPhone'],
    ['password-reset-email', 'Chrome on macOS'],
    ['payment-failed', 'Final attempt'],
    ['subscription-expiry-warning', 'Stays on'],
    ['signup-verification-email', 'about 4 minutes'],
  ])('%s: "%s"', async (name, marker) => {
    const fixture = FIXTURES[name]!;
    expect(await render(fixture.rich())).toContain(marker.replace(/&/g, '&amp;'));
    expect(await render(fixture.minimal())).not.toContain(marker.replace(/&/g, '&amp;'));
  });
});

describe('line breaks survive Outlook desktop', () => {
  // Outlook's Word engine ignores `white-space`, so a break must be a real <br>.
  it('no template relies on white-space: pre-line', async () => {
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      for (const variant of [fixture.minimal, fixture.rich]) {
        expect(await render(variant()), name).not.toMatch(/white-space:\s*pre-line/);
      }
    }
  });

  it('emergency alert: each body line is separated by <br>', async () => {
    const html = await render(
      <EmergencyAlertEmail
        branding={{ communityName: 'Sunset Palms HOA' }}
        recipientName="Marisol"
        alertTitle="Evacuate"
        alertBody={'Leave by the east stairs.\nDo not use the elevators.\nMeet at the pool deck.'}
        severity="emergency"
        sentAt="5:12 AM"
      />,
    );
    expect(html).toMatch(/Leave by the east stairs\.<br\/?>Do not use the elevators\.<br\/?>Meet at the pool deck\./);
  });

  it('certificate request: single line breaks inside a paragraph become <br>', async () => {
    const html = await render(<CertificateRequestEmail body={'Unit: 412\nOwner: Dana Reyes\n\nThank you.'} />);
    expect(html).toMatch(/Unit: 412<br\/?>Owner: Dana Reyes/);
  });
});

describe('payment failed without a known amount', () => {
  it('omits the balance figure and never prints a placeholder as money', async () => {
    const html = await render(
      <PaymentFailedEmail
        branding={{ communityName: 'Sunset Palms HOA' }}
        recipientName="Dana"
        amountDue={null}
        lastFourDigits={null}
        billingPortalUrl="https://example.com/billing"
      />,
    );
    expect(html).not.toContain('Outstanding balance');
    expect(html).not.toMatch(/null|undefined|overdue amount|unknown amount/);
    expect(html).toContain('your latest payment');
    expect(html).toContain('Action required: A payment failed');
  });
});

describe('OTP preview text', () => {
  it('does not put the code in the inbox preview', async () => {
    const html = await render(
      <OtpVerificationEmail branding={{ communityName: 'Sunset Palms HOA' }} recipientName="Marisol" otpCode="481902" />,
    );
    // The code appears once, in the body — not in the hidden preheader.
    expect(html.split('481902')).toHaveLength(2);
    expect(html).toContain('Your verification code');
  });
});
