/**
 * `*.getpropertypro.com` is a wildcard domain, so any label not reserved here is
 * claimable by signup and then served by us over our own certificate. These
 * cases pin the categories that make an unreserved name a security problem
 * rather than a cosmetic one — deliberately NOT the whole list, which would be a
 * change-detector that fails on every future addition.
 */
import { describe, expect, it } from 'vitest';

import { isReservedSubdomain, RESERVED_SUBDOMAINS } from '../src/middleware/reserved-subdomains';

describe('isReservedSubdomain', () => {
  // Outlook and Thunderbird fetch these automatically when someone configures
  // an account at our domain and trust the response, so a tenant serving them
  // could redirect mail setup to a server of their choosing.
  it.each(['autodiscover', 'autoconfig'])(
    'reserves the mail-client auto-configuration name %s',
    (name) => {
      expect(isReservedSubdomain(name)).toBe(true);
    },
  );

  it.each(['mail', 'webmail', 'mx', 'smtp', 'imap', 'pop'])(
    'reserves the mail-infrastructure name %s',
    (name) => {
      expect(isReservedSubdomain(name)).toBe(true);
    },
  );

  // A tenant-controlled page here is credential harvesting on our own domain,
  // behind a valid padlock.
  it.each(['secure', 'account', 'accounts', 'billing', 'payments', 'verify', 'auth', 'sso'])(
    'reserves the credibility-borrowing name %s',
    (name) => {
      expect(isReservedSubdomain(name)).toBe(true);
    },
  );

  it.each(['admin', 'api', 'www', 'pm', 'app', 'login', 'signup'])(
    'still reserves the app surface %s',
    (name) => {
      expect(isReservedSubdomain(name)).toBe(true);
    },
  );

  it('matches case-insensitively, since host labels are', () => {
    expect(isReservedSubdomain('AutoDiscover')).toBe(true);
    expect(isReservedSubdomain('MAIL')).toBe(true);
  });

  // The control: reserving must not swallow ordinary community slugs. Without
  // this, a list that returned `true` for everything would satisfy every case
  // above while blocking all signups.
  it.each(['sunset-condos', 'palm-shores-hoa', 'sunset-ridge-apartments', 'oakwood', 'mailbox'])(
    'leaves the ordinary community slug %s claimable',
    (slug) => {
      expect(isReservedSubdomain(slug)).toBe(false);
    },
  );

  it('has no duplicate entries', () => {
    expect(new Set(RESERVED_SUBDOMAINS).size).toBe(RESERVED_SUBDOMAINS.length);
  });

  it('is entirely lowercase, or the case-insensitive lookup would miss', () => {
    expect(RESERVED_SUBDOMAINS.filter((s) => s !== s.toLowerCase())).toEqual([]);
  });
});
